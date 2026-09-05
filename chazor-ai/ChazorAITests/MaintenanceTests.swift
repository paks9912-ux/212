import XCTest
@testable import ChazorAI

@MainActor
final class MaintenanceTests: XCTestCase {

    private let odometer: Double = 84_320

    private func record(_ type: MaintenanceType, mileage: Double, daysAgo: Int) -> MaintenanceRecord {
        MaintenanceRecord(
            type: type,
            date: Calendar.current.date(byAdding: .day, value: -daysAgo, to: .now) ?? .now,
            mileage: mileage
        )
    }

    func testDistanceBasedItemCountsDownFromTheLastService() {
        let item = MaintenanceService.item(
            for: .engineOil,
            lastRecord: record(.engineOil, mileage: odometer - 2_800, daysAgo: 120),
            odometerKm: odometer
        )
        // 10 000 km interval, 2 800 driven since the last change.
        XCTAssertEqual(item.remainingKm ?? 0, 7_200, accuracy: 0.001)
        XCTAssertEqual(item.headlineDimension, .distance)
        XCTAssertEqual(item.status, .normal)
    }

    func testAirFilterAndBrakeCheckMatchTheirIntervals() {
        let airFilter = MaintenanceService.item(
            for: .airFilter,
            lastRecord: record(.airFilter, mileage: odometer - 7_600, daysAgo: 300),
            odometerKm: odometer
        )
        XCTAssertEqual(airFilter.remainingKm ?? 0, 12_400, accuracy: 0.001)

        let brakes = MaintenanceService.item(
            for: .brakeCheck,
            lastRecord: record(.brakeCheck, mileage: odometer - 10_000, daysAgo: 190),
            odometerKm: odometer
        )
        XCTAssertEqual(brakes.remainingKm ?? 0, 5_000, accuracy: 0.001)
    }

    /// The annual service is due on the calendar long before it is due on kilometres,
    /// so the headline has to switch to days.
    func testTimeBasedItemWinsWhenItIsCloser() {
        let item = MaintenanceService.item(
            for: .generalService,
            lastRecord: record(.generalService, mileage: odometer - 2_800, daysAgo: 342),
            odometerKm: odometer
        )
        XCTAssertEqual(item.remainingDays ?? 0, 23)
        XCTAssertEqual(item.headlineDimension, .time)
        XCTAssertEqual(item.status, .warning)
    }

    func testOverdueItemIsCritical() {
        let item = MaintenanceService.item(
            for: .engineOil,
            lastRecord: record(.engineOil, mileage: odometer - 12_000, daysAgo: 400),
            odometerKm: odometer
        )
        XCTAssertEqual(item.remainingKm ?? 0, -2_000, accuracy: 0.001)
        XCTAssertTrue(item.isOverdue)
        XCTAssertEqual(item.status, .critical)
    }

    func testItemWithoutHistoryHasNoCountdown() {
        let item = MaintenanceService.item(for: .airFilter, lastRecord: nil, odometerKm: odometer)
        XCTAssertNil(item.remainingKm)
        XCTAssertEqual(item.headlineDimension, .unknown)
        XCTAssertEqual(item.status, .normal)
    }

    func testMileageParsingAcceptsWhatDriversType() {
        XCTAssertEqual(AddServiceView.parseNumber("84 320"), 84_320)
        XCTAssertEqual(AddServiceView.parseNumber("4 900,50"), 4_900.5)
        XCTAssertEqual(AddServiceView.parseNumber("нет"), 0)
    }
}
