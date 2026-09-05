import Foundation

/// A rule-based assistant that answers from `AssistantContext` with no network call.
///
/// It exists for three reasons: the prototype has to work in a demo with no API key, the
/// car is often out of coverage, and every answer here is a specification of what a good
/// Claude answer looks like — short, specific, and never inventing a number.
final class OfflineAIService: AIService {

    let displayName = "Offline"
    var isConfigured: Bool { true }

    func answer(
        to question: String,
        context: AssistantContext,
        history: [AssistantTurn]
    ) async throws -> AssistantAnswer {
        Self.answer(to: question, context: context)
    }

    // MARK: Intent matching

    enum Intent: CaseIterable {
        case carHealth
        case consumptionToday
        case consumptionComparison
        case consumptionCause
        case distanceToday
        case nextService
        case batteryRange
        case errors
        case tripSummary
        case control
    }

    /// Keywords are matched against a lowercased question. Russian first, English second,
    /// because the car is used in a Russian-speaking market and the driver speaks first.
    private static let keywords: [(Intent, [String])] = [
        (.control, ["открой", "закрой", "заведи", "включи", "выключи", "разблокируй", "unlock", "start engine", "turn on"]),
        (.consumptionComparison, ["сравни", "по сравнению", "прошлой недел", "прошлая недел", "compare", "last week"]),
        (.consumptionCause, ["почему", "вырос", "выросл", "больше стал", "why", "increase"]),
        (.consumptionToday, ["расход", "литр", "потребление", "consumption", "fuel"]),
        (.distanceToday, ["сколько проехал", "проехал", "километр", "пробег за", "distance", "how far"]),
        (.nextService, ["то", "обслуж", "сервис", "масло", "фильтр", "service", "maintenance", "oil"]),
        (.batteryRange, ["батаре", "заряд", "запас хода", "аккум", "battery", "charge", "range"]),
        (.errors, ["ошиб", "неисправ", "чек", "error", "fault", "check engine"]),
        (.carHealth, ["состоян", "как машина", "всё в порядке", "все в порядке", "status", "how is the car"]),
        (.tripSummary, ["поездк", "trip", "маршрут"])
    ]

    static func intent(for question: String) -> Intent {
        let text = question.lowercased()
        for (intent, words) in keywords where words.contains(where: { matches(word: $0, in: text) }) {
            return intent
        }
        return .carHealth
    }

    /// "ТО" must not match inside "автомобиль" or "потом", so a two-letter keyword is
    /// only accepted as a standalone word.
    private static func matches(word: String, in text: String) -> Bool {
        guard word.count <= 2 else { return text.contains(word) }
        let separators = CharacterSet.alphanumerics.inverted
        return text.components(separatedBy: separators).contains(word)
    }

    // MARK: Answers

