import CoreBluetooth
import Foundation

/// Reads the car through a Bluetooth Low Energy ELM327-compatible OBD-II adapter.
///
/// What is implemented here: BLE discovery of the serial-port services used by the common
/// adapters, connection handling, the ELM327 line protocol (commands terminated by the
/// `>` prompt, with timeouts and a serial command queue), the adapter init sequence and
/// polling of the standard SAE J1979 PIDs that the app's screens need.
///
/// What is **not** implemented, on purpose: anything BYD-specific. Traction-battery state
/// of charge, EV/HEV mode and the factory trip computer are not part of the generic OBD-II
/// standard, and their manufacturer PIDs are not published. Those values are reported as
/// `VehicleDataError.requiresManufacturerDefinition` until they can be confirmed against a
/// real Chazor with a documented PID list — guessing at a proprietary protocol would produce
/// numbers that look right and are wrong, which is worse than showing nothing.
///
/// Safety: every command goes through `OBDCommand`, which only accepts read services
/// (01, 02, 03, 07, 09, 0A) and adapter-configuration AT commands. There is no code path
/// in this class that can write to the vehicle bus.
@MainActor
final class BluetoothOBDProvider: NSObject, VehicleDataProvider {

    // MARK: Known adapter services
    //
    // ELM327 BLE clones expose a serial port under one of a few well-known 16-bit UUIDs.
    // Each entry is (service, notify characteristic, write characteristic).
    private struct SerialProfile {
        let service: CBUUID
        let notify: CBUUID
        let write: CBUUID
    }

    private static let knownProfiles: [SerialProfile] = [
        SerialProfile(service: CBUUID(string: "FFF0"), notify: CBUUID(string: "FFF1"), write: CBUUID(string: "FFF2")),
        SerialProfile(service: CBUUID(string: "FFE0"), notify: CBUUID(string: "FFE1"), write: CBUUID(string: "FFE1")),
        SerialProfile(service: CBUUID(string: "18F0"), notify: CBUUID(string: "2AF0"), write: CBUUID(string: "2AF1"))
    ]

    private static let serviceUUIDs = knownProfiles.map(\.service)

    // MARK: Provider surface

    let sourceID: VehicleDataSourceID = .bluetoothOBD
    private(set) var connectionState: ConnectionState = .disconnected {
        didSet { onConnectionStateChange?(connectionState) }
    }

    /// Set by the telemetry store so connection changes reach the UI.
    var onConnectionStateChange: ((ConnectionState) -> Void)?

    let frames: AsyncStream<VehicleFrame>
    private let continuation: AsyncStream<VehicleFrame>.Continuation

    // MARK: Bluetooth state

    private var central: CBCentralManager?
    private var peripheral: CBPeripheral?
    private var notifyCharacteristic: CBCharacteristic?
    private var writeCharacteristic: CBCharacteristic?
    private var activeProfile: SerialProfile?

    // MARK: Command plumbing

    private var responseBuffer = ""
    private var pendingCommand: (command: OBDCommand, continuation: CheckedContinuation<String, Error>)?
    private var commandTimeoutTask: Task<Void, Never>?
    private var pollTask: Task<Void, Never>?
    private var isAdapterReady = false

    /// Longest an adapter may take to answer a single command.
    private let commandTimeout: Duration = .seconds(4)
    private let pollInterval: Duration = .seconds(1)

    // MARK: Latest values

    private var latestFrame: VehicleFrame
    private var supportsHybridPackPID = true
    private var tripAccumulator = OBDTripAccumulator()

    init(startingOdometerKm: Double = 0) {
        var frame = VehicleFrame.placeholder
        frame.vehicle.odometerKm = startingOdometerKm
        frame.vehicle.speedKph = 0
        frame.trip = TripSnapshot(
            distanceKm: 0, duration: 0, averageSpeedKph: 0,
            consumptionLper100km: 0, evPercentage: 0, startedAt: .now
        )
        self.latestFrame = frame

        let (stream, continuation) = AsyncStream<VehicleFrame>.makeStream(
            of: VehicleFrame.self,
            bufferingPolicy: .bufferingNewest(1)
        )
        self.frames = stream
        self.continuation = continuation
        super.init()
    }

    deinit {
        continuation.finish()
    }

    // MARK: VehicleDataProvider

