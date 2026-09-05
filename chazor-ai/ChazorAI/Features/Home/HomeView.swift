import SwiftUI

/// The glance screen. One number dominates, everything else is secondary.
///
/// The speed shown here is a *mirror* of what the adapter reports, offered for context
/// while the phone sits in a cradle. It is not a speedometer: the car's own cluster is the
/// legal and authoritative instrument, and this figure inherits the adapter's latency.
struct HomeView: View {

    var onAskClaude: () -> Void

    @Environment(AppServices.self) private var services
    @Environment(VehicleTelemetryStore.self) private var telemetry

    var body: some View {
        CockpitScreen(
            title: "Chazor AI",
            subtitle: services.vehicle.identity.displayName,
            accessory: AnyView(
                ConnectionBadge(
                    state: telemetry.connectionState,
                    sourceName: telemetry.connectionState.isConnected
                        ? telemetry.sourceID.displayName
                        : telemetry.connectionState.displayName
                )
            )
        ) {
            speedReadout

            BatteryIndicator(
                percent: telemetry.battery.stateOfChargePercent,
                rangeKm: telemetry.battery.estimatedRangeKm,
                mode: telemetry.vehicle.driveMode,
                status: telemetry.batteryStatus
            )

            HStack(spacing: 12) {
                MetricCard(
                    label: "Trip",
                    value: Formatters.distance(telemetry.trip.distanceKm),
                    unit: "km"
                )
                MetricCard(
                    label: "Consumption",
                    value: Formatters.consumption(telemetry.trip.consumptionLper100km),
                    unit: "L/100 km"
                )
            }

            if telemetry.overallStatus != .normal {
                attentionRow
            }

            PrimaryActionButton(title: "Ask Claude", systemImage: "waveform", action: onAskClaude)
                .padding(.top, 4)

            Text("Штатная приборная панель остаётся основным источником данных.")
                .font(.system(size: 11))
                .foregroundStyle(Theme.Palette.textTertiary)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.top, 2)
        }
    }

    // MARK: Speed

    private var speedReadout: some View {
        VStack(spacing: 0) {
            Text(Formatters.speed(telemetry.vehicle.speedKph))
                .font(Theme.Typography.speed())
                .foregroundStyle(Theme.Palette.textPrimary)
                .contentTransition(.numericText())
                .animation(.easeOut(duration: 0.25), value: telemetry.vehicle.speedKph)
                .lineLimit(1)
                .minimumScaleFactor(0.5)

            Text("km/h")
                .font(Theme.Typography.label())
                .tracking(Theme.Metrics.labelTracking)
                .textCase(.uppercase)
                .foregroundStyle(Theme.Palette.textSecondary)
                .padding(.top, -4)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text("Speed \(Formatters.speed(telemetry.vehicle.speedKph)) kilometres per hour"))
    }

    // MARK: Attention

    /// Only rendered when something is actually wrong — a permanently visible "all good"
    /// banner trains the eye to ignore the one time it turns red.
    private var attentionRow: some View {
        HStack(spacing: 12) {
            StatusChip(status: telemetry.overallStatus)
            Text(attentionMessage)
                .font(Theme.Typography.body())
                .foregroundStyle(Theme.Palette.textPrimary)
                .lineLimit(2)
            Spacer(minLength: 0)
        }
        .cardSurface()
    }

    private var attentionMessage: String {
        if telemetry.diagnosticsStatus != .normal {
            return "Диагностика: \(telemetry.diagnostics.errorCount) ошибк(и)"
        }
        if telemetry.coolantStatus != .normal {
            return "Температура двигателя \(Formatters.temperature(telemetry.vehicle.coolantTemperatureC)) °C"
        }
        if telemetry.auxiliaryVoltageStatus != .normal {
            return "Бортовая сеть \(Formatters.voltage(telemetry.battery.auxiliaryVoltage)) V"
        }
        return "Заряд батареи \(Formatters.percent(telemetry.battery.stateOfChargePercent)) %"
    }
}

#Preview {
    HomeView(onAskClaude: {})
        .previewCockpit()
}
