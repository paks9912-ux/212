import SwiftData
import SwiftUI

/// One in-memory object graph shared by every `#Preview`, so previews exercise the same
/// wiring as the app instead of a parallel set of fixtures.
///
/// Not wrapped in `#if DEBUG`: `#Preview` bodies are compiled in release configurations
/// too, so a debug-only helper would break the release build. The store is `lazy`, so
/// nothing here is constructed unless a preview actually runs.
@MainActor
enum PreviewSupport {
    static let services: AppServices = {
        let services = AppServices(inMemory: true)
        services.start()
        return services
    }()
}

extension View {
    /// Applies the preview environment: shared services, dark cockpit chrome, SwiftData.
    @MainActor
    func previewCockpit() -> some View {
        self
            .environment(PreviewSupport.services)
            .environment(PreviewSupport.services.telemetry)
            .modelContainer(PreviewSupport.services.modelContainer)
            .preferredColorScheme(.dark)
            .tint(Theme.Palette.accent)
    }
}
