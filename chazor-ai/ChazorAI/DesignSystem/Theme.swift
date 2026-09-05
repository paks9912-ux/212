import SwiftUI

/// The visual language: graphite surfaces, white type, one red accent.
///
/// The reference is a factory digital cockpit, not a phone dashboard — so: no cards
/// floating on gradients, no decorative iconography, no colour used for delight. Colour
/// carries exactly one meaning here, which is status, and it is spent sparingly so that
/// a red chip in the corner of the eye actually means something.
enum Theme {

    // MARK: Colour

    enum Palette {
        /// Near-black, never pure black: OLED pure black makes thin white type shimmer
        /// against a moving background.
        static let background = Color(red: 0.039, green: 0.043, blue: 0.047)
        static let surface = Color(red: 0.075, green: 0.082, blue: 0.090)
        static let surfaceElevated = Color(red: 0.106, green: 0.114, blue: 0.125)
        static let hairline = Color.white.opacity(0.08)

        static let textPrimary = Color.white
        static let textSecondary = Color(red: 0.56, green: 0.58, blue: 0.61)
        static let textTertiary = Color(red: 0.38, green: 0.40, blue: 0.43)

        /// The single accent. Used for the primary action and for critical status only.
        static let accent = Color(red: 0.882, green: 0.129, blue: 0.157)
        static let accentPressed = Color(red: 0.741, green: 0.106, blue: 0.129)

        static let statusNormal = Color(red: 0.36, green: 0.78, blue: 0.53)
        static let statusWarning = Color(red: 0.96, green: 0.69, blue: 0.25)
        static let statusCritical = accent

        static let evTint = Color(red: 0.36, green: 0.78, blue: 0.53)
        static let hevTint = Color(red: 0.60, green: 0.64, blue: 0.70)
    }

    // MARK: Type
    //
    // One family, four sizes, monospaced digits everywhere a number can change — a speed
    // that shifts its own layout as it counts up is unreadable at a glance.

    enum Typography {
        static func speed() -> Font {
            .system(size: 108, weight: .regular, design: .rounded).monospacedDigit()
        }

        static func metric() -> Font {
            .system(size: 30, weight: .medium, design: .rounded).monospacedDigit()
        }

        static func metricSmall() -> Font {
            .system(size: 21, weight: .medium, design: .rounded).monospacedDigit()
        }

        static func title() -> Font {
            .system(size: 19, weight: .semibold)
        }

        static func body() -> Font {
            .system(size: 15, weight: .regular)
        }

        /// Wide-tracked micro caps for labels. The tracking is what makes it read as
        /// instrumentation rather than as small body text.
        static func label() -> Font {
            .system(size: 11, weight: .semibold)
        }

        static func unit() -> Font {
            .system(size: 13, weight: .semibold)
        }
    }

    // MARK: Metrics

    enum Metrics {
        static let screenPadding: CGFloat = 20
        static let cardPadding: CGFloat = 16
        static let cardRadius: CGFloat = 18
        static let controlRadius: CGFloat = 16
        /// Apple's minimum is 44 pt; in a moving car the realistic minimum is larger.
        static let minimumTouchTarget: CGFloat = 56
        static let primaryButtonHeight: CGFloat = 64
        static let labelTracking: CGFloat = 1.6
    }
}

// MARK: - Status colours

extension MetricStatus {
    var color: Color {
        switch self {
        case .normal: return Theme.Palette.statusNormal
        case .warning: return Theme.Palette.statusWarning
        case .critical: return Theme.Palette.statusCritical
        }
    }

    /// Localised for the driver; the raw value stays English for logs and the AI context.
    var displayName: String { rawValue }
}

extension DriveMode {
    var tint: Color {
        switch self {
        case .ev: return Theme.Palette.evTint
        case .hev: return Theme.Palette.hevTint
        case .charging: return Theme.Palette.evTint
        case .unknown: return Theme.Palette.textTertiary
        }
    }
}

// MARK: - Shared modifiers

struct CockpitLabel: ViewModifier {
    func body(content: Content) -> some View {
        content
            .font(Theme.Typography.label())
            .tracking(Theme.Metrics.labelTracking)
            .foregroundStyle(Theme.Palette.textSecondary)
            .textCase(.uppercase)
    }
}

struct CardSurface: ViewModifier {
    var padding: CGFloat = Theme.Metrics.cardPadding

    func body(content: Content) -> some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.Palette.surface, in: RoundedRectangle(cornerRadius: Theme.Metrics.cardRadius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Metrics.cardRadius, style: .continuous)
                    .strokeBorder(Theme.Palette.hairline, lineWidth: 1)
            )
    }
}

extension View {
    func cockpitLabel() -> some View { modifier(CockpitLabel()) }
    func cardSurface(padding: CGFloat = Theme.Metrics.cardPadding) -> some View {
        modifier(CardSurface(padding: padding))
    }
}
