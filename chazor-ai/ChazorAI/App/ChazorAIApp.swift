import SwiftData
import SwiftUI

@main
@MainActor
struct ChazorAIApp: App {

    /// The shared object graph. CarPlay's scene delegate reaches the same instance, so
    /// both screens show the same numbers at the same time.
    @State private var services = AppServices.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(services)
                .environment(services.telemetry)
                .modelContainer(services.modelContainer)
                .preferredColorScheme(.dark)
                .tint(Theme.Palette.accent)
                .task { services.start() }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { services.persistPendingWork() }
        }
    }
}
