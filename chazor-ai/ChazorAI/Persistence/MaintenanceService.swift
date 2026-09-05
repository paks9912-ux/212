import Foundation
import SwiftData

/// A service item with its computed "time left" figure.
struct MaintenanceItem: Identifiable, Equatable, Sendable {
    var id: String { type.rawValue }
    var type: MaintenanceType
    var lastServiceDate: Date?
    var lastServiceMileage: Double?
    /// Kilometres until due; `nil` for time-only items. Negative means overdue.
    var remainingKm: Double?
    /// Days until due; `nil` for distance-only items. Negative means overdue.
    var remainingDays: Int?
    var status: MetricStatus

    /// Distance and time both count down; the headline shows whichever runs out first.
    /// A day is treated as ~40 km of driving for that comparison.
    static let kilometresPerDayEquivalent: Double = 40

    var headlineValue: String {
        switch headlineDimension {
        case .distance:
            return "\(Formatters.distance(abs(remainingKm ?? 0))) km"
        case .time:
            return "\(abs(remainingDays ?? 0)) days"
        case .unknown:
            return "—"
        }
    }

    enum Dimension { case distance, time, unknown }

    var headlineDimension: Dimension {
        switch (remainingKm, remainingDays) {
        case let (km?, days?):
            return km <= Double(days) * Self.kilometresPerDayEquivalent ? .distance : .time
        case (_?, nil):
            return .distance
        case (nil, _?):
            return .time
        case (nil, nil):
            return .unknown
        }
    }

    var isOverdue: Bool {
        (remainingKm.map { $0 < 0 } ?? false) || (remainingDays.map { $0 < 0 } ?? false)
    }
}

/// Derives upcoming service items from the stored history plus the current odometer.
@MainActor
struct MaintenanceService {
    let context: ModelContext

    /// Items shown on the maintenance screen, most urgent first.
    static let trackedTypes: [MaintenanceType] = [.engineOil, .airFilter, .brakeCheck, .generalService]

    func records() -> [MaintenanceRecord] {
        let descriptor = FetchDescriptor<MaintenanceRecord>(
            sortBy: [SortDescriptor(\MaintenanceRecord.date, order: .reverse)]
        )
        return (try? context.fetch(descriptor)) ?? []
    }

    func upcomingItems(odometerKm: Double, now: Date = .now) -> [MaintenanceItem] {
        let history = records()
        return Self.trackedTypes
            .map { type in
                Self.item(
                    for: type,
                    lastRecord: history.first { $0.type == type },
                    odometerKm: odometerKm,
                    now: now
                )
            }
            .sorted { lhs, rhs in
                if lhs.status != rhs.status { return lhs.status > rhs.status }
                return Self.urgencyScore(lhs) < Self.urgencyScore(rhs)
            }
    }

    static func item(
        for type: MaintenanceType,
        lastRecord: MaintenanceRecord?,
        odometerKm: Double,
        now: Date = .now,
        calendar: Calendar = .current
    ) -> MaintenanceItem {
        var remainingKm: Double?
        var remainingDays: Int?

        if let intervalKm = type.intervalKm, let lastMileage = lastRecord?.mileage {
            remainingKm = (lastMileage + intervalKm) - odometerKm
        }
        if let intervalDays = type.intervalDays, let lastDate = lastRecord?.date {
            let due = calendar.date(byAdding: .day, value: intervalDays, to: lastDate) ?? lastDate
            remainingDays = calendar.dateComponents([.day], from: calendar.startOfDay(for: now),
                                                    to: calendar.startOfDay(for: due)).day
        }

        // Both dimensions are evaluated; the worst of the two wins, so a car that is
        // driven hard is flagged on kilometres and a garage queen on the calendar.
        var statuses: [MetricStatus] = []
        if let remainingKm { statuses.append(HealthRules.serviceStatus(remainingKm: remainingKm)) }
        if let remainingDays { statuses.append(HealthRules.serviceStatus(remainingDays: remainingDays)) }

        return MaintenanceItem(
            type: type,
            lastServiceDate: lastRecord?.date,
            lastServiceMileage: lastRecord?.mileage,
            remainingKm: remainingKm,
            remainingDays: remainingDays,
            status: HealthRules.aggregate(statuses)
        )
    }

    private static func urgencyScore(_ item: MaintenanceItem) -> Double {
        let byDistance = item.remainingKm ?? .greatestFiniteMagnitude
        let byTime = item.remainingDays
            .map { Double($0) * MaintenanceItem.kilometresPerDayEquivalent } ?? .greatestFiniteMagnitude
        return min(byDistance, byTime)
    }

    @discardableResult
    func add(
        type: MaintenanceType,
        date: Date,
        mileage: Double,
        cost: Double,
        notes: String,
        vehicle: Vehicle
    ) -> MaintenanceRecord {
        let record = MaintenanceRecord(
            type: type,
            date: date,
            mileage: mileage,
            cost: cost,
            notes: notes.trimmingCharacters(in: .whitespacesAndNewlines),
            vehicle: vehicle
        )
        context.insert(record)
        // A service entry with a higher odometer reading than the stored one is the most
        // reliable mileage source available before OBD is connected.
        if mileage > vehicle.odometerKm { vehicle.odometerKm = mileage }
        try? context.save()
        return record
    }

    func delete(_ record: MaintenanceRecord) {
        context.delete(record)
        try? context.save()
    }
}