    static func answer(to question: String, context: AssistantContext) -> AssistantAnswer {
        switch intent(for: question) {
        case .control:
            return AssistantAnswer(
                headline: "Я не управляю машиной — только показываю данные.",
                detail: "Свет, двери и режимы движения остаются за штатными системами автомобиля."
            )

        case .carHealth:
            return carHealth(context)

        case .consumptionToday:
            guard let today = context.history.first(where: { $0.period == TripPeriod.today.rawValue }),
                  today.tripCount > 0 else {
                return AssistantAnswer(headline: "Сегодня поездок ещё не было.", detail: nil)
            }
            return AssistantAnswer(
                headline: "Сегодня \(Formatters.consumption(today.consumptionLper100km)) литра на сто, "
                    + "\(Formatters.distance(today.distanceKm)) \(Formatters.kilometres(today.distanceKm)).",
                detail: "На электротяге \(Formatters.percent(today.evPercentage)) "
                    + "\(Formatters.percentWord(today.evPercentage)) пути."
            )

        case .consumptionComparison:
            return consumptionComparison(context)

        case .consumptionCause:
            return consumptionCause(context)

        case .distanceToday:
            guard let today = context.history.first(where: { $0.period == TripPeriod.today.rawValue }) else {
                return AssistantAnswer(headline: "Нет данных о сегодняшних поездках.", detail: nil)
            }
            guard today.tripCount > 0 else {
                return AssistantAnswer(headline: "Сегодня вы ещё не выезжали.", detail: nil)
            }
            return AssistantAnswer(
                headline: "Сегодня \(Formatters.distance(today.distanceKm)) "
                    + "\(Formatters.kilometres(today.distanceKm)) за \(today.tripCount) "
                    + "\(Formatters.trips(today.tripCount)).",
                detail: "Средняя скорость \(Formatters.speed(today.averageSpeedKph)) "
                    + "\(Formatters.kilometres(today.averageSpeedKph.rounded())) в час."
            )

        case .nextService:
            return nextService(context)

        case .batteryRange:
            return AssistantAnswer(
                headline: "Батарея \(Formatters.percent(context.battery)) "
                    + "\(Formatters.percentWord(context.battery)), запас хода "
                    + "\(Formatters.distance(context.rangeKm, fractionDigits: 0)) "
                    + "\(Formatters.kilometres(context.rangeKm.rounded())).",
                detail: context.driveMode == DriveMode.ev.rawValue
                    ? "Сейчас едем на электротяге."
                    : "Сейчас работает гибридный режим."
            )

        case .errors:
            guard context.errors > 0 else {
                return AssistantAnswer(headline: "Ошибок нет, все системы в норме.", detail: nil)
            }
            let word = Formatters.plural(context.errors, "ошибка", "ошибки", "ошибок")
            let first = context.diagnostics.first
            return AssistantAnswer(
                headline: "Есть \(context.errors) \(word). Стоит заехать в сервис.",
                detail: first.map { "\($0.code): \($0.descriptionText)" }
            )

        case .tripSummary:
            let trip = context.currentTrip
            guard trip.distanceKm > 0.1 else {
                return AssistantAnswer(headline: "Текущая поездка только началась.", detail: nil)
            }
            return AssistantAnswer(
                headline: "В этой поездке \(Formatters.distance(trip.distanceKm)) "
                    + "\(Formatters.kilometres(trip.distanceKm)) за "
                    + "\(Formatters.duration(trip.durationMinutes * 60)).",
                detail: "Расход \(Formatters.consumption(trip.consumptionLper100km)) литра на сто, "
                    + "электротяга \(Formatters.percent(trip.evPercentage)) "
                    + "\(Formatters.percentWord(trip.evPercentage))."
            )
        }
    }

    private static func carHealth(_ context: AssistantContext) -> AssistantAnswer {
        var problems: [String] = []
        if HealthRules.auxiliaryVoltageStatus(context.auxiliaryVoltage) != .normal {
            problems.append("напряжение бортовой сети \(Formatters.voltage(context.auxiliaryVoltage)) вольта")
        }
        if HealthRules.coolantTemperatureStatus(context.temperature) != .normal {
            let word = Formatters.plural(context.temperature, "градус", "градуса", "градусов")
            problems.append("температура двигателя \(Formatters.temperature(context.temperature)) \(word)")
        }
        if context.errors > 0 {
            let word = Formatters.plural(context.errors, "ошибка", "ошибки", "ошибок")
            problems.append("\(context.errors) \(word) в диагностике")
        }
        if let overdue = context.maintenance.first(where: { $0.status == MetricStatus.critical.rawValue }) {
            problems.append("просрочено обслуживание: \(spokenName(for: overdue))")
        }

        guard problems.isEmpty else {
            return AssistantAnswer(
                headline: "Есть на что обратить внимание: \(problems.prefix(2).joined(separator: ", ")).",
                detail: "Подробности — на экране «Car»."
            )
        }
        let temperatureWord = Formatters.plural(context.temperature, "градус", "градуса", "градусов")
        return AssistantAnswer(
            headline: "Машина в порядке: батарея \(Formatters.percent(context.battery)) "
                + "\(Formatters.percentWord(context.battery)), ошибок нет.",
            detail: "Двигатель \(Formatters.temperature(context.temperature)) \(temperatureWord), "
                + "бортовая сеть \(Formatters.voltage(context.auxiliaryVoltage)) вольта."
        )
    }

