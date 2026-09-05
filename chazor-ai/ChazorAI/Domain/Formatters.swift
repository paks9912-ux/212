import Foundation

/// Number and date formatting shared by the phone UI, CarPlay and the assistant.
///
/// Cockpit rule: values are rounded to what a driver can read at a glance, and thousands
/// are separated with a narrow space ("84 320 km") rather than a comma, which reads as a
/// decimal point in most of the markets this car is sold in.
enum Formatters {

    private static let groupingSeparator = "\u{2009}"  // thin space

    private static func number(_ value: Double, fractionDigits: Int, grouping: Bool) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = grouping ? .decimal : .none
        formatter.minimumFractionDigits = fractionDigits
        formatter.maximumFractionDigits = fractionDigits
        formatter.groupingSeparator = groupingSeparator
        formatter.decimalSeparator = ","
        formatter.usesGroupingSeparator = grouping
        return formatter.string(from: NSNumber(value: value)) ?? "—"
    }

    /// "84 320", "24,7" — grouped, no unit.
    static func distance(_ km: Double, fractionDigits: Int? = nil) -> String {
        let digits = fractionDigits ?? (abs(km) >= 100 ? 0 : 1)
        return number(km, fractionDigits: digits, grouping: true)
    }

    /// "68" — speed is always a whole number in a cockpit.
    static func speed(_ kph: Double) -> String {
        number(kph.rounded(), fractionDigits: 0, grouping: false)
    }

    /// "74"
    static func percent(_ value: Double) -> String {
        number(value.rounded(), fractionDigits: 0, grouping: false)
    }

    /// "4,3"
    static func consumption(_ litresPer100km: Double) -> String {
        number(litresPer100km, fractionDigits: 1, grouping: false)
    }

    /// "12,6"
    static func voltage(_ volts: Double) -> String {
        number(volts, fractionDigits: 1, grouping: false)
    }

    /// "91"
    static func temperature(_ celsius: Double) -> String {
        number(celsius.rounded(), fractionDigits: 0, grouping: false)
    }

    /// "1 ч 12 мин" / "38 мин"
    static func duration(_ seconds: TimeInterval) -> String {
        let total = Int(max(0, seconds.rounded()))
        let hours = total / 3_600
        let minutes = (total % 3_600) / 60
        if hours > 0 { return "\(hours) ч \(minutes) мин" }
        if minutes > 0 { return "\(minutes) мин" }
        return "\(total) с"
    }

    /// Currency without a symbol — the prototype does not assume a market.
    static func cost(_ value: Double) -> String {
        number(value, fractionDigits: 0, grouping: true)
    }

    // MARK: Russian plural agreement
    //
    // The assistant speaks its answers aloud, and "82 километров" is immediately audible as
    // wrong. Numbers that reach a sentence go through here.

    /// Picks the grammatical form for a count: 1 километр, 2 километра, 5 километров.
    static func plural(_ count: Int, _ one: String, _ few: String, _ many: String) -> String {
        let absolute = abs(count)
        let lastTwo = absolute % 100
        if (11...14).contains(lastTwo) { return many }
        switch absolute % 10 {
        case 1: return one
        case 2...4: return few
        default: return many
        }
    }

    /// "82 километра". A fractional value always takes the `few` form ("4,3 литра").
    static func plural(_ value: Double, _ one: String, _ few: String, _ many: String) -> String {
        if value != value.rounded() { return few }
        return plural(Int(value.rounded()), one, few, many)
    }

    static func kilometres(_ value: Double) -> String { plural(value, "километр", "километра", "километров") }
    static func percentWord(_ value: Double) -> String { plural(value, "процент", "процента", "процентов") }
    static func days(_ value: Int) -> String { plural(value, "день", "дня", "дней") }
    static func trips(_ value: Int) -> String { plural(value, "поездку", "поездки", "поездок") }

    static func shortDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "d MMM yyyy"
        return formatter.string(from: date)
    }

    static func dayLabel(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "d MMM"
        return formatter.string(from: date)
    }

    static func time(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        return formatter.string(from: date)
    }
}
