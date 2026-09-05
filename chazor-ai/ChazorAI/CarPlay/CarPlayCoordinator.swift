import CarPlay
import Foundation
import UIKit

/// Builds and maintains the CarPlay interface.
///
/// Design rules this file follows, in order of importance:
///
/// 1. **No speedometer.** The car's own cluster shows speed; repeating it on the centre
///    screen adds a second, laggier number for the driver to reconcile with the first.
///    CarPlay shows only what the cluster does not: charge, range, trip totals, health.
/// 2. **Two levels, never three.** Driving-task apps are limited to a shallow stack, and
///    the guidelines ask for three levels or fewer regardless. Root is the tab bar,
///    one push is the maximum.
/// 3. **Slow updates.** Values refresh every few seconds, not every frame. Numbers that
///    tick constantly in peripheral vision are a distraction, not information.
/// 4. **No text entry, no vehicle control.** Questions are a fixed list of buttons; there
///    is no keyboard and nothing that writes to the car.
@MainActor
final class CarPlayCoordinator {

    private let interfaceController: CPInterfaceController
    private let services: AppServices

    private var nowTemplate: CPInformationTemplate?
    private var carTemplate: CPListTemplate?
    private var refreshTask: Task<Void, Never>?

    /// Slow enough not to pull the eye, fast enough that a glance is current.
    private let refreshInterval: Duration = .seconds(5)

    init(interfaceController: CPInterfaceController, services: AppServices) {
        self.interfaceController = interfaceController
        self.services = services
    }

    // MARK: Lifecycle

    func start() {
        services.start()

        let now = makeNowTemplate()
        let car = makeCarTemplate()
        let trips = makeTripsTemplate()
        let assistant = makeAssistantTemplate()

        nowTemplate = now
        carTemplate = car

        let tabs = CarPlayLimits.clampTabs([now, car, trips, assistant] as [CPTemplate])
        let tabBar = CPTabBarTemplate(templates: tabs)
        interfaceController.setRootTemplate(tabBar, animated: false, completion: nil)

        startRefreshing()
    }

    func stop() {
        refreshTask?.cancel()
        refreshTask = nil
        nowTemplate = nil
        carTemplate = nil
    }

    private func startRefreshing() {
        refreshTask?.cancel()
        refreshTask = Task { [weak self, refreshInterval] in
            while !Task.isCancelled {
                try? await Task.sleep(for: refreshInterval)
                guard !Task.isCancelled, let self else { return }
                self.refresh()
            }
        }
    }

    private func refresh() {
        nowTemplate?.items = CarPlayLimits.clampInformationItems(nowItems())
        carTemplate?.updateSections(carSections())
    }

    // MARK: Now

    private func makeNowTemplate() -> CPInformationTemplate {
        let template = CPInformationTemplate(
            title: "Chazor AI",
            layout: .twoColumn,
            items: CarPlayLimits.clampInformationItems(nowItems()),
            actions: CarPlayLimits.clampActions(nowActions())
        )
        template.tabTitle = "Now"
        template.tabImage = UIImage(systemName: "bolt.car")
        return template
    }

    /// Speed is intentionally absent. Everything here is a value the instrument cluster
    /// does not show, or shows only after digging through its menus.
    private func nowItems() -> [CPInformationItem] {
        let telemetry = services.telemetry
        return [
            CPInformationItem(
                title: "Battery",
                detail: "\(Formatters.percent(telemetry.battery.stateOfChargePercent)) %"
            ),
            CPInformationItem(
                title: "Range",
                detail: "\(Formatters.distance(telemetry.battery.estimatedRangeKm, fractionDigits: 0)) km"
            ),
            CPInformationItem(title: "Mode", detail: telemetry.vehicle.driveMode.displayName),
            CPInformationItem(
                title: "Trip",
                detail: "\(Formatters.distance(telemetry.trip.distanceKm)) km"
            ),
            CPInformationItem(
                title: "Consumption",
                detail: "\(Formatters.consumption(telemetry.trip.consumptionLper100km)) L/100 km"
            ),
            CPInformationItem(title: "Status", detail: telemetry.overallStatus.displayName)
        ]
    }

    private func nowActions() -> [CPTextButton] {
        [
            CPTextButton(title: "Ask Claude", textStyle: .confirm) { [weak self] _ in
                self?.showAssistantQuestions()
            }
        ]
    }

    // MARK: Car

    private func makeCarTemplate() -> CPListTemplate {
        let template = CPListTemplate(title: "Car", sections: carSections())
        template.tabTitle = "Car"
        template.tabImage = UIImage(systemName: "car")
        return template
    }

