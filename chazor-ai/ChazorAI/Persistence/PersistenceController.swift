import Foundation
import SwiftData

/// Owns the SwiftData stack and guarantees exactly one `Vehicle` row exists.
@MainActor
enum PersistenceController {

    static let schema = Schema([
        Vehicle.self,
        Trip.self,
        MaintenanceRecord.self,
        DiagnosticEvent.self
    ])

    static func makeContainer(inMemory: Bool = false) -> ModelContainer {
        let configuration = ModelConfiguration(schema: schema, isStoredInMemoryOnly: inMemory)
        do {
            return try ModelContainer(for: schema, configurations: [configuration])
        } catch {
            // A prototype must not hard-crash on a schema mismatch during development:
            // fall back to an in-memory store so the app still launches and the failure
            // is visible in the log rather than as a launch crash.
            assertionFailure("SwiftData container failed: \(error)")
            let fallback = ModelConfiguration(schema: schema, isStoredInMemoryOnly: true)
            // swiftlint:disable:next force_try
            return try! ModelContainer(for: schema, configurations: [fallback])
        }
    }

    /// Returns the single vehicle row, creating it on first launch.
    @discardableResult
    static func currentVehicle(in context: ModelContext) -> Vehicle {
        let descriptor = FetchDescriptor<Vehicle>(sortBy: [SortDescriptor(\.createdAt)])
        if let existing = try? context.fetch(descriptor).first {
            return existing
        }
        let vehicle = Vehicle()
        context.insert(vehicle)
        try? context.save()
        return vehicle
    }
}

/// Seeds a plausible history so charts, comparisons and AI answers have something to work
/// with on a fresh install. Real data replaces it as soon as trips are recorded.
@MainActor
enum SampleDataSeeder {

    static func seedIfNeeded(context: ModelContext) {
        let vehicle = PersistenceController.currentVehicle(in: context)
        seedTripsIfNeeded(context: context, vehicle: vehicle)
        seedMaintenanceIfNeeded(context: context, vehicle: vehicle)
    }

    private static func seedTripsIfNeeded(context: ModelContext, vehicle: Vehicle) {
        let existing = (try? context.fetchCount(FetchDescriptor<Trip>())) ?? 0
        guard existing == 0 else { return }

        let calendar = Calendar.current
        var generator = SeededRandomGenerator(seed: 0xC4A2_0B55_1234_5678)

        for dayOffset in 0..<35 {
            guard let day = calendar.date(byAdding: .day, value: -dayOffset, to: .now) else { continue }
            // Fewer, longer trips at weekends; 1–3 commutes on weekdays.
            let isWeekend = calendar.isDateInWeekend(day)
            var tripCount = isWeekend
                ? Int.random(in: 0...2, using: &generator)
                : Int.random(in: 1...3, using: &generator)
            // Today always gets at least one trip, otherwise a first launch on a quiet
            // Sunday shows an empty Today tab and an assistant with nothing to say.
            if dayOffset == 0 { tripCount = max(1, tripCount) }

            for tripIndex in 0..<tripCount {
                let hour = isWeekend ? Int.random(in: 10...19, using: &generator) : (tripIndex == 0 ? 8 : 18)
                let minute = Int.random(in: 0...55, using: &generator)
                guard let candidate = calendar.date(
                    bySettingHour: hour,
                    minute: minute,
                    second: 0,
                    of: day
                ) else { continue }
                // Never seed a trip in the future.
                let date = min(candidate, Date())

                let distance = isWeekend
                    ? Double.random(in: 18...90, using: &generator)
                    : Double.random(in: 6...34, using: &generator)
                let averageSpeed = Double.random(in: 26...62, using: &generator)
                let duration = distance / max(averageSpeed, 1) * 3_600
                // Longer trips drain the pack and fall back to the combustion engine.
                let evShare = max(8, min(100, 104 - distance * 1.15 + Double.random(in: -8...8, using: &generator)))
                let consumption = evShare > 96
                    ? 0
                    : max(0, (100 - evShare) / 100 * Double.random(in: 5.4...7.6, using: &generator))

                let trip = Trip(
                    date: date,
                    distance: (distance * 10).rounded() / 10,
                    duration: duration,
                    averageSpeed: (averageSpeed * 10).rounded() / 10,
                    consumption: (consumption * 10).rounded() / 10,
                    evPercentage: (evShare).rounded(),
                    hevPercentage: (100 - evShare).rounded(),
                    vehicle: vehicle
                )
                context.insert(trip)
            }
        }
        try? context.save()
    }

    private static func seedMaintenanceIfNeeded(context: ModelContext, vehicle: Vehicle) {
        let existing = (try? context.fetchCount(FetchDescriptor<MaintenanceRecord>())) ?? 0
        guard existing == 0 else { return }

        let odometer = vehicle.odometerKm
        let calendar = Calendar.current

        // Past services, expressed relative to the current odometer so the derived
        // "remaining" figures match the values in the product spec.
        let seeds: [(MaintenanceType, Double, Int, Double, String)] = [
            (.engineOil, odometer - 2_800, 120, 4_900, "Замена масла и фильтра, сервис BYD"),
            (.airFilter, odometer - 7_600, 300, 1_200, "Воздушный фильтр двигателя"),
            (.brakeCheck, odometer - 10_000, 190, 0, "Проверка колодок, износ 40%"),
            (.generalService, odometer - 2_800, 342, 6_400, "Плановое ТО")
        ]

        for (type, mileage, daysAgo, cost, notes) in seeds {
            let date = calendar.date(byAdding: .day, value: -daysAgo, to: .now) ?? .now
            context.insert(
                MaintenanceRecord(
                    type: type,
                    date: date,
                    mileage: max(0, mileage),
                    cost: cost,
                    notes: notes,
                    vehicle: vehicle
                )
            )
        }
        try? context.save()
    }
}

/// Deterministic generator so the seeded demo history is stable between launches.
struct SeededRandomGenerator: RandomNumberGenerator {
    private var state: UInt64

    init(seed: UInt64) {
        self.state = seed == 0 ? 0x9E37_79B9_7F4A_7C15 : seed
    }

    mutating func next() -> UInt64 {
        // xorshift64*
        state ^= state >> 12
        state ^= state << 25
        state ^= state >> 27
        return state &* 2_685_821_657_736_338_717
    }
}
