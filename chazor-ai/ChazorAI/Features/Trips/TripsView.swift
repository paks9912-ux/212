import Charts
import SwiftData
import SwiftUI

/// Trip statistics: what is happening now, and how it compares with the recent past.
struct TripsView: View {

    @Environment(VehicleTelemetryStore.self) private var telemetry
    @Query(sort: \Trip.date, order: .reverse) private var allTrips: [Trip]
    @State private var period: TripPeriod = .today

    private var range: Range<Date> { period.dateRange() }
    private var trips: [Trip] { allTrips.filter { range.contains($0.date) } }
    private var summary: TripAggregate { TripHistoryService.aggregate(trips) }

    var body: some View {
        CockpitScreen(title: "Trips", subtitle: "Statistics") {
            currentTripCard
            periodPicker
            summaryGrid
            distanceChart
            energySplit
            tripList
        }
    }

    // MARK: Current trip

    private var currentTripCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionHeader(
                title: "Current trip",
                trailing: telemetry.isDriving ? "In progress" : "Parked"
            )
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text(Formatters.distance(telemetry.trip.distanceKm))
                    .font(Theme.Typography.speed())
                    .foregroundStyle(Theme.Palette.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                Text("km")
                    .font(Theme.Typography.unit())
                    .foregroundStyle(Theme.Palette.textSecondary)
            }
            HStack(spacing: 0) {
                inlineStat("Avg speed", Formatters.speed(telemetry.trip.averageSpeedKph), "km/h")
                inlineStat("Consumption", Formatters.consumption(telemetry.trip.consumptionLper100km), "L/100")
                inlineStat("Time", Formatters.duration(telemetry.trip.duration), nil)
            }
            EnergySplitBar(
                evPercentage: telemetry.trip.evPercentage,
                hevPercentage: telemetry.trip.hevPercentage
            )
        }
        .cardSurface()
    }

    private func inlineStat(_ label: String, _ value: String, _ unit: String?) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label).cockpitLabel()
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value)
                    .font(Theme.Typography.metricSmall())
                    .foregroundStyle(Theme.Palette.textPrimary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                if let unit {
                    Text(unit)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(Theme.Palette.textTertiary)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Period

    private var periodPicker: some View {
        HStack(spacing: 6) {
            ForEach(TripPeriod.allCases) { item in
                Button {
                    period = item
                } label: {
                    Text(item.rawValue)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(period == item ? Color.white : Theme.Palette.textSecondary)
                        .frame(maxWidth: .infinity)
                        .frame(height: 40)
                        .background(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .fill(period == item ? Theme.Palette.surfaceElevated : Color.white.opacity(0.03))
                        )
                }
                .buttonStyle(.plain)
            }
        }
    }

    // MARK: Summary

    private var summaryGrid: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                MetricCard(
                    label: "Distance",
                    value: Formatters.distance(summary.distanceKm),
                    unit: "km"
                )
                MetricCard(
                    label: "Avg speed",
                    value: Formatters.speed(summary.averageSpeedKph),
                    unit: "km/h"
                )
            }
            HStack(spacing: 12) {
                MetricCard(
                    label: "Consumption",
                    value: Formatters.consumption(summary.consumptionLper100km),
                    unit: "L/100 km"
                )
                MetricCard(
                    label: "Driving time",
                    value: Formatters.duration(summary.duration),
                    unit: nil
                )
            }
            HStack(spacing: 12) {
                MetricCard(
                    label: "EV",
                    value: Formatters.percent(summary.evPercentage),
                    unit: "%",
                    tint: Theme.Palette.evTint
                )
                MetricCard(
                    label: "HEV",
                    value: Formatters.percent(summary.hevPercentage),
                    unit: "%",
                    tint: Theme.Palette.hevTint
                )
            }
        }
    }

    // MARK: Chart

    private var buckets: [TripDayBucket] {
        TripHistoryService.dailyBuckets(trips: trips, in: range)
    }

    @ViewBuilder
    private var distanceChart: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "Distance", trailing: "km")
            if summary.isEmpty {
                EmptyStateView(title: "Нет поездок", message: "За выбранный период данных нет.")
            } else if period.dayCount == 1 {
                perTripChart
            } else {
                perDayChart
            }
        }
        .cardSurface()
    }

    /// A single day is better read trip by trip than as one tall bar.
    private var perTripChart: some View {
        Chart(trips.reversed()) { trip in
            BarMark(
                x: .value("Time", Formatters.time(trip.date)),
                y: .value("Distance", trip.distance)
            )
            .foregroundStyle(barGradient(evPercentage: trip.evPercentage))
            .cornerRadius(4)
        }
        .chartYAxis { axisMarks }
        .chartXAxis { AxisMarks { axisLabel($0.as(String.self) ?? "") } }
        .frame(height: 170)
    }

    private var perDayChart: some View {
        Chart(buckets) { bucket in
            BarMark(
                x: .value("Day", bucket.day, unit: .day),
                y: .value("Distance", bucket.distanceKm)
            )
            .foregroundStyle(barGradient(evPercentage: bucket.evPercentage))
            .cornerRadius(3)
        }
        .chartYAxis { axisMarks }
        .chartXAxis {
            AxisMarks(values: .stride(by: .day, count: period.dayCount > 10 ? 7 : 1)) { value in
                axisLabel(value.as(Date.self).map(Formatters.dayLabel) ?? "")
            }
        }
        .frame(height: 170)
    }

    /// Greener bars mean more of that distance was covered electrically — the chart
    /// carries the EV share without needing a second series.
    private func barGradient(evPercentage: Double) -> LinearGradient {
        let share = min(1, max(0, evPercentage / 100))
        return LinearGradient(
            colors: [
                Theme.Palette.evTint.opacity(0.35 + 0.55 * share),
                Theme.Palette.hevTint.opacity(0.30 + 0.30 * (1 - share))
            ],
            startPoint: .bottom,
            endPoint: .top
        )
    }

    private var axisMarks: some AxisContent {
        AxisMarks(position: .leading) { value in
            AxisGridLine().foregroundStyle(Theme.Palette.hairline)
            AxisValueLabel {
                Text(Formatters.distance(value.as(Double.self) ?? 0, fractionDigits: 0))
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Theme.Palette.textTertiary)
            }
        }
    }

    private func axisLabel(_ text: String) -> some AxisMark {
        AxisValueLabel {
            Text(text)
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(Theme.Palette.textTertiary)
        }
    }

    // MARK: Energy split

    private var energySplit: some View {
        VStack(alignment: .leading, spacing: 12) {
            SectionHeader(title: "Energy split", trailing: period.rawValue)
            EnergySplitBar(
                evPercentage: summary.evPercentage,
                hevPercentage: summary.hevPercentage
            )
        }
        .cardSurface()
    }

    // MARK: List

    @ViewBuilder
    private var tripList: some View {
        if !trips.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionHeader(title: "Trips", trailing: "\(trips.count)")
                ParameterGroup {
                    ForEach(Array(trips.prefix(20).enumerated()), id: \.element.id) { index, trip in
                        if index > 0 { RowDivider() }
                        TripRow(trip: trip)
                    }
                }
            }
        }
    }
}

