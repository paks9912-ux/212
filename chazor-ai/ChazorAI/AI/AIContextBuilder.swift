import Foundation
import SwiftData

/// Assembles the one object the assistant is allowed to see.
///
/// Nothing else in the app hands data to an AI service, so this is the single place to
/// audit what leaves the device. Personal identifiers (VIN, location, contacts) are not
/// collected and are not part of `AssistantContext`.
@MainActor
struct AIContextBuilder {

    let telemetry: VehicleTelemetryStore
    let context: ModelContext
    let vehicle: Vehicle

    /// Periods the assistant can compare against each other.
    static let historyPeriods: [TripPeriod] = [.today, .yesterday, .last7Days, .last30Days]

    func build(now: Date = .now) -> AssistantContext {
        let history = TripHistoryService(context: context)
        let maintenance = MaintenanceService(context: context)
        let frame = telemetry.frame

        let periods = Self.historyPeriods.map { period -> AssistantContext.PeriodContext in
            let summary = history.aggregate(for: period, now: now)
            return AssistantContext.PeriodContext(
                period: period.rawValue,
                tripCount: summary.tripCount,
                distanceKm: rounded(summary.distanceKm),
                durationMinutes: rounded(summary.duration / 60),
                averageSpeedKph: rounded(summary.averageSpeedKph),
                consumptionLper100km: rounded(summary.consumptionLper100km),
                evPercentage: rounded(summary.evPercentage)
            )
        }

        let items = maintenance.upcomingItems(odometerKm: vehicle.odometerKm, now: now)
            .map { item in
                AssistantContext.MaintenanceContext(
                    item: item.type.rawValue,
                    remainingKm: item.remainingKm.map(rounded),
                    remainingDays: item.remainingDays,
                    status: item.status.rawValue,
                    lastServiceDate: item.lastServiceDate.map(Formatters.shortDate),
                    lastServiceMileageKm: item.lastServiceMileage.map(rounded)
                )
            }

        return AssistantContext(
            vehicle: vehicle.identity.displayName,
            speed: rounded(frame.vehicle.speedKph),
            battery: rounded(frame.battery.stateOfChargePercent),
            driveMode: frame.vehicle.driveMode.rawValue,
            temperature: rounded(frame.vehicle.coolantTemperatureC),
            errors: frame.diagnostics.errorCount,
            tripDistance: rounded(frame.trip.distanceKm),
            consumption: rounded(frame.trip.consumptionLper100km),
            rangeKm: rounded(frame.battery.estimatedRangeKm),
            auxiliaryVoltage: rounded(frame.battery.auxiliaryVoltage),
            odometerKm: rounded(vehicle.odometerKm),
            isDriving: telemetry.isDriving,
            dataSource: telemetry.sourceID.displayName,
            currentTrip: AssistantContext.TripContext(
                distanceKm: rounded(frame.trip.distanceKm),
                durationMinutes: rounded(frame.trip.duration / 60),
                averageSpeedKph: rounded(frame.trip.averageSpeedKph),
                consumptionLper100km: rounded(frame.trip.consumptionLper100km),
                evPercentage: rounded(frame.trip.evPercentage),
                hevPercentage: rounded(frame.trip.hevPercentage)
            ),
            history: periods,
            maintenance: items,
            diagnostics: frame.diagnostics.troubleCodes.map {
                AssistantContext.DiagnosticContext(
                    code: $0.code,
                    descriptionText: $0.descriptionText,
                    isPending: $0.isPending
                )
            },
            generatedAt: now
        )
    }

    /// One decimal place everywhere: the model does not need more precision than the
    /// dashboard shows, and shorter numbers mean shorter, cheaper prompts.
    private func rounded(_ value: Double) -> Double {
        (value * 10).rounded() / 10
    }
}
