import Foundation

/// Claude implementation of `AIService`, talking to the Anthropic Messages API over HTTPS.
///
/// The API key is injected as a closure so that no view, view model or template ever
/// holds it, and so tests can run this class without touching the Keychain.
final class ClaudeService: AIService {

    // Model and endpoint are configuration, not magic constants scattered in code.
    struct Configuration: Sendable {
        var model: String = "claude-opus-5"
        var endpoint = URL(string: "https://api.anthropic.com/v1/messages")!
        var apiVersion = "2023-06-01"
        /// Short answers only — the UI and the driver both need brevity.
        var maxTokens = 400
        /// Low effort keeps latency down for what are short, factual questions.
        var effort = "low"
        var timeout: TimeInterval = 20
        /// Turns of conversation history sent back for follow-up questions.
        var historyDepth = 4
    }

    let displayName = "Claude"

    private let configuration: Configuration
    private let session: URLSession
    private let apiKeyProvider: @Sendable () -> String?

    init(
        configuration: Configuration = Configuration(),
        session: URLSession = .shared,
        apiKeyProvider: @escaping @Sendable () -> String? = { APIKeyStore.currentKey() }
    ) {
        self.configuration = configuration
        self.session = session
        self.apiKeyProvider = apiKeyProvider
    }

    var isConfigured: Bool { apiKeyProvider()?.isEmpty == false }

    func answer(
        to question: String,
        context: AssistantContext,
        history: [AssistantTurn]
    ) async throws -> AssistantAnswer {
        guard let apiKey = apiKeyProvider(), !apiKey.isEmpty else {
            throw AIServiceError.notConfigured
        }

        let request = try makeRequest(
            apiKey: apiKey,
            question: question,
            context: context,
            history: history
        )

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch is CancellationError {
            throw AIServiceError.cancelled
        } catch let error as URLError where error.code == .cancelled {
            throw AIServiceError.cancelled
        } catch {
            throw AIServiceError.network(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else { throw AIServiceError.emptyResponse }
        guard (200..<300).contains(http.statusCode) else {
            throw AIServiceError.http(status: http.statusCode, message: Self.errorMessage(from: data))
        }

        let text = try Self.text(fromMessagesResponse: data)
        guard !text.isEmpty else { throw AIServiceError.emptyResponse }
        return AssistantAnswer.fromModelText(text)
    }

    // MARK: Request

    private func makeRequest(
        apiKey: String,
        question: String,
        context: AssistantContext,
        history: [AssistantTurn]
    ) throws -> URLRequest {
        var messages: [[String: Any]] = []

        // Recent turns give follow-ups ("а на прошлой неделе?") something to attach to.
        for turn in history.suffix(configuration.historyDepth) {
            messages.append(["role": turn.role.rawValue, "content": turn.text])
        }
        messages.append([
            "role": "user",
            "content": AssistantPrompt.userMessage(question: question, context: context)
        ])

        // The system prompt is byte-stable, so it is worth caching; the volatile vehicle
        // data lives in the user turn, after the cache breakpoint.
        let body: [String: Any] = [
            "model": configuration.model,
            "max_tokens": configuration.maxTokens,
            "system": [
                [
                    "type": "text",
                    "text": AssistantPrompt.system,
                    "cache_control": ["type": "ephemeral"]
                ]
            ],
            "output_config": ["effort": configuration.effort],
            "messages": messages
        ]

        var request = URLRequest(url: configuration.endpoint)
        request.httpMethod = "POST"
        request.timeoutInterval = configuration.timeout
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(apiKey, forHTTPHeaderField: "x-api-key")
        request.setValue(configuration.apiVersion, forHTTPHeaderField: "anthropic-version")
        request.httpBody = try JSONSerialization.data(withJSONObject: body, options: [.sortedKeys])
        return request
    }

    // MARK: Response

    /// Concatenates the `text` blocks of a Messages API response.
    ///
    /// The content array can also contain `thinking` blocks — current models think by
    /// default — so blocks must be filtered by type rather than read positionally.
    static func text(fromMessagesResponse data: Data) throws -> String {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw AIServiceError.emptyResponse
        }
        // A policy refusal comes back as HTTP 200 with a stop reason and no text.
        if let stopReason = root["stop_reason"] as? String, stopReason == "refusal" {
            throw AIServiceError.http(status: 200, message: "Модель отклонила запрос")
        }
        guard let content = root["content"] as? [[String: Any]] else { throw AIServiceError.emptyResponse }

        let text = content
            .filter { ($0["type"] as? String) == "text" }
            .compactMap { $0["text"] as? String }
            .joined(separator: " ")
        return text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static func errorMessage(from data: Data) -> String {
        guard let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let error = root["error"] as? [String: Any],
              let message = error["message"] as? String else {
            return String(data: data, encoding: .utf8)?.prefix(120).description ?? "Unknown error"
        }
        return message
    }
}
