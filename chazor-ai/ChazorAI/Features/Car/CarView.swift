import SwiftData
import SwiftUI

/// Everything the app knows about the car, each line carrying its own status.
struct CarView: View {

    @Environment(AppServices.self) private var services
    @Environment(VehicleTelemetryStore.self) private var telemetry
    @Query(sort: \DiagnosticEvent.date, order: .reverse) private var diagnosticHistory: [DiagnosticEvent]
    @State private var showsDataSourcePicker = false

    private var nearestService: MaintenanceItem? {
        services.maintenanceItems().first
    }

    var body: some View {
        NavigationStack {
            CockpitScreen(
                title: "Car",
                subtitle: "Vehicle data",
                accessory: AnyView(
                    Button {
                        showsDataSourcePicker = true
                    } label: {
                        ConnectionBadge(
                            state: telemetry.connectionState,
                            sourceName: telemetry.sourceID.displayName
                        )
                    }
                    .buttonStyle(.plain)
                )
            ) {
                parameters

                if !telemetry.diagnostics.troubleCodes.isEmpty {
                    diagnosticsSection
                }

                if !diagnosticHistory.isEmpty {
                    diagnosticsHistorySection
                }

                NavigationLink {
                    MaintenanceView()
                } label: {
                    HStack {
                        Text("Обслуживание")
                            .font(Theme.Typography.title())
                            .foregroundStyle(Theme.Palette.textPrimary)
                        Spacer()
                        if let nearestService {
                            Text(nearestService.headlineValue)
                                .font(Theme.Typography.metricSmall())
                                .foregroundStyle(Theme.Palette.textSecondary)
                        }
                        Image(systemName: "chevron.right")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Theme.Palette.textTertiary)
                    }
                    .cardSurface()
                }
                .buttonStyle(.plain)

                sourceFootnote
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .confirmationDialog("Источник данных", isPresented: $showsDataSourcePicker, titleVisibility: .visible) {
            ForEach(VehicleDataSourceID.allCases) { source in
                Button(sourceTitle(source)) { services.switchDataSource(to: source) }
            }
            Button("Отмена", role: .cancel) {}
        } message: {
            Text("Демо-данные генерируются в приложении. OBD-II требует Bluetooth-адаптера, CAN — шлюза и карты сигналов.")
        }
    }

    private func sourceTitle(_ source: VehicleDataSourceID) -> String {
        switch source {
        case .mock: return "Demo — встроенный генератор"
        case .bluetoothOBD: return "OBD-II — Bluetooth-адаптер"
        case .can: return "CAN — шлюз (нужна карта сигналов)"
        }
    }

    // MARK: Parameters

    private var parameters: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Parameters", trailing: telemetry.overallStatus.displayName)
            ParameterList(rows: [
                ParameterRowModel(
                    label: "Vehicle",
                    value: services.vehicle.identity.displayName,
                    showsStatus: false
                ),
                ParameterRowModel(
                    label: "Battery",
                    value: Formatters.percent(telemetry.battery.stateOfChargePercent),
                    unit: "%",
                    status: telemetry.batteryStatus
                ),
                ParameterRowModel(
                    label: "12V",
                    value: Formatters.voltage(telemetry.battery.auxiliaryVoltage),
                    unit: "V",
                    status: telemetry.auxiliaryVoltageStatus
                ),
                ParameterRowModel(
                    label: "Temperature",
                    value: Formatters.temperature(telemetry.vehicle.coolantTemperatureC),
                    unit: "°C",
                    status: telemetry.coolantStatus
                ),
                ParameterRowModel(
                    label: "Drive Mode",
                    value: telemetry.vehicle.driveMode.displayName,
                    showsStatus: false
                ),
                ParameterRowModel(
                    label: "Errors",
                    value: "\(telemetry.diagnostics.errorCount)",
                    status: telemetry.diagnosticsStatus
                ),
                ParameterRowModel(
                    label: "Mileage",
                    value: Formatters.distance(services.vehicle.odometerKm, fractionDigits: 0),
                    unit: "km",
                    showsStatus: false
                ),
                ParameterRowModel(
                    label: "Maintenance",
                    value: nearestService?.headlineValue ?? "—",
                    status: nearestService?.status ?? .normal
                )
            ])
        }
    }

    // MARK: Diagnostics

    private var diagnosticsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Diagnostics", trailing: "\(telemetry.diagnostics.errorCount)")
            ParameterGroup {
                ForEach(Array(telemetry.diagnostics.troubleCodes.enumerated()), id: \.element.id) { index, code in
                    if index > 0 { RowDivider() }
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(code.code)
                                .font(Theme.Typography.metricSmall())
                                .foregroundStyle(Theme.Palette.textPrimary)
                            Spacer()
                            StatusChip(status: code.isPending ? .warning : .critical)
                        }
                        Text(code.descriptionText)
                            .font(Theme.Typography.body())
                            .foregroundStyle(Theme.Palette.textSecondary)
                    }
                    .padding(.vertical, 14)
                    .padding(.horizontal, Theme.Metrics.cardPadding)
                }
            }
            Text("Коды читаются, но не стираются: сброс ошибок — операция записи в автомобиль.")
                .font(.system(size: 11))
                .foregroundStyle(Theme.Palette.textTertiary)
        }
    }

    /// Codes that have appeared before, with the odometer reading at the time. A fault
    /// that comes and goes is the hardest kind to describe at a service desk.
    private var diagnosticsHistorySection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Журнал", trailing: "\(diagnosticHistory.count)")
            ParameterGroup {
                ForEach(Array(diagnosticHistory.prefix(10).enumerated()), id: \.element.id) { index, event in
                    if index > 0 { RowDivider() }
                    HStack(spacing: 12) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(event.code)
                                .font(Theme.Typography.metricSmall())
                                .foregroundStyle(Theme.Palette.textPrimary)
                            Text("\(Formatters.shortDate(event.date)) · \(Formatters.distance(event.mileage, fractionDigits: 0)) km")
                                .font(.system(size: 11))
                                .foregroundStyle(Theme.Palette.textTertiary)
                        }
                        Spacer(minLength: 8)
                        Text(event.isCleared ? "Устранено" : "Активно")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(event.isCleared ? Theme.Palette.textTertiary : event.severity.color)
                    }
                    .padding(.vertical, 14)
                    .padding(.horizontal, Theme.Metrics.cardPadding)
                }
            }
        }
    }

    private var sourceFootnote: some View {
        VStack(alignment: .leading, spacing: 6) {
            SectionHeader(title: "Source")
            Text(sourceExplanation)
                .font(Theme.Typography.body())
                .foregroundStyle(Theme.Palette.textSecondary)
                .cardSurface()
        }
    }

    private var sourceExplanation: String {
        switch telemetry.sourceID {
        case .mock:
            return "Демо-режим: данные генерируются на устройстве. Подключите OBD-II адаптер, чтобы видеть реальные значения."
        case .bluetoothOBD:
            return "OBD-II: стандартные параметры читаются напрямую. Заряд тяговой батареи и режим EV/HEV требуют заводских PID, поэтому могут быть недоступны."
        case .can:
            return "CAN: только чтение. Нужна карта сигналов автомобиля из документированного источника — приложение не подбирает идентификаторы самостоятельно."
        }
    }
}

#Preview {
    CarView().previewCockpit()
}