    private static func consumptionComparison(_ context: AssistantContext) -> AssistantAnswer {
        guard let today = context.history.first(where: { $0.period == TripPeriod.today.rawValue }),
              let week = context.history.first(where: { $0.period == TripPeriod.last7Days.rawValue }),
              today.tripCount > 0, week.tripCount > 0 else {
            return AssistantAnswer(headline: "Пока не с чем сравнивать — мало поездок.", detail: nil)
        }
        guard let change = TripMath.percentChange(
            from: week.consumptionLper100km,
            to: today.consumptionLper100km
        ) else {
            return AssistantAnswer(
                headline: "На неделе вы ехали почти полностью на электротяге, сравнивать расход не с чем.",
                detail: nil
            )
        }
        let direction = change >= 0 ? "выше" : "ниже"
        let magnitude = abs(change).rounded()
        return AssistantAnswer(
            headline: "Сегодня \(Formatters.consumption(today.consumptionLper100km)) литра — на "
                + "\(Formatters.percent(magnitude)) \(Formatters.percentWord(magnitude)) "
                + "\(direction), чем в среднем за неделю.",
            detail: "За неделю \(Formatters.consumption(week.consumptionLper100km)) литра на сто."
        )
    }

    private static func consumptionCause(_ context: AssistantContext) -> AssistantAnswer {
        guard let today = context.history.first(where: { $0.period == TripPeriod.today.rawValue }),
              let week = context.history.first(where: { $0.period == TripPeriod.last7Days.rawValue }),
              today.tripCount > 0 else {
            return AssistantAnswer(headline: "Данных за сегодня пока мало для сравнения.", detail: nil)
        }

        // The dominant lever on a plug-in hybrid is how much of the distance was electric.
        if week.evPercentage - today.evPercentage > 8 {
            return AssistantAnswer(
                headline: "Сегодня меньше электротяги: \(Formatters.percent(today.evPercentage)) "
                    + "\(Formatters.percentWord(today.evPercentage)) против "
                    + "\(Formatters.percent(week.evPercentage)) за неделю.",
                detail: "Когда батарея разряжается, включается двигатель и расход растёт."
            )
        }
        if today.averageSpeedKph - week.averageSpeedKph > 12 {
            return AssistantAnswer(
                headline: "Сегодня выше средняя скорость: \(Formatters.speed(today.averageSpeedKph)) "
                    + "против \(Formatters.speed(week.averageSpeedKph)) километров в час.",
                detail: "На трассе расход выше, чем в городе на электротяге."
            )
        }
        if context.battery < 20 {
            return AssistantAnswer(
                headline: "Батарея на \(Formatters.percent(context.battery)) процентах, "
                    + "поэтому машина едет на двигателе.",
                detail: "После зарядки расход вернётся к обычному."
            )
        }
        return AssistantAnswer(
            headline: "Заметной причины в данных не видно — расход близок к среднему за неделю.",
            detail: nil
        )
    }

    private static func nextService(_ context: AssistantContext) -> AssistantAnswer {
        guard let next = context.maintenance.first else {
            return AssistantAnswer(headline: "История обслуживания пока пустая.", detail: nil)
        }
        let name = spokenName(for: next)

        if let km = next.remainingKm, km < 0 {
            return AssistantAnswer(
                headline: "\(name.prefix(1).uppercased())\(name.dropFirst()) просрочено на "
                    + "\(Formatters.distance(abs(km))) \(Formatters.kilometres(abs(km))).",
                detail: "Стоит записаться в сервис."
            )
        }
        if let km = next.remainingKm, let days = next.remainingDays,
           Double(days) * MaintenanceItem.kilometresPerDayEquivalent < km {
            return AssistantAnswer(
                headline: "Ближайшее — \(name) через \(days) \(Formatters.days(days)).",
                detail: "По пробегу останется ещё \(Formatters.distance(km)) \(Formatters.kilometres(km))."
            )
        }
        if let km = next.remainingKm {
            return AssistantAnswer(
                headline: "Ближайшее — \(name) через \(Formatters.distance(km)) \(Formatters.kilometres(km)).",
                detail: next.lastServiceDate.map { "Прошлое обслуживание: \($0)." }
            )
        }
        if let days = next.remainingDays {
            return AssistantAnswer(
                headline: "Ближайшее — \(name) через \(days) \(Formatters.days(days)).",
                detail: nil
            )
        }
        return AssistantAnswer(headline: "Для этого пункта не задан интервал обслуживания.", detail: nil)
    }

    /// The context carries the English label that is also shown on screen; spoken answers
    /// use the Russian name instead.
    private static func spokenName(for item: AssistantContext.MaintenanceContext) -> String {
        MaintenanceType(rawValue: item.item)?.spokenName ?? item.item.lowercased()
    }
}
