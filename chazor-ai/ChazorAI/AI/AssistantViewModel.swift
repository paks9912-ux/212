import Foundation
import Observation

/// Drives the assistant screen and the CarPlay assistant tab.
///
/// Keeping this out of the views means the same question/answer flow serves the phone UI,
/// CarPlay and any future Siri intent without duplication.
@MainActor
@Observable
final class AssistantViewModel {

    private(set) var turns: [AssistantTurn] = []
    private(set) var isThinking = false
    private(set) var lastError: String?
    private(set) var lastAnswer: AssistantAnswer?

    /// Read aloud automatically. On by default while driving is the point of the feature.
    var speaksAnswers = true

    @ObservationIgnored private let service: AIService
    @ObservationIgnored private let fallbackService: AIService
    @ObservationIgnored private let contextProvider: @MainActor () -> AssistantContext
    @ObservationIgnored private let voice: VoiceController?
    @ObservationIgnored private var currentTask: Task<Void, Never>?

    init(
        service: AIService,
        fallbackService: AIService = OfflineAIService(),
        voice: VoiceController? = nil,
        contextProvider: @escaping @MainActor () -> AssistantContext
    ) {
        self.service = service
        self.fallbackService = fallbackService
        self.voice = voice
        self.contextProvider = contextProvider
        voice?.onFinalTranscript = { [weak self] text in
            self?.ask(text)
        }
    }

    /// Questions the spec calls out, kept short enough to be tapped at a glance.
    static let suggestions = [
        "Как состояние машины?",
        "Какой расход сегодня?",
        "Когда следующее ТО?",
        "Сколько я проехал сегодня?",
        "Сравни расход с прошлой неделей",
        "Почему расход вырос?"
    ]

    var isVoiceAvailable: Bool { voice?.canListen ?? false }
    var isListening: Bool { voice?.isListening ?? false }
    var liveTranscript: String { voice?.transcript ?? "" }
    var serviceName: String { service.isConfigured ? service.displayName : fallbackService.displayName }

    // MARK: Asking

    func ask(_ rawQuestion: String) {
        let question = rawQuestion.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !question.isEmpty, !isThinking else { return }

        lastError = nil
        turns.append(AssistantTurn(role: .user, text: question))
        isThinking = true

        let context = contextProvider()
        let history = Array(turns.dropLast())

        currentTask = Task { [weak self] in
            guard let self else { return }
            let answer = await self.resolve(question: question, context: context, history: history)
            guard !Task.isCancelled else { return }
            self.isThinking = false
            guard let answer else { return }
            self.lastAnswer = answer
            self.turns.append(AssistantTurn(role: .assistant, text: answer.headline, detail: answer.detail))
            if self.speaksAnswers { self.voice?.speak(answer.headline) }
        }
    }

    /// Falls back to the offline assistant on any failure, so the driver always gets an
    /// answer — a spinner that never resolves is the worst outcome at 100 km/h.
    private func resolve(
        question: String,
        context: AssistantContext,
        history: [AssistantTurn]
    ) async -> AssistantAnswer? {
        if service.isConfigured {
            do {
                return try await service.answer(to: question, context: context, history: history)
            } catch AIServiceError.cancelled {
                return nil
            } catch {
                lastError = error.localizedDescription
            }
        }
        return try? await fallbackService.answer(to: question, context: context, history: history)
    }

    func cancel() {
        currentTask?.cancel()
        currentTask = nil
        isThinking = false
    }

    func clear() {
        cancel()
        turns.removeAll()
        lastAnswer = nil
        lastError = nil
        voice?.stopSpeaking()
    }

    // MARK: Voice

    func toggleVoiceInput() {
        guard let voice else { return }
        if voice.isListening {
            voice.endTurn()
        } else {
            voice.startListening()
        }
    }

    func stopSpeaking() {
        voice?.stopSpeaking()
    }

    /// Synchronous path used by CarPlay, where a template needs an answer to push.
    func answerForCarPlay(_ question: String) async -> AssistantAnswer {
        let context = contextProvider()
        let answer = await resolve(question: question, context: context, history: [])
        return answer ?? AssistantAnswer(headline: "Нет ответа. Попробуйте ещё раз.", detail: nil)
    }
}
