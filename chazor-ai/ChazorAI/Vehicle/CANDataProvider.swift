import Foundation

/// A raw CAN frame as delivered by an external gateway.
///
/// iOS gives no application access to a vehicle bus, so frames can only arrive from an
/// accessory (a BLE/Wi-Fi CAN gateway or an MFi accessory). This type is the boundary.
struct CANFrame: Equatable, Sendable {
    /// 11-bit or 29-bit arbitration identifier.
    var identifier: UInt32
    var payload: [UInt8]
    var timestamp: Date
}

/// Decodes one signal out of a CAN frame — the subset of a DBC definition this app needs.
struct CANSignalDefinition: Equatable, Sendable {
    var name: String
    var frameID: UInt32
    /// Bit offset of the signal inside the payload, counted from the most significant bit
    /// of byte 0 (big-endian / Motorola layout).
    var startBit: Int
    var bitLength: Int
    var isBigEndian: Bool
    var isSigned: Bool
    var scale: Double
    var offset: Double
    var unit: String
}

/// Big-endian and little-endian signal extraction. Pure and unit-tested; a decoder that is
/// wrong by one bit produces plausible-looking nonsense, so this is worth testing properly.
enum CANDecoder {

    static func rawValue(of definition: CANSignalDefinition, in payload: [UInt8]) -> UInt64? {
        guard definition.bitLength > 0, definition.bitLength <= 64, definition.startBit >= 0 else { return nil }
        let totalBits = payload.count * 8
        var raw: UInt64 = 0

        if definition.isBigEndian {
            // Motorola layout: `startBit` is the signal's most significant bit, bits are
            // numbered MSB-first inside each byte and run forward through the payload.
            for index in 0..<definition.bitLength {
                let position = definition.startBit + index
                guard position < totalBits else { return nil }
                let bit = (payload[position / 8] >> UInt8(7 - (position % 8))) & 0x01
                raw = (raw << 1) | UInt64(bit)
            }
        } else {
            // Intel layout: `startBit` is the signal's least significant bit, and bit 0 is
            // the least significant bit of byte 0.
            for index in 0..<definition.bitLength {
                let position = definition.startBit + index
                guard position < totalBits else { return nil }
                let bit = (payload[position / 8] >> UInt8(position % 8)) & 0x01
                raw |= UInt64(bit) << UInt64(index)
            }
        }
        return raw
    }

    static func physicalValue(of definition: CANSignalDefinition, in frame: CANFrame) -> Double? {
        guard frame.identifier == definition.frameID else { return nil }
        guard let raw = rawValue(of: definition, in: frame.payload) else { return nil }

        var value = Double(raw)
        if definition.isSigned, definition.bitLength < 64 {
            let signBit = UInt64(1) << UInt64(definition.bitLength - 1)
            if raw & signBit != 0 {
                value = Double(Int64(raw) - Int64(UInt64(1) << UInt64(definition.bitLength)))
            }
        }
        return value * definition.scale + definition.offset
    }
}

/// Named signals the app knows how to display. A concrete vehicle supplies the bit layout.
enum CANSignalName: String, CaseIterable, Sendable {
    case vehicleSpeed
    case stateOfCharge
    case coolantTemperature
    case auxiliaryVoltage
    case odometer
    case driveMode
}

/// A per-vehicle map from signal names to bit layouts.
///
/// **No map for the BYD Chazor ships with this app.** Its CAN matrix is not public, and
/// guessing identifiers and bit offsets would put wrong numbers in front of a driver.
/// A map must be supplied from a documented source (a licensed DBC file, or the vehicle
/// manufacturer) before this provider reports anything.
struct CANSignalMap: Sendable {
    var vehicle: VehicleIdentity
    var signals: [CANSignalName: CANSignalDefinition]

    static let empty = CANSignalMap(vehicle: .chazor, signals: [:])

    var isUsable: Bool { !signals.isEmpty }
}

/// Read-only CAN ingestion.
///
/// The class deliberately exposes no send/write/transmit member. It cannot request,
/// acknowledge or inject a frame; it only decodes what a gateway hands it. See
/// `Docs/SAFETY.md` for why this is a hard boundary rather than a convention.
@MainActor
final class CANDataProvider: VehicleDataProvider {

    let sourceID: VehicleDataSourceID = .can
    private(set) var connectionState: ConnectionState = .disconnected

    let frames: AsyncStream<VehicleFrame>
    private let continuation: AsyncStream<VehicleFrame>.Continuation

    private let signalMap: CANSignalMap
    private var latestFrame: VehicleFrame = .placeholder
    private var tripAccumulator = OBDTripAccumulator()

    init(signalMap: CANSignalMap = .empty) {
        self.signalMap = signalMap
        let (stream, continuation) = AsyncStream<VehicleFrame>.makeStream(
            of: VehicleFrame.self,
            bufferingPolicy: .bufferingNewest(1)
        )
        self.frames = stream
        self.continuation = continuation
    }

    deinit {
        continuation.finish()
    }

    func connect() {
        guard signalMap.isUsable else {
            connectionState = .failed(reason: "No CAN signal map for \(signalMap.vehicle.displayName)")
            return
        }
        // TODO: attach to the CAN gateway accessory session here. The gateway is expected to
        // call `ingest(_:)` for every frame it receives. Nothing in this class talks back to it.
        connectionState = .connected(sourceName: "CAN gateway")
    }

    func disconnect() {
        connectionState = .disconnected
    }

    /// Entry point for a gateway. Decoding is best-effort: unknown identifiers are ignored.
    func ingest(_ frame: CANFrame) {
        guard signalMap.isUsable else { return }
        var updated = latestFrame

        for (name, definition) in signalMap.signals {
            guard let value = CANDecoder.physicalValue(of: definition, in: frame) else { continue }
            switch name {
            case .vehicleSpeed: updated.vehicle.speedKph = value
            case .stateOfCharge: updated.battery.stateOfChargePercent = value
            case .coolantTemperature: updated.vehicle.coolantTemperatureC = value
            case .auxiliaryVoltage: updated.battery.auxiliaryVoltage = value
            case .odometer: updated.vehicle.odometerKm = value
            case .driveMode: updated.vehicle.driveMode = value >= 1 ? .hev : .ev
            }
        }

        updated.vehicle.timestamp = frame.timestamp
        updated.battery.timestamp = frame.timestamp
        updated.trip = tripAccumulator.update(
            speedKph: updated.vehicle.speedKph,
            fuelRateLitresPerHour: nil,
            isElectric: updated.vehicle.driveMode == .ev,
            at: frame.timestamp
        )

        latestFrame = updated
        continuation.yield(updated)
    }

    func getVehicleStatus() async throws -> VehicleStatusSnapshot {
        try requireMap()
        return latestFrame.vehicle
    }

    func getBatteryStatus() async throws -> BatteryStatusSnapshot {
        try requireMap()
        return latestFrame.battery
    }

    func getDiagnostics() async throws -> DiagnosticsSnapshot {
        try requireMap()
        return latestFrame.diagnostics
    }

    func getTripData() async throws -> TripSnapshot {
        try requireMap()
        return latestFrame.trip
    }

    private func requireMap() throws {
        guard signalMap.isUsable else {
            throw VehicleDataError.requiresManufacturerDefinition("CAN signal map for \(signalMap.vehicle.displayName)")
        }
    }
}
