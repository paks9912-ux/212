import SwiftData
import XCTest
@testable import ChazorAI

@MainActor
final class TripHistoryTests: XCTestCase {

    private var container: ModelContainer!
    private var context: ModelContext!
    private var calendar = Calendar.current

    override func setUp() async throws {
        try await super.setUp()
        container = PersistenceController.makeContainer(inMemory: true)
        context = container.mainContext
    }

    override func tearDown() async throws {
        container = nil
        context = nil
        try await super.tearDown()
    }

    private func insert(distance: Double, consumption: Double, evPercentage: Double, daysAgo: Int, hour: Int = 9) {
        let day = calendar.date(byAdding: .day, value: -daysAgo, to: .now) ?? .now
        let date = calendar.date(bySettingHour: hour, minute: 0, second: 0, of: day) ?? day
        context.insert(
            Trip(
                date: date,
                distance: distance,
                duration: distance / 40 * 3_600,
                averageSpeed: 40,
                consumption: consumption,
                evPercentage: evPercentage,
                hevPercentage: 100 - evPercentage
            )
        )
    }

    func testTodayAndYesterdayDoNotOverlap() {
        insert(distance: 10, consumption: 4, evPercentage: 80, daysAgo: 0)
        insert(distance: 30, consumption: 6, evPercentage: 40, daysAgo: 1)
        let service = TripHistoryService(context: context)

        XCTAssertEqual(service.aggregate(for: .today).tripCount, 1)
        XCTAssertEqual(service.aggregate(for: .today).distanceKm, 10, accuracy: 0.001)
        XCTAssertEqual(service.aggregate(for: .yesterday).tripCount, 1)
        XCTAssertEqual(service.aggregate(for: .yesterday).distanceKm, 30, accuracy: 0.001)
    }

    func testSevenDayWindowIncludesToday() {
        insert(distance: 10, consumption: 4, evPercentage: 80, daysAgo: 0)
        insert(distance: 10, consumption: 4, evPercentage: 80, daysAgo: 6)
        insert(distance: 10, consumption: 4, evPercentage: 80, daysAgo: 7)
        let service = TripHistoryService(context: context)
        XCTAssertEqual(service.aggregate(for: .last7Days).tripCount, 2)
    }

    func testAggregateIsDistanceWeighted() {
        insert(distance: 100, consumption: 5, evPercentage: 0, daysAgo: 0, hour: 8)
        insert(distance: 1, consumption: 25, evPercentage: 0, daysAgo: 0, hour: 18)
        let summary = TripHistoryService(context: context).aggregate(for: .today)
        XCTAssertEqual(summary.consumptionLper100km, 5.198, accuracy: 0.01)
    }

    func testDailyBucketsCoverEveryDayIncludingEmptyOnes() {
        insert(distance: 12, consumption: 4, evPercentage: 90, daysAgo: 3)
        let buckets = TripHistoryService(context: context).dailyBuckets(for: .last7Days)
        XCTAssertEqual(buckets.count, 7)
        XCTAssertEqual(buckets.filter { $0.distanceKm > 0 }.count, 1)
    }

    func testConsumptionTrendComparesWithThePreviousWindow() {
        // Previous week: economical. This week: thirsty.
        for day in 7...13 { insert(distance: 20, consumption: 4, evPercentage: 60, daysAgo: day) }
        for day in 0...6 { insert(distance: 20, consumption: 6, evPercentage: 20, daysAgo: day) }

        let trend = TripHistoryService(context: context).consumptionTrend(for: .last7Days)
        XCTAssertNotNil(trend)
        XCTAssertEqual(trend ?? 0, 50, accuracy: 0.5)
    }

    func testSeedingProducesUsableHistoryExactlyOnce() {
        SampleDataSeeder.seedIfNeeded(context: context)
        let firstCount = (try? context.fetchCount(FetchDescriptor<Trip>())) ?? 0
        XCTAssertGreaterThan(firstCount, 10)

        SampleDataSeeder.seedIfNeeded(context: context)
        let secondCount = (try? context.fetchCount(FetchDescriptor<Trip>())) ?? 0
        XCTAssertEqual(firstCount, secondCount)
    }

    func testSeededMaintenanceMatchesTheDesignFigures() {
        SampleDataSeeder.seedIfNeeded(context: context)
        let vehicle = PersistenceController.currentVehicle(in: context)
        let items = MaintenanceService(context: context).upcomingItems(odometerKm: vehicle.odometerKm)

        let oil = items.first { $0.type == .engineOil }
        XCTAssertEqual(oil?.remainingKm ?? 0, 7_200, accuracy: 1)

        let airFilter = items.first { $0.type == .airFilter }
        XCTAssertEqual(airFilter?.remainingKm ?? 0, 12_400, accuracy: 1)

        let brakes = items.first { $0.type == .brakeCheck }
        XCTAssertEqual(brakes?.remainingKm ?? 0, 5_000, accuracy: 1)

        let service = items.first { $0.type == .generalService }
        XCTAssertEqual(service?.remainingDays ?? 0, 23)
        XCTAssertEqual(service?.headlineDimension, .time)
    }
}
