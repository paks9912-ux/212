import CarPlay
import SwiftData
import XCTest
@testable import ChazorAI

@MainActor
final class MockProviderTests: XCTestCase {

    func testStartsWithTheDesignValues() async throws {
        let provider = MockVehicleDataProvider()
        let frame = try await provider.getFrame()
        XCTAssertEqual(frame.vehicle.speedKph, 68, accuracy: 0.001)
        XCTAssertEqual(frame.battery.stateOfChargePercent, 74, accuracy: 0.001)
        XCTAssertEqual(frame.battery.estimatedRangeKm, 82, accuracy: 0.001)
        XCTAssertEqual(frame.trip.distanceKm, 24.7, accuracy: 0.001)
        XCTAssertEqual(frame.trip.consumptionLper100km, 4.3, accuracy: 0.05)
        XCTAssertEqual(frame.vehicle.driveMode, .ev)
    }

    /// The simulator has to actually move, otherwise the prototype is a static mock-up.
    func testEmitsChangingFrames() async throws {
        let provider = MockVehicleDataProvider(tickInterval: .milliseconds(5))
        provider.connect()
        defer { provider.disconnect() }

        var received: [VehicleFrame] = []
        for await frame in provider.frames {
            received.append(frame)
            if received.count >= 12 { break }
        }

        XCTAssertEqual(received.count, 12)
        let distances = received.map(\.trip.distanceKm)
        XCTAssertGreaterThan(distances.last ?? 0, distances.first ?? 0)
        XCTAssertTrue(received.allSatisfy { $0.vehicle.speedKph >= 0 })
        XCTAssertTrue(received.allSatisfy { (0...100).contains($0.battery.stateOfChargePercent) })
    }

    func testInjectedFaultsPropagateToStatus() async throws {
        let provider = MockVehicleDataProvider()
        provider.injectTroubleCode(
            TroubleCode(code: "P0420", descriptionText: "Catalyst", isPending: false, detectedAt: .now)
        )
        let diagnostics = try await provider.getDiagnostics()
        XCTAssertEqual(diagnostics.errorCount, 1)
        XCTAssertTrue(diagnostics.milOn)
        XCTAssertEqual(
            HealthRules.diagnosticsStatus(errorCount: diagnostics.errorCount, milOn: diagnostics.milOn),
            .critical
        )
    }

    func testTelemetryStoreDerivesTheWorstStatus() async throws {
        let store = VehicleTelemetryStore()
        let provider = MockVehicleDataProvider(tickInterval: .milliseconds(5))
        provider.injectTroubleCode(
            TroubleCode(code: "P0420", descriptionText: "Catalyst", isPending: false, detectedAt: .now)
        )
        store.use(provider)
        defer { store.stop() }

        // Give the consumption task one frame.
        try await Task.sleep(for: .milliseconds(120))
        XCTAssertEqual(store.overallStatus, .critical)
        XCTAssertTrue(store.connectionState.isConnected)
    }
}

/// The template limits are what keep the CarPlay interface inside what Apple allows.
final class CarPlayLimitTests: XCTestCase {

    func testListItemsAreClampedToTheFrameworkLimit() {
        let items = Array(0..<200)
        XCTAssertEqual(CarPlayLimits.clampListItems(items).count, CPListTemplate.maximumItemCount)
    }

    func testInformationItemsAndActionsAreClamped() {
        XCTAssertEqual(CarPlayLimits.clampInformationItems(Array(0..<50)).count, 10)
        XCTAssertEqual(CarPlayLimits.clampActions(Array(0..<50)).count, 3)
    }

    func testTabsAreClampedToTheFrameworkLimit() {
        XCTAssertEqual(CarPlayLimits.clampTabs(Array(0..<20)).count, CPTabBarTemplate.maximumTabCount)
    }

    /// Driving-task apps get a shallow stack; the app targets the stricter figure.
    func testDepthBudgetStaysWithinTheDrivingTaskLimit() {
        XCTAssertLessThanOrEqual(CarPlayLimits.maximumTemplateDepth, 2)
    }
}

@MainActor
final class DiagnosticsRecorderTests: XCTestCase {

    private func frame(with codes: [String], odometerKm: Double = 84_320) -> VehicleFrame {
        var frame = VehicleFrame.placeholder
        frame.vehicle.odometerKm = odometerKm
        frame.diagnostics = DiagnosticsSnapshot(
            troubleCodes: codes.map {
                TroubleCode(code: $0, descriptionText: "test", isPending: false, detectedAt: .now)
            },
            milOn: !codes.isEmpty,
            timestamp: .now
        )
        return frame
    }

    func testRecordsEachCodeOnceAndClearsItWhenItStopsBeingReported() throws {
        let container = PersistenceController.makeContainer(inMemory: true)
        let context = container.mainContext
        let vehicle = PersistenceController.currentVehicle(in: context)
        let recorder = DiagnosticsRecorder(context: context, vehicle: vehicle)

        recorder.ingest(frame(with: ["P0420"]))
        recorder.ingest(frame(with: ["P0420"]))       // still there — no second row
        recorder.ingest(frame(with: ["P0420", "P0128"]))

        var events = try context.fetch(FetchDescriptor<DiagnosticEvent>())
        XCTAssertEqual(events.count, 2)
        XCTAssertEqual(events.filter { !$0.isCleared }.count, 2)
        XCTAssertEqual(events.first?.mileage, 84_320)

        recorder.ingest(frame(with: ["P0128"]))       // P0420 gone
        events = try context.fetch(FetchDescriptor<DiagnosticEvent>())
        XCTAssertEqual(events.count, 2)
        XCTAssertEqual(events.first { $0.code == "P0420" }?.isCleared, true)
        XCTAssertEqual(events.first { $0.code == "P0128" }?.isCleared, false)
    }
}
