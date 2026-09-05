import CarPlay
import Foundation

/// CarPlay's template limits, in one place.
///
/// Where the framework publishes a limit as a class property it is read at runtime rather
/// than hard-coded, because Apple has changed these numbers between iOS releases and a
/// template that exceeds them throws rather than truncating.
enum CarPlayLimits {

    /// Published by the framework.
    static var maximumListItems: Int { CPListTemplate.maximumItemCount }
    static var maximumListSections: Int { CPListTemplate.maximumSectionCount }
    static var maximumTabs: Int { CPTabBarTemplate.maximumTabCount }

    /// Documented in the CarPlay Human Interface Guidelines rather than exposed as API.
    static let maximumInformationItems = 10
    static let maximumInformationActions = 3
    static let maximumGridButtons = 8

    /// Driving-task apps may push one template on top of the root (two on iOS 26.4+).
    /// The app stays within the stricter figure so it behaves the same on every OS.
    static let maximumTemplateDepth = 2

    static func clampListItems<T>(_ items: [T]) -> [T] {
        Array(items.prefix(maximumListItems))
    }

    static func clampSections<T>(_ sections: [T]) -> [T] {
        Array(sections.prefix(maximumListSections))
    }

    static func clampInformationItems<T>(_ items: [T]) -> [T] {
        Array(items.prefix(maximumInformationItems))
    }

    static func clampActions<T>(_ actions: [T]) -> [T] {
        Array(actions.prefix(maximumInformationActions))
    }

    static func clampTabs<T>(_ tabs: [T]) -> [T] {
        Array(tabs.prefix(maximumTabs))
    }
}
