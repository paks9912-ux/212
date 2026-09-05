import Foundation
import Observation
import SwiftData

/// Composition root.
///
/// One place builds the object graph, and both scenes — the phone window and the CarPlay
/// template scene — read from it. CarPlay is a separate `UIScene`, so without a shared
/// root the two would end up with two copies of the telemetry state and two different
/// answers to "what is the battery level".
@MainActor
@Observable
final class AppServices {

    static let shared = AppServices()

    let modelContainer: ModelContainer
    let telemetry: VehicleTelemetryStore
    let voice: VoiceController
    let assistant: AssistantViewModel

    private(set) var vehicle: Vehicle
    private(set) var dataSourceID: VehicleDataSourceID = .mock

    @ObservationIgnored private let tripRecorder: TripRecorder
    @ObservationIgnored private let diagnosticsRecorder: DiagnosticsRecorder
    @ObservationIgnored private let claudeService: ClaudeService
    @ObservationIgnored private let offlineService: OfflineAIService
    @ObservationIgnored private var didStart = false

    var modelContext: ModelContext { modelContainer.mainContext }

    /// The API key is resolved lazily inside `ClaudeService`; this only reports whether
    /// one is available, so no view ever sees the value itself.
    var isClaudeConfigured: Bool { claudeService.isConfigured }
    var apiKeySource: String { APIKeyStore.sourceDescription }

    init(inMemory: Bool = false) {
        let container = PersistenceController.makeContainer(inMemory: inMemory)
        let context = container.mainContext
        SampleDataSeeder.seedIfNeeded(context: context)
        let vehicle = PersistenceController.currentVehicle(in: context)

        let telemetry = VehicleTelemetryStore()
        let voice = VoiceController()
        let claude = ClaudeService()
        let offline = OfflineAIService()
        let recorder = TripRecorder(context: context, vehicle: vehicle)
        let diagnostics = DiagnosticsRecorder(context: context, vehicle: vehicle)
        telemetry.tripRecorder = recorder
        telemetry.diagnosticsRecorder = diagnostics

        // The context provider closes over the graph rather than over `self`, so the
        // assistant can be built inside `init` without capturing a half-formed object.
        let assistant = AssistantViewModel(
            service: claude,
            fallbackService: offline,
            voice: voice,
            contextProvider: {
                AIContextBuilder(telemetry: telemetry, context: context, vehicle: vehicle).build()
            }
        )

        self.modelContainer = container
        self.vehicle = vehicle
        self.telemetry = telemetry
        self.voice = voice
        self.claudeService = claude
        self.offlineService = offline
        self.tripRecorder = recorder
        self.diagnosticsRecorder = diagnostics
        self.assistant = assistant
    }

    // MARK: Lifecycle

    func start() {
        guard !didStart else { return }
        didStart = true
        switchDataSource(to: .mock)
    }

    func switchDataSource(to source: VehicleDataSourceID) {
        dataSourceID = source
        switch source {
        case .mock:
            telemetry.use(MockVehicleDataProvider(odometerKm: vehicle.odometerKm))
        case .bluetoothOBD:
            telemetry.use(BluetoothOBDProvider(startingOdometerKm: vehicle.odometerKm))
        case .can:
            // Ships without a signal map on purpose — see CANDataProvider.
            telemetry.use(CANDataProvider())
        }
    }

    /// Called when the app leaves the foreground so an in-progress trip is not lost.
    func persistPendingWork() {
        tripRecorder.finalizeCurrentTrip()
        try? modelContext.save()
    }

    // MARK: Derived helpers used by both scenes

    func maintenanceItems(now: Date = .now) -> [MaintenanceItem] {
        MaintenanceService(context: modelContext).upcomingItems(odometerKm: vehicle.odometerKm, now: now)
    }

    func tripAggregate(for period: TripPeriod, now: Date = .now) -> TripAggregate {
        TripHistoryService(context: modelContext).aggregate(for: period, now: now)
    }

    func assistantContext(now: Date = .now) -> AssistantContext {
        AIContextBuilder(telemetry: telemetry, context: modelContext, vehicle: vehicle).build(now: now)
    }
}