    func connect() {
        guard central == nil else { return }
        connectionState = .scanning
        // Delegate callbacks are delivered on the main queue, which is what lets the
        // nonisolated delegate methods below hop straight back onto the main actor.
        central = CBCentralManager(delegate: self, queue: .main)
    }

    func disconnect() {
        pollTask?.cancel()
        pollTask = nil
        commandTimeoutTask?.cancel()
        commandTimeoutTask = nil
        failPendingCommand(with: VehicleDataError.notConnected)

        if let peripheral, let central {
            central.cancelPeripheralConnection(peripheral)
        }
        central?.stopScan()
        central = nil
        self.peripheral = nil
        notifyCharacteristic = nil
        writeCharacteristic = nil
        activeProfile = nil
        isAdapterReady = false
        connectionState = .disconnected
    }

    func getVehicleStatus() async throws -> VehicleStatusSnapshot {
        try requireReadyAdapter()
        return latestFrame.vehicle
    }

    func getBatteryStatus() async throws -> BatteryStatusSnapshot {
        try requireReadyAdapter()
        guard supportsHybridPackPID else {
            // The 12 V reading is genuine; the traction pack is not available generically.
            throw VehicleDataError.requiresManufacturerDefinition("Traction battery state of charge")
        }
        return latestFrame.battery
    }

    func getDiagnostics() async throws -> DiagnosticsSnapshot {
        try requireReadyAdapter()
        return latestFrame.diagnostics
    }

    func getTripData() async throws -> TripSnapshot {
        try requireReadyAdapter()
        return latestFrame.trip
    }

    private func requireReadyAdapter() throws {
        guard isAdapterReady else { throw VehicleDataError.notConnected }
    }

    // MARK: Adapter session

    private func startSession() {
        pollTask?.cancel()
        pollTask = Task { [weak self] in
            guard let self else { return }
            do {
                try await self.runInitSequence()
            } catch {
                self.connectionState = .failed(reason: error.localizedDescription)
                return
            }
            self.isAdapterReady = true
            self.connectionState = .connected(sourceName: self.peripheral?.name ?? "OBD adapter")

            while !Task.isCancelled {
                await self.pollOnce()
                try? await Task.sleep(for: self.pollInterval)
            }
        }
    }

    /// ELM327 warm-up: reset, silence the echo and formatting, let it pick the protocol,
    /// then confirm the vehicle answers a mode-01 request.
    private func runInitSequence() async throws {
        _ = try await send(.reset)
        _ = try await send(.echoOff)
        _ = try await send(.linefeedsOff)
        _ = try await send(.spacesOff)
        _ = try await send(.headersOff)
        _ = try await send(.autoProtocol)
        let supported = try await send(.supportedPIDs)
        guard !OBDResponseParser.isNoData(supported) else {
            throw VehicleDataError.adapterError("Vehicle did not answer — is the ignition on?")
        }
    }

    private func pollOnce() async {
        var frame = latestFrame
        let now = Date()

        if let speed = try? await value(.vehicleSpeed, parser: OBDResponseParser.vehicleSpeedKph) {
            frame.vehicle.speedKph = speed
        }
        if let coolant = try? await value(.coolantTemperature, parser: OBDResponseParser.coolantTemperatureC) {
            frame.vehicle.coolantTemperatureC = coolant
        }
        if let volts = try? await value(.controlModuleVoltage, parser: OBDResponseParser.controlModuleVoltage) {
            frame.battery.auxiliaryVoltage = volts
        } else if let volts = try? await value(.adapterVoltage, parser: OBDResponseParser.adapterVoltage) {
            frame.battery.auxiliaryVoltage = volts
        }
        if supportsHybridPackPID {
            if let soc = try? await value(.hybridPackRemainingLife, parser: OBDResponseParser.hybridPackRemainingLifePercent) {
                frame.battery.stateOfChargePercent = soc
            } else {
                // Asked once, answered "NO DATA": stop polling a PID this car does not have.
                supportsHybridPackPID = false
            }
        }

        let rpm = try? await value(.engineRPM, parser: OBDResponseParser.engineRPM)
        let fuelRate = try? await value(.engineFuelRate, parser: OBDResponseParser.engineFuelRateLitresPerHour)

        // With no manufacturer PID for the drive mode, engine speed is the honest proxy:
        // a running combustion engine means the car is not in electric-only mode.
        if let rpm {
            frame.vehicle.driveMode = rpm > 400 ? .hev : .ev
        } else {
            frame.vehicle.driveMode = .unknown
        }

        if let codes = try? await troubleCodes() {
            frame.diagnostics = DiagnosticsSnapshot(
                troubleCodes: codes,
                milOn: codes.contains { !$0.isPending },
                timestamp: now
            )
        }

        frame.vehicle.timestamp = now
        frame.battery.timestamp = now
        frame.trip = tripAccumulator.update(
            speedKph: frame.vehicle.speedKph,
            fuelRateLitresPerHour: fuelRate,
            isElectric: frame.vehicle.driveMode == .ev,
            at: now
        )

        latestFrame = frame
        continuation.yield(frame)
    }

