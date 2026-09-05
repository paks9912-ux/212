import Foundation

/// Deterministic-enough drive-cycle simulator used for development, demos, SwiftUI
/// previews and CarPlay simulator runs.
///
/// It models the parts of a plug-in hybrid the UI actually shows: a traction battery
/// that drains while driving electrically, a switch to hybrid mode when the pack runs
/// low, a combustion engine that warms up and burns fuel once it runs, and a trip that
/// accumulates distance, time and consumption.
@MainActor
final class MockVehicleDataProvider: VehicleDataProvider {

    let sourceID: VehicleDataSourceID = .mock
    private(set) var connectionState: ConnectionState = .disconnected

    let frames: AsyncStream<VehicleFrame>
    private let continuation: AsyncStream<VehicleFrame>.Continuation

    private var tickTask: Task<Void, Never>?
    private var random = SeededRandomGenerator(seed: 0x5EED_C4A2_0B55_0001)

    /// Wall-clock seconds represented by one tick. Values above 1 make demos move faster.
    private let secondsPerTick: Double
    private let tickInterval: Duration

    // MARK: State

    private var speedKph: Double = 68
    private var targetSpeedKph: Double = 68
    private var phaseTicksRemaining: Int = 25
    private var driveMode: DriveMode = .ev
    private var coolantTemperatureC: Double = 91
    private var odometerKm: Double
    private var stateOfChargePercent: Double = 74
    private var auxiliaryVoltage: Double = 12.6
    private var packTemperatureC: Double = 28

    private var tripDistanceKm: Double = 24.7
    private var tripEVDistanceKm: Double = 24.7 * 0.71
    private var tripFuelLitres: Double = 24.7 * 4.3 / 100
    private var tripDuration: TimeInterval = 38 * 60
    private var tripStartedAt: Date

    private var troubleCodes: [TroubleCode] = []

    /// Full-charge electric range used to convert distance into state of charge.
    private let fullElectricRangeKm: Double = 111

