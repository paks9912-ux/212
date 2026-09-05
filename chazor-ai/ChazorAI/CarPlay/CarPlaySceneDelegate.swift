import CarPlay
import UIKit

/// CarPlay entry point.
///
/// The app declares a `CPTemplateApplicationSceneSessionRoleApplication` scene in
/// `Info.plist` and requires the **driving task** entitlement
/// (`com.apple.developer.carplay-driving-task`), which is the category a vehicle-companion
/// app falls into. See `Docs/CARPLAY.md` for why, and for what that entitlement allows.
///
/// The phone window keeps SwiftUI's own scene; only CarPlay needs an explicit delegate.
@MainActor
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {

    private var coordinator: CarPlayCoordinator?

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        let coordinator = CarPlayCoordinator(
            interfaceController: interfaceController,
            services: AppServices.shared
        )
        self.coordinator = coordinator
        coordinator.start()
    }

    func templateApplicationScene(
        _ templateApplicationScene: CPTemplateApplicationScene,
        didDisconnectInterfaceController interfaceController: CPInterfaceController
    ) {
        coordinator?.stop()
        coordinator = nil
    }
}
