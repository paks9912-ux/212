import SwiftUI

/// Manual service entry — the only place in the app where the driver types anything.
///
/// It is a phone-only screen by design: text entry is not available in CarPlay while the
/// car is moving, and a maintenance log is not a driving task.
struct AddServiceView: View {

    struct Draft {
        var type: MaintenanceType = .engineOil
        var date: Date = .now
        var mileage: Double = 0
        var cost: Double = 0
        var notes: String = ""
    }

    let defaultMileage: Double
    let onSave: (Draft) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var draft = Draft()
    @State private var mileageText = ""
    @State private var costText = ""

    private var isValid: Bool { parsedMileage > 0 }
    private var parsedMileage: Double { Self.parseNumber(mileageText) }
    private var parsedCost: Double { Self.parseNumber(costText) }

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Palette.background.ignoresSafeArea()
                Form {
                    Section {
                        Picker("Service", selection: $draft.type) {
                            ForEach(MaintenanceType.allCases) { type in
                                Text(type.rawValue).tag(type)
                            }
                        }
                        DatePicker("Date", selection: $draft.date, displayedComponents: .date)
                    }

                    Section {
                        LabeledContent("Mileage") {
                            TextField("84 320", text: $mileageText)
                                .keyboardType(.numberPad)
                                .multilineTextAlignment(.trailing)
                        }
                        LabeledContent("Cost") {
                            TextField("0", text: $costText)
                                .keyboardType(.decimalPad)
                                .multilineTextAlignment(.trailing)
                        }
                    } footer: {
                        Text("Пробег нужен, чтобы считать интервалы до следующего обслуживания.")
                    }

                    Section("Notes") {
                        TextField("Что сделали", text: $draft.notes, axis: .vertical)
                            .lineLimit(2...5)
                    }
                }
                .scrollContentBackground(.hidden)
            }
            .navigationTitle("Add service")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Отмена") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Сохранить") {
                        var result = draft
                        result.mileage = parsedMileage
                        result.cost = parsedCost
                        onSave(result)
                        dismiss()
                    }
                    .disabled(!isValid)
                }
            }
            .onAppear {
                if mileageText.isEmpty, defaultMileage > 0 {
                    mileageText = String(Int(defaultMileage.rounded()))
                }
            }
        }
    }

    /// Accepts "84 320", "84320", "4 900,50" — whatever a driver actually types.
    static func parseNumber(_ text: String) -> Double {
        let normalised = text
            .replacingOccurrences(of: "\u{00A0}", with: "")
            .replacingOccurrences(of: "\u{2009}", with: "")
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: ",", with: ".")
        return Double(normalised) ?? 0
    }
}

#Preview {
    AddServiceView(defaultMileage: 84_320) { _ in }
        .preferredColorScheme(.dark)
}