    private func troubleCodes() async throws -> [TroubleCode] {
        let stored = try await send(.storedTroubleCodes)
        let pending = (try? await send(.pendingTroubleCodes)) ?? ""
        return OBDResponseParser.troubleCodes(stored)
            + OBDResponseParser.troubleCodes(pending, isPending: true)
    }

    private func value<T>(_ command: OBDCommand, parser: (String) -> T?) async throws -> T {
        let response = try await send(command)
        guard let parsed = parser(response) else {
            throw VehicleDataError.unsupportedParameter(command.text)
        }
        return parsed
    }

    // MARK: ELM327 line protocol

    /// Sends one command and waits for the `>` prompt that terminates its answer.
    /// Commands are strictly serialised — ELM327 adapters cannot pipeline.
    private func send(_ command: OBDCommand) async throws -> String {
        guard let peripheral, let writeCharacteristic else { throw VehicleDataError.notConnected }
        guard pendingCommand == nil else { throw VehicleDataError.adapterError("Adapter is busy") }
        guard let payload = (command.text + "\r").data(using: .ascii) else {
            throw VehicleDataError.adapterError("Command is not ASCII")
        }

        responseBuffer = ""
        let writeType: CBCharacteristicWriteType = writeCharacteristic.properties.contains(.write)
            ? .withResponse
            : .withoutResponse

        return try await withCheckedThrowingContinuation { continuation in
            pendingCommand = (command, continuation)
            startCommandTimeout()
            peripheral.writeValue(payload, for: writeCharacteristic, type: writeType)
        }
    }

    private func startCommandTimeout() {
        commandTimeoutTask?.cancel()
        commandTimeoutTask = Task { [weak self, commandTimeout] in
            try? await Task.sleep(for: commandTimeout)
            guard !Task.isCancelled, let self else { return }
            self.failPendingCommand(with: VehicleDataError.adapterTimeout)
        }
    }

    private func completePendingCommand(with response: String) {
        commandTimeoutTask?.cancel()
        commandTimeoutTask = nil
        guard let pending = pendingCommand else { return }
        pendingCommand = nil
        pending.continuation.resume(returning: response)
    }

    private func failPendingCommand(with error: Error) {
        commandTimeoutTask?.cancel()
        commandTimeoutTask = nil
        guard let pending = pendingCommand else { return }
        pendingCommand = nil
        pending.continuation.resume(throwing: error)
    }

    private func handleIncoming(_ data: Data) {
        guard let text = String(data: data, encoding: .ascii) ?? String(data: data, encoding: .utf8) else { return }
        responseBuffer += text
        // The prompt character marks the end of the adapter's answer.
        guard responseBuffer.contains(">") else { return }
        let response = responseBuffer
            .replacingOccurrences(of: ">", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        responseBuffer = ""
        completePendingCommand(with: response)
    }
}

// MARK: - CBCentralManagerDelegate

extension BluetoothOBDProvider: CBCentralManagerDelegate {

    nonisolated func centralManagerDidUpdateState(_ central: CBCentralManager) {
        MainActor.assumeIsolated {
            switch central.state {
            case .poweredOn:
                connectionState = .scanning
                central.scanForPeripherals(withServices: Self.serviceUUIDs, options: nil)
            case .poweredOff:
                connectionState = .failed(reason: "Bluetooth is switched off")
            case .unauthorized:
                connectionState = .failed(reason: "Bluetooth permission was denied")
            case .unsupported:
                connectionState = .failed(reason: "Bluetooth LE is not available")
            default:
                connectionState = .disconnected
            }
        }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didDiscover peripheral: CBPeripheral,
        advertisementData: [String: Any],
        rssi RSSI: NSNumber
    ) {
        MainActor.assumeIsolated {
            guard self.peripheral == nil else { return }
            central.stopScan()
            self.peripheral = peripheral
            peripheral.delegate = self
            connectionState = .connecting
            central.connect(peripheral, options: nil)
        }
    }