// MARK: - Rows

private struct TripRow: View {
    let trip: Trip

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                Text(Formatters.time(trip.date))
                    .font(Theme.Typography.metricSmall())
                    .foregroundStyle(Theme.Palette.textPrimary)
                Text(Formatters.shortDate(trip.date))
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Palette.textTertiary)
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 3) {
                Text("\(Formatters.distance(trip.distance)) km")
                    .font(Theme.Typography.metricSmall())
                    .foregroundStyle(Theme.Palette.textPrimary)
                Text("\(Formatters.consumption(trip.consumption)) L/100 · EV \(Formatters.percent(trip.evPercentage))%")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Palette.textTertiary)
            }
        }
        .padding(.vertical, 13)
        .padding(.horizontal, Theme.Metrics.cardPadding)
    }
}

/// Two-segment bar showing how much of the distance was electric.
struct EnergySplitBar: View {
    let evPercentage: Double
    let hevPercentage: Double

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            GeometryReader { proxy in
                HStack(spacing: 2) {
                    Capsule()
                        .fill(Theme.Palette.evTint)
                        .frame(width: width(for: evPercentage, in: proxy.size.width))
                    Capsule()
                        .fill(Theme.Palette.hevTint.opacity(0.55))
                }
            }
            .frame(height: 8)

            HStack(spacing: 16) {
                legend(color: Theme.Palette.evTint, title: "EV", value: evPercentage)
                legend(color: Theme.Palette.hevTint.opacity(0.55), title: "HEV", value: hevPercentage)
                Spacer(minLength: 0)
            }
        }
    }

    private func width(for percentage: Double, in total: CGFloat) -> CGFloat {
        let share = min(1, max(0, percentage / 100))
        return max(0, total * share - 1)
    }

    private func legend(color: Color, title: String, value: Double) -> some View {
        HStack(spacing: 6) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text("\(title) \(Formatters.percent(value))%")
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Theme.Palette.textSecondary)
                .monospacedDigit()
        }
    }
}

#Preview {
    TripsView().previewCockpit()
}
