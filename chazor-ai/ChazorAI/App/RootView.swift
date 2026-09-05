import SwiftUI
import UIKit

/// Four destinations, fixed order, no hidden navigation. A driver should never have to
/// hunt for a screen, so the tab bar is the whole map of the app.
struct RootView: View {

    enum Tab: String, CaseIterable, Hashable {
        case home = "Home"
        case trips = "Trips"
        case car = "Car"
        case assistant = "AI"

        var systemImage: String {
            switch self {
            case .home: return "gauge.with.dots.needle.33percent"
            case .trips: return "chart.bar.fill"
            case .car: return "car.fill"
            case .assistant: return "waveform"
            }
        }
    }

    @State private var selection: Tab = .home

    var body: some View {
        TabView(selection: $selection) {
            ForEach(Tab.allCases, id: \.self) { tab in
                destination(for: tab)
                    .tag(tab)
                    .tabItem {
                        Label(tab.rawValue, systemImage: tab.systemImage)
                    }
            }
        }
        .tint(Theme.Palette.accent)
        .background(Theme.Palette.background)
        .onAppear(perform: Self.applyTabBarAppearance)
    }

    @ViewBuilder
    private func destination(for tab: Tab) -> some View {
        switch tab {
        case .home:
            HomeView(onAskClaude: { selection = .assistant })
        case .trips:
            TripsView()
        case .car:
            CarView()
        case .assistant:
            AssistantView()
        }
    }

    /// SwiftUI's tab bar picks up the system material; the cockpit look needs an opaque
    /// graphite bar with a hairline, so the appearance proxy is configured once here.
    private static func applyTabBarAppearance() {
        let appearance = UITabBarAppearance()
        appearance.configureWithOpaqueBackground()
        appearance.backgroundColor = UIColor(red: 0.055, green: 0.059, blue: 0.066, alpha: 1)
        appearance.shadowColor = UIColor(white: 1, alpha: 0.08)

        let unselected = UIColor(red: 0.46, green: 0.48, blue: 0.51, alpha: 1)
        appearance.stackedLayoutAppearance.normal.iconColor = unselected
        appearance.stackedLayoutAppearance.normal.titleTextAttributes = [
            .foregroundColor: unselected,
            .font: UIFont.systemFont(ofSize: 10, weight: .semibold)
        ]
        let selected = UIColor(red: 1, green: 1, blue: 1, alpha: 1)
        appearance.stackedLayoutAppearance.selected.iconColor = selected
        appearance.stackedLayoutAppearance.selected.titleTextAttributes = [
            .foregroundColor: selected,
            .font: UIFont.systemFont(ofSize: 10, weight: .semibold)
        ]

        UITabBar.appearance().standardAppearance = appearance
        UITabBar.appearance().scrollEdgeAppearance = appearance
    }
}

/// Shared screen chrome: black ground, generous top padding, a title row that reads as
/// instrumentation rather than as a navigation bar.
struct CockpitScreen<Content: View>: View {
    let title: String
    var subtitle: String? = nil
    var accessory: AnyView? = nil
    @ViewBuilder var content: Content

    var body: some View {
        ZStack {
            Theme.Palette.background.ignoresSafeArea()
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(alignment: .center) {
                        VStack(alignment: .leading, spacing: 3) {
                            Text(title)
                                .font(.system(size: 15, weight: .semibold))
                                .tracking(3)
                                .textCase(.uppercase)
                                .foregroundStyle(Theme.Palette.textPrimary)
                            if let subtitle {
                                Text(subtitle)
                                    .font(Theme.Typography.label())
                                    .tracking(1.2)
                                    .foregroundStyle(Theme.Palette.textTertiary)
                                    .textCase(.uppercase)
                            }
                        }
                        Spacer(minLength: 8)
                        if let accessory { accessory }
                    }
                    .padding(.top, 8)

                    content
                }
                .padding(.horizontal, Theme.Metrics.screenPadding)
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
        }
    }
}
