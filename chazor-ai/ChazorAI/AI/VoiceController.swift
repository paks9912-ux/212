import AVFoundation
import Foundation
import Observation
import Speech

/// Microphone-in, speech-out for the assistant.
///
/// Voice is the only interaction that is genuinely safe at speed, so it is a first-class
/// path rather than a nice-to-have: the driver holds one large button, speaks, and the
/// answer is read back. Everything degrades gracefully — if permissions are refused or a
/// recogniser is unavailable, the UI falls back to the suggested-question buttons.
@MainActor
@Observable
final class VoiceController: NSObject {

    enum State: Equatable {
        case idle
        case listening
        case denied(String)
        case unavailable(String)
    }

    private(set) var state: State = .idle
    /// Live transcription shown while the driver is speaking.
    private(set) var transcript = ""
    private(set) var isSpeaking = false

    @ObservationIgnored private let recognizer: SFSpeechRecognizer?
    @ObservationIgnored private var request: SFSpeechAudioBufferRecognitionRequest?
    @ObservationIgnored private var task: SFSpeechRecognitionTask?
    @ObservationIgnored private let audioEngine = AVAudioEngine()
    @ObservationIgnored private let synthesizer = AVSpeechSynthesizer()
    @ObservationIgnored private let localeIdentifier: String

    /// Called with the final transcription when the driver stops speaking.
    @ObservationIgnored var onFinalTranscript: ((String) -> Void)?

    init(localeIdentifier: String = "ru-RU") {
        self.localeIdentifier = localeIdentifier
        self.recognizer = SFSpeechRecognizer(locale: Locale(identifier: localeIdentifier))
        super.init()
        synthesizer.delegate = self
    }

    var isListening: Bool { state == .listening }

    var canListen: Bool {
        guard let recognizer else { return false }
        return recognizer.isAvailable
    }

    // MARK: Listening

    func toggleListening() {
        isListening ? stopListening() : startListening()
    }

    func startListening() {
        guard !isListening else { return }
        guard let recognizer, recognizer.isAvailable else {
            state = .unavailable("Распознавание речи недоступно")
            return
        }

        requestPermissions { [weak self] granted, message in
            guard let self else { return }
            guard granted else {
                self.state = .denied(message ?? "Нет доступа к микрофону")
                return
            }
            self.beginRecognition()
        }
    }

    func stopListening() {
        audioEngine.inputNode.removeTap(onBus: 0)
        if audioEngine.isRunning { audioEngine.stop() }
        request?.endAudio()
        task?.finish()
        request = nil
        task = nil
        if case .listening = state { state = .idle }
        deactivateSession()
    }

    private func beginRecognition() {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .spokenAudio, options: [.duckOthers, .defaultToSpeaker, .allowBluetooth])
            try session.setActive(true, options: .notifyOthersOnDeactivation)

            let request = SFSpeechAudioBufferRecognitionRequest()
            request.shouldReportPartialResults = true
            // Keep audio on the device where the hardware allows it.
            request.requiresOnDeviceRecognition = recognizer?.supportsOnDeviceRecognition ?? false
            self.request = request

            let inputNode = audioEngine.inputNode
            let format = inputNode.outputFormat(forBus: 0)
            inputNode.removeTap(onBus: 0)
            inputNode.installTap(onBus: 0, bufferSize: 1_024, format: format) { buffer, _ in
                request.append(buffer)
            }

            audioEngine.prepare()
            try audioEngine.start()

            transcript = ""
            state = .listening

            task = recognizer?.recognitionTask(with: request) { [weak self] result, error in
                Task { @MainActor [weak self] in
                    guard let self else { return }
                    if let result {
                        self.transcript = result.bestTranscription.formattedString
                        if result.isFinal { self.finishListening(with: self.transcript) }
                    }
                    if error != nil {
                        let text = self.transcript
                        self.stopListening()
                        if !text.isEmpty { self.onFinalTranscript?(text) }
                    }
                }
            }
        } catch {
            state = .unavailable(error.localizedDescription)
            stopListening()
        }
    }

    private func finishListening(with text: String) {
        stopListening()
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        onFinalTranscript?(trimmed)
    }

    /// Ends dictation from a UI action — the driver lifting their finger off the button.
    func endTurn() {
        let text = transcript
        stopListening()
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        onFinalTranscript?(trimmed)
    }

    private func requestPermissions(completion: @escaping @MainActor (Bool, String?) -> Void) {
        SFSpeechRecognizer.requestAuthorization { speechStatus in
            Task { @MainActor in
                guard speechStatus == .authorized else {
                    completion(false, "Нет доступа к распознаванию речи")
                    return
                }
                AVAudioApplication.requestRecordPermission { granted in
                    Task { @MainActor in
                        completion(granted, granted ? nil : "Нет доступа к микрофону")
                    }
                }
            }
        }
    }

    // MARK: Speaking

    /// Reads an answer back. Kept short by construction — `AssistantAnswer.headline` is
    /// capped, so the driver never waits through a paragraph.
    func speak(_ text: String) {
        guard !text.isEmpty else { return }
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            try session.setActive(true)
        } catch {
            // Speaking is best-effort: a busy audio session must never break the answer.
        }

        let utterance = AVSpeechUtterance(string: text)
        utterance.voice = AVSpeechSynthesisVoice(language: localeIdentifier)
        utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.96
        utterance.postUtteranceDelay = 0.1
        isSpeaking = true
        synthesizer.speak(utterance)
    }

    func stopSpeaking() {
        synthesizer.stopSpeaking(at: .immediate)
        isSpeaking = false
    }

    private func deactivateSession() {
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}

// MARK: - AVSpeechSynthesizerDelegate

extension VoiceController: AVSpeechSynthesizerDelegate {

    nonisolated func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        didFinish utterance: AVSpeechUtterance
    ) {
        Task { @MainActor [weak self] in
            self?.isSpeaking = false
            self?.deactivateSession()
        }
    }

    nonisolated func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        didCancel utterance: AVSpeechUtterance
    ) {
        Task { @MainActor [weak self] in
            self?.isSpeaking = false
        }
    }
}
