import SwiftUI

/// The assistant. One big button, one short answer, a handful of one-tap questions.
///
/// Deliberately not a chat app: no keyboard-first input, no long transcripts, no markdown.
/// The driver asks, hears a sentence, and looks back at the road.
struct AssistantView: View {

    @Environment(AppServices.self) private var services
    @State private var showsSettings = false

    private var assistant: AssistantViewModel { services.assistant }

    var body: some View {
        CockpitScreen(
            title: "Claude",
            subtitle: assistant.serviceName,
            accessory: AnyView(
                Button {
                    showsSettings = true
                } label: {
                    Image(systemName: "gearshape")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(Theme.Palette.textSecondary)
                        .frame(width: 40, height: 40)
                        .background(Circle().fill(Color.white.opacity(0.05)))
                }
                .buttonStyle(.plain)
            )
        ) {
            answerCard
            micButton
            suggestions
            if !assistant.turns.isEmpty { transcriptSection }
        }
        .sheet(isPresented: $showsSettings) {
            AssistantSettingsView().preferredColorScheme(.dark)
        }
    }

    // MARK: Answer

    @ViewBuilder
    private var answerCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            if assistant.isThinking {
                HStack(spacing: 10) {
                    ProgressView().tint(Theme.Palette.textSecondary)
                    Text("Думаю…")
                        .font(Theme.Typography.body())
                        .foregroundStyle(Theme.Palette.textSecondary)
                }
            } else if assistant.isListening {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Слушаю").cockpitLabel()
                    Text(assistant.liveTranscript.isEmpty ? "…" : assistant.liveTranscript)
                        .font(Theme.Typography.title())
                        .foregroundStyle(Theme.Palette.textPrimary)
                }
            } else if let answer = assistant.lastAnswer {
                VStack(alignment: .leading, spacing: 10) {
                    Text(answer.headline)
                        .font(.system(size: 24, weight: .medium))
                        .foregroundStyle(Theme.Palette.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let detail = answer.detail {
                        Text(detail)
                            .font(Theme.Typography.body())
                            .foregroundStyle(Theme.Palette.textSecondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            } else {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Спросите про машину")
                        .font(.system(size: 24, weight: .medium))
                        .foregroundStyle(Theme.Palette.textPrimary)
                    Text("Расход, заряд, ТО, поездки — ответ будет коротким.")
                        .font(Theme.Typography.body())
                        .foregroundStyle(Theme.Palette.textSecondary)
                }
            }

            if let error = assistant.lastError {
                Text(error)
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Palette.statusWarning)
            }
        }
        .frame(minHeight: 120, alignment: .topLeading)
        .cardSurface(padding: 20)
    }

    // MARK: Microphone

    private var micButton: some View {
        VStack(spacing: 10) {
            PrimaryActionButton(
                title: assistant.isListening ? "Готово" : "Ask Claude",
                systemImage: assistant.isListening ? "stop.fill" : "mic.fill",
                isBusy: assistant.isThinking,
                role: assistant.isListening ? .neutral : .accent
            ) {
                assistant.toggleVoiceInput()
            }
            .disabled(!assistant.isVoiceAvailable && !assistant.isListening)

            if !assistant.isVoiceAvailable {
                Text("Голосовой ввод недоступен — выберите вопрос ниже.")
                    .font(.system(size: 11))
                    .foregroundStyle(Theme.Palette.textTertiary)
            }
        }
    }

    // MARK: Suggestions

    private var suggestions: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "Вопросы")
            VStack(spacing: 8) {
                ForEach(AssistantViewModel.suggestions, id: \.self) { question in
                    Button {
                        assistant.ask(question)
                    } label: {
                        HStack {
                            Text(question)
                                .font(Theme.Typography.body())
                                .foregroundStyle(Theme.Palette.textPrimary)
                                .multilineTextAlignment(.leading)
                            Spacer(minLength: 8)
                            Image(systemName: "arrow.up.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Theme.Palette.textTertiary)
                        }
                        .padding(.horizontal, 16)
                        .frame(minHeight: Theme.Metrics.minimumTouchTarget)
                        .frame(maxWidth: .infinity)
                        .background(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .fill(Theme.Palette.surface)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .strokeBorder(Theme.Palette.hairline, lineWidth: 1)
                        )
                    }
                    .buttonStyle(PressableButtonStyle())
                    .disabled(assistant.isThinking)
                }
            }
        }
    }

    // MARK: Transcript

    private var transcriptSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionHeader(title: "История", trailing: "Очистить")
                .onTapGesture { assistant.clear() }
            VStack(spacing: 8) {
                ForEach(assistant.turns.reversed()) { turn in
                    HStack(alignment: .top, spacing: 10) {
                        Circle()
                            .fill(turn.role == .user ? Theme.Palette.textTertiary : Theme.Palette.accent)
                            .frame(width: 5, height: 5)
                            .padding(.top, 7)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(turn.text)
                                .font(Theme.Typography.body())
                                .foregroundStyle(
                                    turn.role == .user ? Theme.Palette.textSecondary : Theme.Palette.textPrimary
                                )
                            if let detail = turn.detail {
                                Text(detail)
                                    .font(.system(size: 12))
                                    .foregroundStyle(Theme.Palette.textTertiary)
                            }
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, Theme.Metrics.cardPadding)
                    .padding(.vertical, 10)
                }
            }
            .background(
                RoundedRectangle(cornerRadius: Theme.Metrics.cardRadius, style: .continuous)
                    .fill(Theme.Palette.surface)
            )
        }
    }
}

