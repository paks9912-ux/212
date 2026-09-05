import Foundation
import Observation

/// Single source of truth for live vehicle data.
///
/// Views, CarPlay templates and the AI context builder all read from here, so there is
/// exactly one place where a provider is attached and one place where derived statuses
/// are computed.
@MainActor
@Observable
final class VehicleTelemetryStore {

    private(set) var frame: VehicleFrame = .placeholder
    private(set) var connectionState: ConnectionState = .disconnected
    private(set) var sourceID: VehicleDataSourceID = .mock
    private(set) var lastUpdate: Date?

    /// Set once by the composition root; used to persist finished trips.
    var tripRecorder: TripRecorder?
    /// Set once by the composition root; keeps a history of fault codes.
    var diagnosticsRecorder: DiagnosticsRecorder?

    @ObservationIgnored private var provider: (any VehicleDataProvider)?
    @ObservationIgnored private var consumeTask: Task<Void, Never>?
    @ObservationIgnored private var connectionPollTask: Task<Void, Never>?

    // MARK: Lifecycle

    func use(_ provider: any VehicleDataProvider) {
        stop()
        self.provider = provider
        self.sourceID = provider.sourceID
        self.connectionState = provider.connectionState
        provider.connect()

        consumeTask = Task { [weak self] in
            for await frame in provider.frames {
                guard let self, !Task.isCancelled else { return }
                self.apply(frame)
            }
        }

        // Providers report connection changes through their own state; a light poll keeps
        // the UI honest without forcing every provider to own a callback.
        connectionPollTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                if self.connectionState != provider.connectionState {
                    self.connectionState = provider.connectionState
                }
                try? await Task.sleep(for: .milliseconds(500))
            }
        }
    }

    func stop() {
        consumeTask?.cancel()
        consumeTask = nil
        connectionPollTask?.cancel()
        connectionPollTask = nil
        provider?.disconnect()
        provider = nil
        connectionState = .disconnected
    }

    /// Exposed so demo controls (and tests) can reach the concrete provider.
    var mockProvider: MockVehicleDataProvider? { provider as? MockVehicleDataProvider }

    private func apply(_ frame: VehicleFrame) {
        self.frame = frame
        self.lastUpdate = frame.vehicle.timestamp
        if let provider { self.connectionState = provider.connectionState }
        tripRecorder?.ingest(frame)
        diagnosticsRecorder?.ingest(frame)
    }

    // MARK: Derived values

    var vehicle: VehicleStatusSnapshot { frame.vehicle }
    var battery: BatteryStatusSnapshot { frame.battery }
    var diagnostics: DiagnosticsSnapshot { frame.diagnostics }
    var trip: TripSnapshot { frame.trip }

    var batteryStatus: MetricStatus {
        HealthRules.batteryStatus(stateOfChargePercent: battery.stateOfChargePercent)
    }

    var auxiliaryVoltageStatus: MetricStatus {
        HealthRules.auxiliaryVoltageStatus(battery.auxiliaryVoltage)
    }

    var coolantStatus: MetricStatus {
        HealthRules.coolantTemperatureStatus(vehicle.coolantTemperatureC)
    }

    var diagnosticsStatus: MetricStatus {
        HealthRules.diagnosticsStatus(errorCount: diagnostics.errorCount, milOn: diagnostics.milOn)
    }

    /// Worst status across everything the app monitors — the single health indicator.
    var overallStatus: MetricStatus {
        HealthRules.aggregate([batteryStatus, auxiliaryVoltageStatus, coolantStatus, diagnosticsStatus])
    }

    /// True while the car is moving. Used to hide anything that should not be read at speed.
    var isDriving: Bool { vehicle.speedKph > 3 }
}
