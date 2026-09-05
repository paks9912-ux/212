import Foundation
import SwiftData

/// Periods offered on the trip screen.
enum TripPeriod: String, CaseIterable, Identifiable, Sendable {
    case today = "Today"
    case yesterday = "Yesterday"
    case last7Days = "7 days"
    case last30Days = "30 days"

    var id: String { rawValue }

    /// Half-open interval `[start, end)` in the current calendar.
    func dateRange(now: Date = .now, calendar: Calendar = .current) -> Range<Date> {
        let startOfToday = calendar.startOfDay(for: now)
        switch self {
        case .today:
            return startOfToday..<calendar.date(byAdding: .day, value: 1, to: startOfToday)!
        case .yesterday:
            let start = calendar.date(byAdding: .day, value: -1, to: startOfToday)!
            return start..<startOfToday
        case .last7Days:
            let start = calendar.date(byAdding: .day, value: -6, to: startOfToday)!
            return start..<calendar.date(byAdding: .day, value: 1, to: startOfToday)!
        case .last30Days:
            let start = calendar.date(byAdding: .day, value: -29, to: startOfToday)!
            return start..<calendar.date(byAdding: .day, value: 1, to: startOfToday)!
        }
    }

    var dayCount: Int {
        switch self {
        case .today, .yesterday: return 1
        case .last7Days: return 7
        case .last30Days: return 30
        }
    }
}

/// Summed statistics for a set of trips.
struct TripAggregate: Equatable, Sendable {
    var tripCount: Int = 0
    var distanceKm: Double = 0
    var duration: TimeInterval = 0
    var averageSpeedKph: Double = 0
    var consumptionLper100km: Double = 0
    var evPercentage: Double = 0

    var hevPercentage: Double { max(0, 100 - evPercentage) }
    var isEmpty: Bool { tripCount == 0 }

    static let empty = TripAggregate()
}

/// One calendar day of the chart.
struct TripDayBucket: Identifiable, Equatable, Sendable {
    var id: Date { day }
    var day: Date
    var distanceKm: Double
    var consumptionLper100km: Double
    var evPercentage: Double
}

/// Read-only queries over stored trips.
///
/// Trip volumes here are small (tens per week), so filtering happens in Swift rather than
/// in a predicate — it keeps the date maths in one testable place.
@MainActor
struct TripHistoryService {
    let context: ModelContext

    func trips(in range: Range<Date>) -> [Trip] {
        let descriptor = FetchDescriptor<Trip>(sortBy: [SortDescriptor(\Trip.date, order: .reverse)])
        let all = (try? context.fetch(descriptor)) ?? []
        return all.filter { range.contains($0.date) }
    }

    func trips(for period: TripPeriod, now: Date = .now) -> [Trip] {
        trips(in: period.dateRange(now: now))
    }

    func aggregate(for period: TripPeriod, now: Date = .now) -> TripAggregate {
        Self.aggregate(trips(for: period, now: now))
    }

    static func aggregate(_ trips: [Trip]) -> TripAggregate {
        guard !trips.isEmpty else { return .empty }
        let distance = trips.reduce(0) { $0 + $1.distance }
        let duration = trips.reduce(0) { $0 + $1.duration }
        return TripAggregate(
            tripCount: trips.count,
            distanceKm: distance,
            duration: duration,
            averageSpeedKph: TripMath.averageSpeedKph(distanceKm: distance, duration: duration),
            consumptionLper100km: TripMath.weightedConsumption(
                trips.map { (distanceKm: $0.distance, consumption: $0.consumption) }
            ),
            evPercentage: TripMath.weightedEVShare(
                trips.map { (distanceKm: $0.distance, evPercentage: $0.evPercentage) }
            )
        )
    }

    /// Per-day buckets covering the whole period, including days with no trips,
    /// so the chart keeps a stable x-axis.
    func dailyBuckets(for period: TripPeriod, now: Date = .now, calendar: Calendar = .current) -> [TripDayBucket] {
        let range = period.dateRange(now: now, calendar: calendar)
        return Self.dailyBuckets(trips: trips(in: range), in: range, calendar: calendar)
    }

    /// Pure variant, used by views that already hold the trips through `@Query`.
    static func dailyBuckets(
        trips tripsInRange: [Trip],
        in range: Range<Date>,
        calendar: Calendar = .current
    ) -> [TripDayBucket] {
        let grouped = Dictionary(grouping: tripsInRange) { calendar.startOfDay(for: $0.date) }

        var buckets: [TripDayBucket] = []
        var day = calendar.startOfDay(for: range.lowerBound)
        while day < range.upperBound {
            let dayTrips = grouped[day] ?? []
            let summary = Self.aggregate(dayTrips)
            buckets.append(
                TripDayBucket(
                    day: day,
                    distanceKm: summary.distanceKm,
                    consumptionLper100km: summary.consumptionLper100km,
                    evPercentage: summary.evPercentage
                )
            )
            guard let next = calendar.date(byAdding: .day, value: 1, to: day) else { break }
            day = next
        }
        return buckets
    }

    /// Compares the current period with the one immediately before it — the data behind
    /// "почему расход вырос?".
    func consumptionTrend(for period: TripPeriod, now: Date = .now, calendar: Calendar = .current) -> Double? {
        let range = period.dateRange(now: now, calendar: calendar)
        let length = range.upperBound.timeIntervalSince(range.lowerBound)
        let previous = range.lowerBound.addingTimeInterval(-length)..<range.lowerBound

        let current = Self.aggregate(trips(in: range))
        let baseline = Self.aggregate(trips(in: previous))
        guard !current.isEmpty, !baseline.isEmpty else { return nil }
        return TripMath.percentChange(from: baseline.consumptionLper100km, to: current.consumptionLper100km)
    }
}