    private func carSections() -> [CPListSection] {
        let telemetry = services.telemetry
        let nearestService = services.maintenanceItems().first

        let rows: [(String, String)] = [
            ("Battery", "\(Formatters.percent(telemetry.battery.stateOfChargePercent)) % · \(telemetry.batteryStatus.rawValue)"),
            ("12V", "\(Formatters.voltage(telemetry.battery.auxiliaryVoltage)) V · \(telemetry.auxiliaryVoltageStatus.rawValue)"),
            ("Temperature", "\(Formatters.temperature(telemetry.vehicle.coolantTemperatureC)) °C · \(telemetry.coolantStatus.rawValue)"),
            ("Drive mode", telemetry.vehicle.driveMode.displayName),
            ("Errors", "\(telemetry.diagnostics.errorCount) · \(telemetry.diagnosticsStatus.rawValue)"),
            ("Mileage", "\(Formatters.distance(services.vehicle.odometerKm, fractionDigits: 0)) km"),
            ("Maintenance", nearestService.map { "\($0.type.rawValue) · \($0.headlineValue)" } ?? "—")
        ]

        let items = CarPlayLimits.clampListItems(
            rows.map { title, detail in
                let item = CPListItem(text: title, detailText: detail)
                // Rows are read-only: tapping does nothing but dismiss the highlight,
                // which keeps the stack at one level.
                item.handler = { _, completion in completion() }
                return item
            }
        )
        return [CPListSection(items: items)]
    }

    // MARK: Trips

    private func makeTripsTemplate() -> CPListTemplate {
        let items = CarPlayLimits.clampListItems(
            TripPeriod.allCases.map { period in
                let item = CPListItem(text: period.rawValue, detailText: nil)
                item.handler = { [weak self] _, completion in
                    self?.showTripSummary(for: period)
                    completion()
                }
                return item
            }
        )
        let template = CPListTemplate(title: "Trips", sections: [CPListSection(items: items)])
        template.tabTitle = "Trips"
        template.tabImage = UIImage(systemName: "chart.bar")
        return template
    }

    private func showTripSummary(for period: TripPeriod) {
        let summary = services.tripAggregate(for: period)
        let items: [CPInformationItem] = summary.isEmpty
            ? [CPInformationItem(title: "Нет поездок", detail: period.rawValue)]
            : [
                CPInformationItem(title: "Distance", detail: "\(Formatters.distance(summary.distanceKm)) km"),
                CPInformationItem(title: "Avg speed", detail: "\(Formatters.speed(summary.averageSpeedKph)) km/h"),
                CPInformationItem(
                    title: "Consumption",
                    detail: "\(Formatters.consumption(summary.consumptionLper100km)) L/100 km"
                ),
                CPInformationItem(title: "EV", detail: "\(Formatters.percent(summary.evPercentage)) %"),
                CPInformationItem(title: "HEV", detail: "\(Formatters.percent(summary.hevPercentage)) %"),
                CPInformationItem(title: "Time", detail: Formatters.duration(summary.duration)),
                CPInformationItem(title: "Trips", detail: "\(summary.tripCount)")
            ]

        let template = CPInformationTemplate(
            title: period.rawValue,
            layout: .twoColumn,
            items: CarPlayLimits.clampInformationItems(items),
            actions: []
        )
        push(template)
    }

    // MARK: Assistant

    private func makeAssistantTemplate() -> CPListTemplate {
        let template = CPListTemplate(title: "Claude", sections: [assistantSection()])
        template.tabTitle = "Claude"
        template.tabImage = UIImage(systemName: "waveform")
        return template
    }

    /// A fixed list of questions rather than dictation: CarPlay disables text entry while
    /// the car is moving, and a tap on a known question is faster than speaking anyway.
    private func assistantSection() -> CPListSection {
        let items = CarPlayLimits.clampListItems(
            AssistantViewModel.suggestions.map { question in
                let item = CPListItem(text: question, detailText: nil)
                item.handler = { [weak self] _, completion in
                    self?.ask(question)
                    completion()
                }
                return item
            }
        )
        return CPListSection(items: items)
    }

    private func showAssistantQuestions() {
        let template = CPListTemplate(title: "Claude", sections: [assistantSection()])
        push(template)
    }

    private func ask(_ question: String) {
        Task { [weak self] in
            guard let self else { return }
            let answer = await self.services.assistant.answerForCarPlay(question)

            var items = [CPInformationItem(title: question, detail: answer.headline)]
            if let detail = answer.detail {
                items.append(CPInformationItem(title: nil, detail: detail))
            }

            let template = CPInformationTemplate(
                title: "Claude",
                layout: .leading,
                items: CarPlayLimits.clampInformationItems(items),
                actions: []
            )
            self.push(template, replacingTop: true)
        }
    }

    // MARK: Navigation

    /// Enforces the depth budget: if a detail template is already on screen, it is
    /// replaced rather than stacked.
    private func push(_ template: CPTemplate, replacingTop: Bool = false) {
        let depth = interfaceController.templates.count
        if depth >= CarPlayLimits.maximumTemplateDepth || replacingTop, depth > 1 {
            interfaceController.popTemplate(animated: false) { [weak self] _, _ in
                self?.interfaceController.pushTemplate(template, animated: true, completion: nil)
            }
        } else {
            interfaceController.pushTemplate(template, animated: true, completion: nil)
        }
    }
}