    nonisolated func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        MainActor.assumeIsolated {
            peripheral.discoverServices(Self.serviceUUIDs)
        }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didFailToConnect peripheral: CBPeripheral,
        error: Error?
    ) {
        MainActor.assumeIsolated {
            connectionState = .failed(reason: error?.localizedDescription ?? "Could not connect to the adapter")
            self.peripheral = nil
        }
    }

    nonisolated func centralManager(
        _ central: CBCentralManager,
        didDisconnectPeripheral peripheral: CBPeripheral,
        error: Error?
    ) {
        MainActor.assumeIsolated {
            isAdapterReady = false
            pollTask?.cancel()
            pollTask = nil
            failPendingCommand(with: VehicleDataError.notConnected)
            self.peripheral = nil
            notifyCharacteristic = nil
            writeCharacteristic = nil
            connectionState = .disconnected
        }
    }
}

// MARK: - CBPeripheralDelegate

extension BluetoothOBDProvider: CBPeripheralDelegate {

    nonisolated func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        MainActor.assumeIsolated {
            guard error == nil else {
                connectionState = .failed(reason: error!.localizedDescription)
                return
            }
            for service in peripheral.services ?? [] {
                guard let profile = Self.knownProfiles.first(where: { $0.service == service.uuid }) else { continue }
                activeProfile = profile
                peripheral.discoverCharacteristics([profile.notify, profile.write], for: service)
            }
        }
    }

    nonisolated func peripheral(
        _ peripheral: CBPeripheral,
        didDiscoverCharacteristicsFor service: CBService,
        error: Error?
    ) {
        MainActor.assumeIsolated {
            guard let profile = activeProfile else { return }
            for characteristic in service.characteristics ?? [] {
                if characteristic.uuid == profile.notify {
                    notifyCharacteristic = characteristic
                    peripheral.setNotifyValue(true, for: characteristic)
                }
                if characteristic.uuid == profile.write {
                    writeCharacteristic = characteristic
                }
            }
            if notifyCharacteristic != nil, writeCharacteristic != nil {
                startSession()
            }
        }
    }

    nonisolated func peripheral(
        _ peripheral: CBPeripheral,
        didUpdateValueFor characteristic: CBCharacteristic,
        error: Error?
    ) {
        MainActor.assumeIsolated {
            guard error == nil, let data = characteristic.value else { return }
            handleIncoming(data)
        }
    }
}

// MARK: - Trip accumulation from OBD samples

/// Integrates speed and fuel-rate samples into a trip.
///
/// The factory trip computer is not readable over generic OBD-II, so the app keeps its
/// own trip. Distance is the integral of speed, fuel is the integral of the engine fuel
/// rate; both are sampled about once a second.
struct OBDTripAccumulator {
    private var distanceKm: Double = 0
    private var electricDistanceKm: Double = 0
    private var fuelLitres: Double = 0
    private var duration: TimeInterval = 0
    private var lastSample: Date?
    private(set) var startedAt = Date()

    mutating func reset(at date: Date = .now) {
        distanceKm = 0
        electricDistanceKm = 0
        fuelLitres = 0
        duration = 0
        lastSample = nil
        startedAt = date
    }

    mutating func update(
        speedKph: Double,
        fuelRateLitresPerHour: Double?,
        isElectric: Bool,
        at date: Date = .now
    ) -> TripSnapshot {
        defer { lastSample = date }
        if let lastSample {
            // Ignore absurd gaps: the app was backgrounded or the adapter dropped out.
            let elapsed = min(date.timeIntervalSince(lastSample), 10)
            if elapsed > 0 {
                let hours = elapsed / 3_600
                let segment = speedKph * hours
                distanceKm += segment
                if isElectric { electricDistanceKm += segment }
                fuelLitres += (fuelRateLitresPerHour ?? 0) * hours
                duration += elapsed
            }
        }

        return TripSnapshot(
            distanceKm: distanceKm,
            duration: duration,
            averageSpeedKph: TripMath.averageSpeedKph(distanceKm: distanceKm, duration: duration),
            consumptionLper100km: TripMath.consumptionLper100km(fuelLitres: fuelLitres, distanceKm: distanceKm),
            evPercentage: distanceKm > 0 ? electricDistanceKm / distanceKm * 100 : 100,
            startedAt: startedAt
        )
    }
}