// MARK: - Settings

/// Where the API key is entered on a real device, and where the driver can see exactly
/// what is sent to the model.
struct AssistantSettingsView: View {

    @Environment(AppServices.self) private var services
    @Environment(\.dismiss) private var dismiss
    @State private var keyInput = ""
    @State private var savedMessage: String?
    @State private var showsContext = false

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Palette.background.ignoresSafeArea()
                Form {
                    Section {
                        LabeledContent("Сервис", value: services.assistant.serviceName)
                        LabeledContent("Ключ", value: services.apiKeySource)
                    } footer: {
                        Text("В разработке ключ берётся из переменной окружения \(APIKeyStore.environmentVariableName) в схеме Xcode. На устройстве его можно сохранить в Keychain.")
                    }

                    Section("Anthropic API key") {
                        SecureField("sk-ant-…", text: $keyInput)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        Button("Сохранить в Keychain") {
                            let ok = APIKeyStore.saveToKeychain(keyInput)
                            savedMessage = ok ? "Сохранено" : "Не удалось сохранить"
                            keyInput = ""
                        }
                        .disabled(keyInput.trimmingCharacters(in: .whitespaces).isEmpty)
                        Button("Удалить ключ", role: .destructive) {
                            APIKeyStore.removeFromKeychain()
                            savedMessage = "Ключ удалён"
                        }
                        if let savedMessage {
                            Text(savedMessage)
                                .font(.system(size: 12))
                                .foregroundStyle(Theme.Palette.textSecondary)
                        }
                    }

                    Section {
                        Toggle("Читать ответы вслух", isOn: Binding(
                            get: { services.assistant.speaksAnswers },
                            set: { services.assistant.speaksAnswers = $0 }
                        ))
                        Button("Что отправляется модели") { showsContext = true }
                    } footer: {
                        Text("Модель получает только показатели автомобиля и статистику поездок. VIN, местоположение и контакты не собираются и не отправляются.")
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("AI")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Готово") { dismiss() }
                }
            }
            .sheet(isPresented: $showsContext) {
                ContextInspectorView(json: services.assistantContext().jsonString())
                    .preferredColorScheme(.dark)
            }
        }
    }
}

/// Shows the exact JSON that would be sent with the next question. Being able to read it
/// is the difference between "trust us" and an auditable boundary.
struct ContextInspectorView: View {
    let json: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Palette.background.ignoresSafeArea()
                ScrollView {
                    Text(json)
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(Theme.Palette.textSecondary)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(Theme.Metrics.screenPadding)
                }
            }
            .navigationTitle("Контекст")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Готово") { dismiss() }
                }
            }
        }
    }
}

#Preview {
    AssistantView().previewCockpit()
}
