import SwiftUI

// MARK: - Status

struct StatusChip: View {
    let status: MetricStatus
    var compact = false

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(status.color)
                .frame(width: 6, height: 6)
            if !compact {
                Text(status.displayName)
                    .font(Theme.Typography.label())
                    .tracking(1.2)
                    .foregroundStyle(status == .normal ? Theme.Palette.textSecondary : status.color)
            }
        }
        .padding(.horizontal, compact ? 6 : 9)
        .padding(.vertical, 5)
        .background(
            Capsule().fill(status == .normal ? Color.white.opacity(0.05) : status.color.opacity(0.14))
        )
        .accessibilityLabel(Text(status.displayName))
    }
}

// MARK: - Section header

struct SectionHeader: View {
    let title: String
    var trailing: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title).cockpitLabel()
            Spacer(minLength: 8)
            if let trailing {
                Text(trailing)
                    .font(Theme.Typography.label())
                    .tracking(1.2)
                    .foregroundStyle(Theme.Palette.textTertiary)
            }
        }
    }
}

// MARK: - Metric card

/// The workhorse tile: a label, a big number, a unit, and optionally a status dot.
struct MetricCard: View {
    let label: String
    let value: String
    var unit: String?
    var status: MetricStatus?
    var tint: Color = Theme.Palette.textPrimary

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(label).cockpitLabel()
                Spacer(minLength: 4)
                if let status, status != .normal {
                    StatusChip(status: status, compact: true)
                }
            }
            HStack(alignment: .firstTextBaseline, spacing: 5) {
                Text(value)
                    .font(Theme.Typography.metric())
                    .foregroundStyle(tint)
                    .lineLimit(1)
                    .minimumScaleFactor(0.6)
                if let unit {
                    Text(unit)
                        .font(Theme.Typography.unit())
                        .foregroundStyle(Theme.Palette.textSecondary)
                }
            }
        }
        .cardSurface()
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text("\(label): \(value) \(unit ?? "")"))
    }
}

// MARK: - Parameter row

/// One line of the car screen: name on the left, value and status on the right.
struct ParameterRow: View {
    let label: String
    let value: String
    var unit: String?
    var status: MetricStatus = .normal
    var showsStatus = true

    var body: some View {
        HStack(spacing: 12) {
            Text(label)
                .font(Theme.Typography.body())
                .foregroundStyle(Theme.Palette.textSecondary)
            Spacer(minLength: 8)
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(value)
                    .font(Theme.Typography.metricSmall())
                    .foregroundStyle(Theme.Palette.textPrimary)
                if let unit {
                    Text(unit)
                        .font(Theme.Typography.unit())
                        .foregroundStyle(Theme.Palette.textSecondary)
                }
            }
            if showsStatus {
                StatusChip(status: status, compact: true)
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, Theme.Metrics.cardPadding)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// Groups `ParameterRow`s into one surface with hairline separators.
struct ParameterGroup<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 0) {
            content
        }
        .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Metrics.cardRadius, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Metrics.cardRadius, style: .continuous)
                .strokeBorder(Theme.Palette.hairline, lineWidth: 1)
        )
    }
}

/// Declarative description of one row, so a screen can pass an array instead of
/// hand-interleaving rows and separators.
struct ParameterRowModel: Identifiable {
    let id: String
    var label: String
    var value: String
    var unit: String?
    var status: MetricStatus = .normal
    var showsStatus = true

    init(
        label: String,
        value: String,
        unit: String? = nil,
        status: MetricStatus = .normal,
        showsStatus: Bool = true
    ) {
        self.id = label
        self.label = label
        self.value = value
        self.unit = unit
        self.status = status
        self.showsStatus = showsStatus
    }
}

struct ParameterList: View {
    let rows: [ParameterRowModel]

    var body: some View {
        ParameterGroup {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, row in
                if index > 0 { RowDivider() }
                ParameterRow(
                    label: row.label,
                    value: row.value,
                    unit: row.unit,
                    status: row.status,
                    showsStatus: row.showsStatus
                )
            }
        }
    }
}

