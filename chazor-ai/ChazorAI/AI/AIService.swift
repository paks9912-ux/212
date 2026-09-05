import Foundation

// MARK: - Context passed to the model

/// Everything the assistant is allowed to reason about.
///
/// The model receives this object and nothing else about the car: no live tool access,
/// no ability to query the vehicle, no memory of other drivers. If a value is absent
/// here, the correct answer is "no data", and the system prompt says so explicitly.
struct AssistantContext: Codable, Equatable, Sendable {

    struct TripContext: Codable, Equatable, Sendable {
        var distanceKm: Double
        var durationMinutes: Double
        var averageSpeedKph: Double
        var consumptionLper100km: Double
        var evPercentage: Double
        var hevPercentage: Double
    }

    struct PeriodContext: Codable, Equatable, Sendable {
        var period: String
        var tripCount: Int
        var distanceKm: Double
        var durationMinutes: Double
        var averageSpeedKph: Double
        var consumptionLper100km: Double
        var evPercentage: Double
    }

    struct MaintenanceContext: Codable, Equatable, Sendable {
        var item: String
        var remainingKm: Double?
        var remainingDays: Int?
        var status: String
        var lastServiceDate: String?
        var lastServiceMileageKm: Double?
    }

    struct DiagnosticContext: Codable, Equatable, Sendable {
        var code: String
        var descriptionText: String
        var isPending: Bool
    }

    // Flat headline values, matching the agreed context shape.
    var vehicle: String
    var speed: Double
    var battery: Double
    var driveMode: String
    var temperature: Double
    var errors: Int
    var tripDistance: Double
    var consumption: Double

    // Everything else the screens already know.
    var rangeKm: Double
    var auxiliaryVoltage: Double
    var odometerKm: Double
    var isDriving: Bool
    var dataSource: String
    var currentTrip: TripContext
    var history: [PeriodContext]
    var maintenance: [MaintenanceContext]
    var diagnostics: [DiagnosticContext]
    var generatedAt: Date

    /// Deterministic JSON so repeated questions hit the prompt cache.
    func jsonString() -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(self), let text = String(data: data, encoding: .utf8) else {
            return "{}"
        }
        return text
    }
}

// MARK: - Conversation

struct AssistantTurn: Identifiable, Equatable, Sendable {
    enum Role: String, Sendable { case user, assistant }

    let id: UUID
    var role: Role
    var text: String
    var detail: String?
    var date: Date

    init(id: UUID = UUID(), role: Role, text: String, detail: String? = nil, date: Date = .now) {
        self.id = id
        self.role = role
        self.text = text
        self.detail = detail
        self.date = date
    }
}

/// A deliberately short answer.
///
/// `headline` is what is shown large and read aloud; it must survive being glanced at
/// for under a second. `detail` is one optional supporting sentence, hidden while driving.
struct AssistantAnswer: Equatable, Sendable {
    var headline: String
    var detail: String?

    /// Splits free-form model output into the two-line shape the UI needs and trims it
    /// to something that can be read at a glance.
    static func fromModelText(_ raw: String, headlineLimit: Int = 110, detailLimit: Int = 160) -> AssistantAnswer {
        let cleaned = raw
            .replacingOccurrences(of: "\n", with: " ")
            .replacingOccurrences(of: "  ", with: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else {
            return AssistantAnswer(headline: "Нет ответа", detail: nil)
        }

        let sentences = cleaned
            .split(whereSeparator: { ".!?".contains($0) })
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }

        let headline = sentences.first.map { $0 + "." } ?? cleaned
        let detail = sentences.dropFirst().first.map { $0 + "." }

        return AssistantAnswer(
            headline: String(headline.prefix(headlineLimit)),
            detail: detail.map { String($0.prefix(detailLimit)) }
        )
    }
}

enum AIServiceError: LocalizedError, Equatable {
    case notConfigured
    case network(String)
    case http(status: Int, message: String)
    case emptyResponse
    case cancelled

    var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "AI-ключ не настроен"
        case .network(let message):
            return "Нет связи: \(message)"
        case .http(let status, let message):
            return "Ошибка \(status): \(message)"
        case .emptyResponse:
            return "Пустой ответ"
        case .cancelled:
            return "Отменено"
        }
    }
}

/// The abstraction the app talks to. Claude is one implementation; swapping in another
/// model, an on-device model or a local rule engine touches nothing outside this file's
/// conformances.
protocol AIService: AnyObject, Sendable {
    var displayName: String { get }
    /// False when the service cannot run (for example, no API key), so the UI can fall back.
    var isConfigured: Bool { get }

    func answer(
        to question: String,
        context: AssistantContext,
        history: [AssistantTurn]
    ) async throws -> AssistantAnswer
}

/// Shared instructions for every AI backend.
///
/// Two things matter here: the answer must be short enough to be safe at speed, and the
/// model must not invent vehicle data. Both are also enforced in code — length by
/// `AssistantAnswer.fromModelText`, data access by only ever sending `AssistantContext`.
enum AssistantPrompt {
    static let system = """
    Ты — CHAZOR AI, голосовой ассистент в автомобиле BYD Chazor.

    ПРАВИЛА ОТВЕТА
    - Отвечай на языке вопроса. По умолчанию — по-русски.
    - Максимум 2 коротких предложения. Первое предложение — сам ответ, второе — только если оно \
    добавляет действительно важное.
    - Никаких списков, заголовков, markdown, эмодзи и вступлений вроде «Конечно».
    - Числа округляй так, как их произносит человек: «74 процента», «4,3 литра».

    ДАННЫЕ
    - Используй ТОЛЬКО JSON-контекст, который приходит в сообщении пользователя.
    - Если данных для ответа нет — скажи об этом одной фразой и предложи, где их посмотреть \
    в приложении. Не догадывайся и не придумывай значения.
    - Не ссылайся на «контекст» или «JSON» в ответе — говори про машину.

    БЕЗОПАСНОСТЬ
    - Водитель за рулём. Не проси его что-то искать в телефоне и не задавай уточняющих \
    вопросов, если можно ответить по данным.
    - Ты не управляешь автомобилем и не можешь ничего в нём включить или выключить. \
    Если просят — коротко скажи, что приложение только показывает данные.
    - Про неисправности говори спокойно и по делу: что видно в данных и стоит ли ехать в сервис. \
    Диагноз ставит сервис, а не ты.
    """

    /// The user turn: the question plus the context it may use.
    static func userMessage(question: String, context: AssistantContext) -> String {
        """
        Вопрос: \(question)

        Данные автомобиля (JSON):
        \(context.jsonString())
        """
    }
}
