import SwiftData
import SwiftUI

/// Upcoming service items plus the history they are derived from.
struct MaintenanceView: View {

    @Environment(AppServices.self) private var services
    @Environment(\.modelContext) private var modelContext
    @Query(sort: \MaintenanceRecord.date, order: .reverse) private var records: [MaintenanceRecord]
    @State private var isAddingService = false

    private var items: [MaintenanceItem] {
        // Recomputed from `records` so the list updates the moment a service is added.
        MaintenanceService.trackedTypes
            .map { type in
                MaintenanceService.item(
                    for: type,
                    lastRecord: records.first { $0.type == type },
                    odometerKm: services.vehicle.odometerKm
                )
            }
            .sorted { lhs, rhs in
                if lhs.status != rhs.status { return lhs.status > rhs.status }
                return urgency(lhs) < urgency(rhs)
            }
    }

    private func urgency(_ item: MaintenanceItem) -> Double {
        let byDistance = item.remainingKm ?? .greatestFiniteMagnitude
        let byTime = item.remainingDays
            .map { Double($0) * MaintenanceItem.kilometresPerDayEquivalent } ?? .greatestFiniteMagnitude
        return min(byDistance, byTime)
    }

    var body: some View {
        CockpitScreen(
            title: "Maintenance",
            subtitle: "\(Formatters.distance(services.vehicle.odometerKm, fractionDigits: 0)) km"
        ) {
            upcoming

            PrimaryActionButton(
                title: "Add service",
                systemImage: "plus",
                role: .neutral
            ) {
                isAddingService = true
            }

            history
        }
        .sheet(isPresented: $isAddingService) {
            AddServiceView(defaultMileage: services.vehicle.odometerKm) { draft in
                MaintenanceService(context: modelContext).add(
                    type: draft.type,
                    date: draft.date,
                    mileage: draft.mileage,
                    cost: draft.cost,
                    notes: draft.notes,
                    vehicle: services.vehicle
                )
            }
            .preferredColorScheme(.dark)
        }
    }

    private var upcoming: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Upcoming")
            ParameterGroup {
                ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
                    if index > 0 { RowDivider() }
                    MaintenanceRow(item: item)
                }
            }
        }
    }

    @ViewBuilder
    private var history: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "History", trailing: "\(records.count)")
            if records.isEmpty {
                EmptyStateView(
                    title: "Пока пусто",
                    message: "Добавьте первое обслуживание, чтобы приложение считало интервалы."
                )
                .cardSurface()
            } else {
                ParameterGroup {
                    ForEach(Array(records.enumerated()), id: \.element.id) { index, record in
                        if index > 0 { RowDivider() }
                        MaintenanceHistoryRow(record: record)
                            .contextMenu {
                                Button("Удалить", role: .destructive) {
                                    MaintenanceService(context: modelContext).delete(record)
                                }
                            }
                    }
                }
            }
        }
    }
}

// MARK: - Rows

private struct MaintenanceRow: View {
    let item: MaintenanceItem

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(item.type.rawValue)
                    .font(Theme.Typography.title())
                    .foregroundStyle(Theme.Palette.textPrimary)
                if let date = item.lastServiceDate {
                    Text("Последний раз \(Formatters.shortDate(date))")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.Palette.textTertiary)
                } else {
                    Text("Нет данных о прошлом обслуживании")
                        .font(.system(size: 11))
                        .foregroundStyle(Theme.Palette.textTertiary)
                }
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 5) {
                Text(item.isOverdue ? "Просрочено \(item.headlineValue)" : item.headlineValue)
                    .font(Theme.Typography.metricSmall())
                    .foregroundStyle(item.status == .normal ? Theme.Palette.textPrimary : item.status.color)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
                StatusChip(status: item.status, compact: true)
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, Theme.Metrics.cardPadding)
    }
}

private struct MaintenanceHistoryRow: View {
    let record: MaintenanceRecord

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(record.type.rawValue)
                    .font(Theme.Typography.metricSmall())
                    .foregroundStyle(Theme.Palette.textPrimary)
                Text("\(Formatters.shortDate(record.date)) · \(Formatters.distance(record.mileage, fractionDigits: 0)) km")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Palette.textTertiary)
                if !record.notes.isEmpty {
                    Text(record.notes)
                        .font(Theme.Typography.body())
                        .foregroundStyle(Theme.Palette.textSecondary)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 8)
            if record.cost > 0 {
                Text(Formatters.cost(record.cost))
                    .font(Theme.Typography.metricSmall())
                    .foregroundStyle(Theme.Palette.textSecondary)
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, Theme.Metrics.cardPadding)
    }
}

#Preview {
    MaintenanceView().previewCockpit()
}
