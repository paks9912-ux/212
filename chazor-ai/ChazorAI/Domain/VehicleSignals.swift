import Foundation

/// Immutable snapshots produced by a `VehicleDataProvider`.
///
/// These types are deliberately free of UI, persistence and transport concerns so that
/// the same structures can be produced by the mock generator, by a Bluetooth OBD-II
/// adapter or by a CAN gateway without touching any other layer.

// MARK: - Drive mode

enum DriveMode: String, Codable, CaseIterable, Sendable {
    case ev = "EV"
    case hev = "HEV"
    case charging = "CHARGING"
    case unknown = "UNKNOWN"

    var displayName: String { rawValue }
}

// MARK: - Connection

enum ConnectionState: Equatable, Sendable {
    case disconnected
    case scanning
    case connecting
    case connected(sourceName: String)
    case failed(reason: String)

    var isConnected: Bool {
        if case .connected = self { return true }
        return false
    }

    var displayName: String {
        switch self {
        case .disconnected: return "DISCONNECTED"
        case .scanning: return "SCANNING"
        case .connecting: return "CONNECTING"
        case .connected(let name): return name.uppercased()
        case .failed: return "ERROR"
        }
    }
}

// MARK: - Snapshots

struct VehicleStatusSnapshot: Codable, Equatable, Sendable {
    var speedKph: Double
    var driveMode: DriveMode
    var coolantTemperatureC: Double
    var odometerKm: Double
    var ambientTemperatureC: Double?
    var timestamp: Date

    static let placeholder = VehicleStatusSnapshot(
        speedKph: 0,
        driveMode: .ev,
        coolantTemperatureC: 78,
        odometerKm: 84_320,
        ambientTemperatureC: 18,
        timestamp: .distantPast
    )
}

struct BatteryStatusSnapshot: Codable, Equatable, Sendable {
    /// Traction battery state of charge, 0...100.
    var stateOfChargePercent: Double
    /// Remaining electric-only range as reported by the vehicle, in kilometres.
    var estimatedRangeKm: Double
    /// Auxiliary (12 V) battery voltage.
    var auxiliaryVoltage: Double
    var packTemperatureC: Double?
    var isCharging: Bool
    var timestamp: Date

    static let placeholder = BatteryStatusSnapshot(
        stateOfChargePercent: 74,
        estimatedRangeKm: 82,
        auxiliaryVoltage: 12.6,
        packTemperatureC: 28,
        isCharging: false,
        timestamp: .distantPast
    )
}

struct TroubleCode: Codable, Equatable, Identifiable, Sendable {
    var id: String { code }
    /// Standard OBD-II diagnostic trouble code, e.g. `P0420`.
    var code: String
    var descriptionText: String
    var isPending: Bool
    var detectedAt: Date
}

struct DiagnosticsSnapshot: Codable, Equatable, Sendable {
    var troubleCodes: [TroubleCode]
    var milOn: Bool
    var timestamp: Date

    var errorCount: Int { troubleCodes.count }

    static let placeholder = DiagnosticsSnapshot(troubleCodes: [], milOn: false, timestamp: .distantPast)
}

/// Live statistics for the trip currently in progress.
struct TripSnapshot: Codable, Equatable, Sendable {
    var distanceKm: Double
    var duration: TimeInterval
    var averageSpeedKph: Double
    /// Combustion fuel consumption in litres per 100 km.
    var consumptionLper100km: Double
    /// Share of the distance covered in pure electric mode, 0...100.
    var evPercentage: Double
    var startedAt: Date

    var hevPercentage: Double { max(0, 100 - evPercentage) }

    static let placeholder = TripSnapshot(
        distanceKm: 24.7,
        duration: 38 * 60,
        averageSpeedKph: 39,
        consumptionLper100km: 4.3,
        evPercentage: 71,
        startedAt: .distantPast
    )
}

/// One coherent tick of vehicle data. Providers emit frames; the telemetry store fans them out.
struct VehicleFrame: Equatable, Sendable {
    var vehicle: VehicleStatusSnapshot
    var battery: BatteryStatusSnapshot
    var diagnostics: DiagnosticsSnapshot
    var trip: TripSnapshot

    static let placeholder = VehicleFrame(
        vehicle: .placeholder,
        battery: .placeholder,
        diagnostics: .placeholder,
        trip: .placeholder
    )
}

// MARK: - Identity

struct VehicleIdentity: Codable, Equatable, Sendable {
    var make: String
    var model: String
    var modelYear: Int?
    /// Never rendered in full in the UI — VIN is personal data.
    var vin: String?

    var displayName: String { "\(make) \(model)" }

    static let chazor = VehicleIdentity(make: "BYD", model: "Chazor", modelYear: 2025, vin: nil)
}
