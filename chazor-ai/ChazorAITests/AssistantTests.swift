import XCTest
@testable import ChazorAI

/// Answers are read at speed, so their shape is a safety property, not a style choice.
final class AssistantAnswerTests: XCTestCase {

    func testSplitsIntoHeadlineAndOneDetail() {
        let answer = AssistantAnswer.fromModelText(
            "Расход сегодня 4,3 литра на сто. Это на 12 процентов выше недельного среднего. И ещё одно предложение."
        )
        XCTAssertEqual(answer.headline, "Расход сегодня 4,3 литра на сто.")
        XCTAssertEqual(answer.detail, "Это на 12 процентов выше недельного среднего.")
    }

    func testCollapsesLineBreaks() {
        let answer = AssistantAnswer.fromModelText("Батарея 74 процента.\nЗапас хода 82 километра.")
        XCTAssertFalse(answer.headline.contains("\n"))
        XCTAssertEqual(answer.headline, "Батарея 74 процента.")
    }

    func testTruncatesLongOutput() {
        let long = String(repeating: "очень длинный ответ ", count: 40)
        let answer = AssistantAnswer.fromModelText(long)
        XCTAssertLessThanOrEqual(answer.headline.count, 110)
    }

    func testEmptyOutputStillProducesSomethingToShow() {
        XCTAssertFalse(AssistantAnswer.fromModelText("   ").headline.isEmpty)
    }
}

final class ClaudeServiceResponseTests: XCTestCase {

    /// Current models return thinking blocks alongside text, so blocks have to be picked
    /// by type rather than by position.
    func testSkipsNonTextBlocks() throws {
        let json = """
        {
          "content": [
            {"type": "thinking", "thinking": "..."},
            {"type": "text", "text": "Батарея 74 процента."}
          ],
          "stop_reason": "end_turn"
        }
        """
        let text = try ClaudeService.text(fromMessagesResponse: Data(json.utf8))
        XCTAssertEqual(text, "Батарея 74 процента.")
    }

    func testJoinsMultipleTextBlocks() throws {
        let json = """
        {"content": [{"type": "text", "text": "A."}, {"type": "text", "text": "B."}]}
        """
        XCTAssertEqual(try ClaudeService.text(fromMessagesResponse: Data(json.utf8)), "A. B.")
    }

    func testRefusalIsSurfacedAsAnError() {
        let json = """
        {"content": [], "stop_reason": "refusal"}
        """
        XCTAssertThrowsError(try ClaudeService.text(fromMessagesResponse: Data(json.utf8)))
    }

    func testMalformedBodyThrows() {
        XCTAssertThrowsError(try ClaudeService.text(fromMessagesResponse: Data("not json".utf8)))
    }

    func testErrorMessageExtraction() {
        let json = """
        {"type": "error", "error": {"type": "authentication_error", "message": "invalid x-api-key"}}
        """
        XCTAssertEqual(ClaudeService.errorMessage(from: Data(json.utf8)), "invalid x-api-key")
    }

    func testServiceIsNotConfiguredWithoutAKey() async {
        let service = ClaudeService(apiKeyProvider: { nil })
        XCTAssertFalse(service.isConfigured)
        do {
            _ = try await service.answer(to: "Как машина?", context: .fixture(), history: [])
            XCTFail("Expected a notConfigured error")
        } catch {
            XCTAssertEqual(error as? AIServiceError, .notConfigured)
        }
    }
}

final class OfflineAIServiceTests: XCTestCase {

    func testIntentMatching() {
        XCTAssertEqual(OfflineAIService.intent(for: "Как состояние машины?"), .carHealth)
        XCTAssertEqual(OfflineAIService.intent(for: "Какой расход сегодня?"), .consumptionToday)
        XCTAssertEqual(OfflineAIService.intent(for: "Когда следующее ТО?"), .nextService)
        XCTAssertEqual(OfflineAIService.intent(for: "Сколько километров я проехал сегодня?"), .distanceToday)
        XCTAssertEqual(
            OfflineAIService.intent(for: "Сравни сегодняшний расход с прошлой неделей."),
            .consumptionComparison
        )
        XCTAssertEqual(OfflineAIService.intent(for: "Почему расход вырос?"), .consumptionCause)
        XCTAssertEqual(OfflineAIService.intent(for: "Сколько заряда в батарее?"), .batteryRange)
        // "ошибок" and "ошибки" share the stem "ошиб", not "ошибк".
        XCTAssertEqual(OfflineAIService.intent(for: "Сколько ошибок?"), .errors)
        XCTAssertEqual(OfflineAIService.intent(for: "Есть ошибки?"), .errors)
    }

