import XCTest
@testable import ChazorAI

/// Threshold logic decides what turns red in front of a driver, so every boundary is
/// pinned rather than sampled.
final class HealthRulesTests: XCTestCase {

    func testBatteryThresholds() {
        XCTAssertEqual(HealthRules.batteryStatus(stateOfChargePercent: 74), .normal)
        XCTAssertEqual(HealthRules.batteryStatus(stateOfChargePercent: 15), .normal)
        XCTAssertEqual(HealthRules.batteryStatus(stateOfChargePercent: 14.9), .warning)
        XCTAssertEqual(HealthRules.batteryStatus(stateOfChargePercent: 8), .warning)
        XCTAssertEqual(HealthRules.batteryStatus(stateOfChargePercent: 7.9), .critical)
    }

    func testAuxiliaryVoltageIsCriticalWhenFlatAndWhenOvercharging() {
        XCTAssertEqual(HealthRules.auxiliaryVoltageStatus(12.6), .normal)
        XCTAssertEqual(HealthRules.auxiliaryVoltageStatus(14.4), .normal)
        XCTAssertEqual(HealthRules.auxiliaryVoltageStatus(12.1), .warning)
        XCTAssertEqual(HealthRules.auxiliaryVoltageStatus(11.5), .critical)
        XCTAssertEqual(HealthRules.auxiliaryVoltageStatus(15.0), .warning)
        XCTAssertEqual(HealthRules.auxiliaryVoltageStatus(15.4), .critical)
    }

    func testCoolantThresholds() {
        XCTAssertEqual(HealthRules.coolantTemperatureStatus(91), .normal)
        XCTAssertEqual(HealthRules.coolantTemperatureStatus(104), .warning)
        XCTAssertEqual(HealthRules.coolantTemperatureStatus(111), .critical)
    }

    func testDiagnosticsStatus() {
        XCTAssertEqual(HealthRules.diagnosticsStatus(errorCount: 0, milOn: false), .normal)
        XCTAssertEqual(HealthRules.diagnosticsStatus(errorCount: 2, milOn: false), .warning)
        XCTAssertEqual(HealthRules.diagnosticsStatus(errorCount: 0, milOn: true), .critical)
    }

    func testServiceStatusByDistanceAndTime() {
        XCTAssertEqual(HealthRules.serviceStatus(remainingKm: 7_200), .normal)
        XCTAssertEqual(HealthRules.serviceStatus(remainingKm: 900), .warning)
        XCTAssertEqual(HealthRules.serviceStatus(remainingKm: -10), .critical)
        XCTAssertEqual(HealthRules.serviceStatus(remainingDays: 60), .normal)
        XCTAssertEqual(HealthRules.serviceStatus(remainingDays: 23), .warning)
        XCTAssertEqual(HealthRules.serviceStatus(remainingDays: -1), .critical)
    }

    func testAggregateReturnsTheWorstStatus() {
        XCTAssertEqual(HealthRules.aggregate([.normal, .warning, .normal]), .warning)
        XCTAssertEqual(HealthRules.aggregate([.warning, .critical]), .critical)
        XCTAssertEqual(HealthRules.aggregate([]), .normal)
    }
}