    init(odometerKm: Double = 84_320, secondsPerTick: Double = 1, tickInterval: Duration = .seconds(1)) {
        self.odometerKm = odometerKm
        self.secondsPerTick = secondsPerTick
        self.tickInterval = tickInterval
        self.tripStartedAt = Date().addingTimeInterval(-38 * 60)
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

    // MARK: VehicleDataProvider

    func connect() {
        guard tickTask == nil else { return }
        connectionState = .connected(sourceName: "Demo data")
        continuation.yield(currentFrame())

        tickTask = Task { [weak self, tickInterval] in
            while !Task.isCancelled {
                try? await Task.sleep(for: tickInterval)
                guard !Task.isCancelled, let self else { return }
                self.advance()
                self.continuation.yield(self.currentFrame())
            }
        }
    }

    func disconnect() {
        tickTask?.cancel()
        tickTask = nil
        connectionState = .disconnected
    }

    func getVehicleStatus() async throws -> VehicleStatusSnapshot { currentFrame().vehicle }
    func getBatteryStatus() async throws -> BatteryStatusSnapshot { currentFrame().battery }
    func getDiagnostics() async throws -> DiagnosticsSnapshot { currentFrame().diagnostics }
    func getTripData() async throws -> TripSnapshot { currentFrame().trip }

    // MARK: Demo controls

    /// Injects a fault so warning and critical states can be exercised without a car.
    func injectTroubleCode(_ code: TroubleCode) {
        troubleCodes.append(code)
        continuation.yield(currentFrame())
    }

    func clearTroubleCodes() {
        troubleCodes.removeAll()
        continuation.yield(currentFrame())
    }

    func startNewTrip() {
        tripDistanceKm = 0
        tripEVDistanceKm = 0
        tripFuelLitres = 0
        tripDuration = 0
        tripStartedAt = .now
        continuation.yield(currentFrame())
    }

    // MARK: Simulation

    private func advance() {
        advanceSpeed()

        let hours = secondsPerTick / 3_600
        let distanceThisTick = speedKph * hours

        updateDriveMode()
        consume(distanceKm: distanceThisTick)
        updateTemperatures()

        odometerKm += distanceThisTick
        tripDistanceKm += distanceThisTick
        tripDuration += secondsPerTick
        if driveMode == .ev { tripEVDistanceKm += distanceThisTick }
    }

    private func advanceSpeed() {
        phaseTicksRemaining -= 1
        if phaseTicksRemaining <= 0 {
            // Alternate between urban stops and steady cruising.
            let isStop = Double.random(in: 0...1, using: &random) < 0.28
            targetSpeedKph = isStop ? 0 : Double.random(in: 32...96, using: &random)
            phaseTicksRemaining = Int.random(in: 12...45, using: &random)
        }

        let delta = targetSpeedKph - speedKph
        // Braking is quicker than accelerating, which is what the numbers look like in a car.
        let rate = delta < 0 ? 3.4 : 1.9
        speedKph = max(0, speedKph + max(-rate, min(rate, delta * 0.35)))
        if speedKph < 0.6 { speedKph = 0 }
    }

    private func updateDriveMode() {
        if stateOfChargePercent <= 14 {
            driveMode = .hev
        } else if stateOfChargePercent > 22, driveMode == .hev, speedKph < 60 {
            driveMode = .ev
        }
    }

    private func consume(distanceKm: Double) {
        guard distanceKm > 0 else { return }

        switch driveMode {
        case .ev:
            let socPerKm = 100 / fullElectricRangeKm
            // Higher speed costs more energy per kilometre.
            let speedFactor = 0.82 + (speedKph / 130) * 0.55
            stateOfChargePercent = max(0, stateOfChargePercent - distanceKm * socPerKm * speedFactor)
        case .hev, .charging, .unknown:
            // Engine assists and recharges the pack a little on the move.
            let litresPer100 = 5.1 + (speedKph > 90 ? 1.4 : 0) + Double.random(in: -0.3...0.5, using: &random)
            tripFuelLitres += litresPer100 / 100 * distanceKm
            stateOfChargePercent = min(100, stateOfChargePercent + distanceKm * 0.05)
        }
    }

    private func updateTemperatures() {
        let engineRunning = driveMode == .hev
        let target: Double = engineRunning ? 92 : 74
        coolantTemperatureC += (target - coolantTemperatureC) * 0.04
        packTemperatureC += ((speedKph > 70 ? 34 : 27) - packTemperatureC) * 0.02
        // Alternator/DC-DC converter holds the 12 V rail higher while driving.
        let voltageTarget = speedKph > 2 ? 13.9 : 12.6
        auxiliaryVoltage += (voltageTarget - auxiliaryVoltage) * 0.08
    }

    private func currentFrame() -> VehicleFrame {
        let now = Date()
        let evShare = tripDistanceKm > 0 ? tripEVDistanceKm / tripDistanceKm * 100 : 100

        return VehicleFrame(
            vehicle: VehicleStatusSnapshot(
                speedKph: speedKph.rounded(),
                driveMode: driveMode,
                coolantTemperatureC: coolantTemperatureC.rounded(),
                odometerKm: odometerKm.rounded(),
                ambientTemperatureC: 18,
                timestamp: now
            ),
            battery: BatteryStatusSnapshot(
                stateOfChargePercent: stateOfChargePercent.rounded(),
                estimatedRangeKm: (stateOfChargePercent / 100 * fullElectricRangeKm).rounded(),
                auxiliaryVoltage: (auxiliaryVoltage * 10).rounded() / 10,
                packTemperatureC: packTemperatureC.rounded(),
                isCharging: false,
                timestamp: now
            ),
            diagnostics: DiagnosticsSnapshot(
                troubleCodes: troubleCodes,
                milOn: troubleCodes.contains { !$0.isPending },
                timestamp: now
            ),
            trip: TripSnapshot(
                distanceKm: (tripDistanceKm * 10).rounded() / 10,
                duration: tripDuration,
                averageSpeedKph: TripMath.averageSpeedKph(distanceKm: tripDistanceKm, duration: tripDuration),
                consumptionLper100km: (
                    TripMath.consumptionLper100km(fuelLitres: tripFuelLitres, distanceKm: tripDistanceKm) * 10
                ).rounded() / 10,
                evPercentage: evShare.rounded(),
                startedAt: tripStartedAt
            )
        )
    }
}