struct RowDivider: View {
    var body: some View {
        Rectangle()
            .fill(Theme.Palette.hairline)
            .frame(height: 1)
            .padding(.leading, Theme.Metrics.cardPadding)
    }
}

// MARK: - Primary action

/// The one button that is meant to be hit without looking.
struct PrimaryActionButton: View {
    let title: String
    var systemImage: String?
    var isBusy = false
    var role: Role = .accent
    let action: () -> Void

    enum Role { case accent, neutral }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                if isBusy {
                    ProgressView()
                        .progressViewStyle(.circular)
                        .tint(.white)
                } else if let systemImage {
                    Image(systemName: systemImage)
                        .font(.system(size: 18, weight: .semibold))
                }
                Text(title)
                    .font(.system(size: 17, weight: .semibold))
                    .tracking(1.4)
                    .textCase(.uppercase)
            }
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .frame(height: Theme.Metrics.primaryButtonHeight)
            .background(
                RoundedRectangle(cornerRadius: Theme.Metrics.controlRadius, style: .continuous)
                    .fill(role == .accent ? Theme.Palette.accent : Theme.Palette.surfaceElevated)
            )
        }
        .buttonStyle(PressableButtonStyle())
    }
}

struct PressableButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(configuration.isPressed ? 0.82 : 1)
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - Battery

/// Charge level plus drive mode plus remaining range — the three numbers a hybrid driver
/// actually looks at, in one line.
struct BatteryIndicator: View {
    let percent: Double
    let rangeKm: Double
    let mode: DriveMode
    var status: MetricStatus = .normal

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: mode == .charging ? "bolt.fill" : "battery.100percent")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(status == .normal ? mode.tint : status.color)
                Text("\(Formatters.percent(percent))%")
                    .font(Theme.Typography.metric())
                    .foregroundStyle(Theme.Palette.textPrimary)
                Text(mode.displayName)
                    .font(Theme.Typography.label())
                    .tracking(Theme.Metrics.labelTracking)
                    .foregroundStyle(mode.tint)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(mode.tint.opacity(0.14)))
                Spacer(minLength: 8)
                Text("Range \(Formatters.distance(rangeKm, fractionDigits: 0)) km")
                    .font(Theme.Typography.body())
                    .foregroundStyle(Theme.Palette.textSecondary)
                    .monospacedDigit()
            }

            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(Color.white.opacity(0.07))
                    Capsule()
                        .fill(status == .normal ? mode.tint : status.color)
                        .frame(width: max(4, proxy.size.width * min(1, max(0, percent / 100))))
                }
            }
            .frame(height: 6)
        }
        .cardSurface()
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text("Battery \(Formatters.percent(percent)) percent, range \(Formatters.distance(rangeKm, fractionDigits: 0)) kilometres"))
    }
}

// MARK: - Connection

struct ConnectionBadge: View {
    let state: ConnectionState
    let sourceName: String

    private var color: Color {
        switch state {
        case .connected: return Theme.Palette.statusNormal
        case .scanning, .connecting: return Theme.Palette.statusWarning
        case .failed: return Theme.Palette.statusCritical
        case .disconnected: return Theme.Palette.textTertiary
        }
    }

    var body: some View {
        HStack(spacing: 7) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(sourceName)
                .font(Theme.Typography.label())
                .tracking(1.2)
                .foregroundStyle(Theme.Palette.textSecondary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Capsule().fill(Color.white.opacity(0.05)))
    }
}

// MARK: - Empty state

struct EmptyStateView: View {
    let title: String
    var message: String?

    var body: some View {
        VStack(spacing: 8) {
            Text(title)
                .font(Theme.Typography.title())
                .foregroundStyle(Theme.Palette.textPrimary)
            if let message {
                Text(message)
                    .font(Theme.Typography.body())
                    .foregroundStyle(Theme.Palette.textSecondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 32)
    }
}