    /// Two-letter keywords must not match inside longer words: "ТО" is a service interval,
    /// "что" and "потом" are not.
    func testShortKeywordsMatchWholeWordsOnly() {
        XCTAssertNotEqual(OfflineAIService.intent(for: "Что там с батареей?"), .nextService)
    }

    func testControlRequestsAreRefusedNotAttempted() {
        let answer = OfflineAIService.answer(to: "Открой двери", context: .fixture())
        XCTAssertTrue(answer.headline.contains("не управляю"))
    }

    func testHealthAnswerUsesOnlyProvidedData() {
        let answer = OfflineAIService.answer(to: "Как состояние машины?", context: .fixture())
        XCTAssertTrue(answer.headline.contains("74"))
        XCTAssertTrue(answer.headline.contains("порядке"))
    }

    func testHealthAnswerReportsProblems() {
        var context = AssistantContext.fixture()
        context.auxiliaryVoltage = 11.4
        let answer = OfflineAIService.answer(to: "Как состояние машины?", context: context)
        XCTAssertTrue(answer.headline.contains("внимание"))
    }

    func testAnswersDegradeGracefullyWithoutHistory() {
        var context = AssistantContext.fixture()
        context.history = []
        let answer = OfflineAIService.answer(to: "Какой расход сегодня?", context: context)
        XCTAssertFalse(answer.headline.isEmpty)
    }
}

final class AssistantContextTests: XCTestCase {

    func testJSONCarriesTheAgreedKeys() throws {
        let json = AssistantContext.fixture().jsonString()
        for key in ["vehicle", "speed", "battery", "driveMode", "temperature", "errors",
                    "tripDistance", "consumption"] {
            XCTAssertTrue(json.contains("\"\(key)\""), "missing key: \(key)")
        }
    }

    /// Keys are sorted so an unchanged context produces a byte-identical prompt, which is
    /// what makes prompt caching work.
    func testJSONIsDeterministic() {
        let context = AssistantContext.fixture()
        XCTAssertEqual(context.jsonString(), context.jsonString())
    }

    func testNoIdentifiersLeakIntoTheContext() {
        let json = AssistantContext.fixture().jsonString().lowercased()
        XCTAssertFalse(json.contains("vin"))
        XCTAssertFalse(json.contains("latitude"))
        XCTAssertFalse(json.contains("longitude"))
    }
}

// MARK: - Fixtures

extension AssistantContext {
    static func fixture() -> AssistantContext {
        AssistantContext(
            vehicle: "BYD Chazor",
            speed: 68,
            battery: 74,
            driveMode: "EV",
            temperature: 91,
            errors: 0,
            tripDistance: 24.7,
            consumption: 4.3,
            rangeKm: 82,
            auxiliaryVoltage: 12.6,
            odometerKm: 84_320,
            isDriving: true,
            dataSource: "Demo",
            currentTrip: TripContext(
                distanceKm: 24.7,
                durationMinutes: 38,
                averageSpeedKph: 39,
                consumptionLper100km: 4.3,
                evPercentage: 71,
                hevPercentage: 29
            ),
            history: [
                PeriodContext(
                    period: TripPeriod.today.rawValue,
                    tripCount: 3,
                    distanceKm: 48.2,
                    durationMinutes: 74,
                    averageSpeedKph: 39,
                    consumptionLper100km: 4.3,
                    evPercentage: 71
                ),
                PeriodContext(
                    period: TripPeriod.last7Days.rawValue,
                    tripCount: 14,
                    distanceKm: 268.4,
                    durationMinutes: 430,
                    averageSpeedKph: 37,
                    consumptionLper100km: 3.8,
                    evPercentage: 82
                )
            ],
            maintenance: [
                MaintenanceContext(
                    item: MaintenanceType.generalService.rawValue,
                    remainingKm: 12_200,
                    remainingDays: 23,
                    status: MetricStatus.warning.rawValue,
                    lastServiceDate: "1 окт 2025",
                    lastServiceMileageKm: 81_520
                )
            ],
            diagnostics: [],
            generatedAt: Date(timeIntervalSince1970: 1_700_000_000)
        )
    }
}
