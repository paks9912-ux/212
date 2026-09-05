import Foundation
import SwiftData

/// Keeps a history of fault codes.
///
/// A code that appears and disappears between two visits to the workshop is exactly the
/// kind of thing a driver cannot reconstruct from memory, so every appearance is written
/// down with the odometer reading at the time, and codes that stop being reported are
/// marked cleared rather than deleted.
@MainActor
final class DiagnosticsRecorder {

    private let context: ModelContext
    private let vehicle: Vehicle

    /// Codes seen in the previous frame, so only transitions cause a write.
    private var activeCodes: Set<String> = []
    private var didLoadExisting = false

    init(context: ModelContext, vehicle: Vehicle) {
        self.context = context
        self.vehicle = vehicle
    }

    func ingest(_ frame: VehicleFrame) {
        loadExistingIfNeeded()

        let reported = Set(frame.diagnostics.troubleCodes.map(\.code))
        guard reported != activeCodes else { return }

        for code in reported.subtracting(activeCodes) {
            guard let trouble = frame.diagnostics.troubleCodes.first(where: { $0.code == code }) else { continue }
            record(trouble, mileageKm: frame.vehicle.odometerKm)
        }
        for code in activeCodes.subtracting(reported) {
            markCleared(code)
        }

        activeCodes = reported
        try? context.save()
    }

    private func loadExistingIfNeeded() {
        guard !didLoadExisting else { return }
        didLoadExisting = true
        activeCodes = Set(openEvents().map(\.code))
    }

    private func record(_ trouble: TroubleCode, mileageKm: Double) {
        // Re-opening the same code within one session should not create a second row.
        if openEvents().contains(where: { $0.code == trouble.code }) { return }

        context.insert(
            DiagnosticEvent(
                code: trouble.code,
                descriptionText: trouble.descriptionText,
                date: trouble.detectedAt,
                mileage: mileageKm,
                isCleared: false,
                severity: trouble.isPending ? .warning : .critical,
                vehicle: vehicle
            )
        )
    }

    private func markCleared(_ code: String) {
        for event in openEvents() where event.code == code {
            event.isCleared = true
        }
    }

    private func openEvents() -> [DiagnosticEvent] {
        let descriptor = FetchDescriptor<DiagnosticEvent>(
            sortBy: [SortDescriptor(\DiagnosticEvent.date, order: .reverse)]
        )
        let all = (try? context.fetch(descriptor)) ?? []
        return all.filter { !$0.isCleared }
    }
}
