import Foundation

/// Status of a single displayed parameter.
///
/// The wording is fixed by the product spec: `NORMAL` / `WARNING` / `CRITICAL`.
enum MetricStatus: String, Codable, CaseIterable, Comparable, Sendable {
    case normal = "NORMAL"
    case warning = "WARNING"
    case critical = "CRITICAL"

    private var rank: Int {
        switch self {
        case .normal: return 0
        case .warning: return 1
        case .critical: return 2
        }
    }

    static func < (lhs: MetricStatus, rhs: MetricStatus) -> Bool { lhs.rank < rhs.rank }
}

/// Pure, side-effect free threshold evaluation.
///
/// Kept free of UI and I/O so it can be unit tested and, later, tuned per vehicle
/// without touching any view. Thresholds are *advisory*: the car's own instrument
/// cluster remains the authoritative warning system.
enum HealthRules {

    // MARK: Traction battery

    static func batteryStatus(stateOfChargePercent soc: Double) -> MetricStatus {
        switch soc {
        case ..<8: return .critical
        case ..<15: return .warning
        default: return .normal
        }
    }

    // MARK: 12 V auxiliary battery

    /// A flat 12 V battery is the single most common no-start cause on hybrids,
    /// so it gets its own tile rather than hiding inside "diagnostics".
    static func auxiliaryVoltageStatus(_ volts: Double) -> MetricStatus {
        switch volts {
        case ..<11.8: return .critical
        case ..<12.2: return .warning
        case 15.2...: return .critical      // over-charging / regulator fault
        case 14.9..<15.2: return .warning
        default: return .normal
        }
    }

    // MARK: Coolant temperature

    static func coolantTemperatureStatus(_ celsius: Double) -> MetricStatus {
        switch celsius {
        case 110...: return .critical
        case 103..<110: return .warning
        default: return .normal
        }
    }

    // MARK: Diagnostics

    static func diagnosticsStatus(errorCount: Int, milOn: Bool) -> MetricStatus {
        if milOn { return .critical }
        return errorCount == 0 ? .normal : .warning
    }

    // MARK: Service intervals

    /// - Parameter remainingKm: distance left until the next service item is due.
    ///   Negative values mean the interval has already been exceeded.
    static func serviceStatus(remainingKm: Double) -> MetricStatus {
        switch remainingKm {
        case ..<0: return .critical
        case ..<1_000: return .warning
        default: return .normal
        }
    }

    static func serviceStatus(remainingDays: Int) -> MetricStatus {
        switch remainingDays {
        case ..<0: return .critical
        case ..<30: return .warning
        default: return .normal
        }
    }

    /// Worst status across a set of parameters — used for the single "car health"
    /// summary shown on the home screen and in CarPlay.
    static func aggregate(_ statuses: [MetricStatus]) -> MetricStatus {
        statuses.max() ?? .normal
    }
}
