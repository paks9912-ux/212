# CarPlay: what is allowed, and what this app does about it

This was researched before any CarPlay code was written, because the constraints decide
the architecture — not the other way round. Sources are linked at the bottom.

## 1. Third-party apps do not draw on the CarPlay screen

Outside of navigation apps (which may render a map), a third-party CarPlay app cannot draw
custom UI at all. It declares **templates** and the system renders them, in the vehicle's
own style, at the vehicle's own scale. There is no `UIView`, no SwiftUI, no custom font, no
animation, no gauge.

Consequence for this project: **the CarPlay screen cannot look like the iPhone screen.** The
design language in `Theme.swift` applies to the phone app only. Anything that depends on
custom drawing — the large speed readout, the charts, the energy-split bar, the coloured
status chips — is phone-only by construction.

## 2. Every app needs an entitlement, and the entitlement fixes the category

CarPlay entitlements are requested from Apple per app, and the category granted determines
which templates the app may use. The categories are audio, communication, navigation,
parking, EV charging, quick food ordering, fueling, driving task, car manufacturer (vehicle
makers only) and fleet.

A vehicle-companion app that shows trip, battery, service and diagnostic information is a
**driving task** app: `com.apple.developer.carplay-driving-task`.

Templates available to that category:

| Template | Used here | For |
|---|---|---|
| `CPTabBarTemplate` | yes | root: Now / Car / Trips / Claude |
| `CPInformationTemplate` | yes | the Now summary, a trip period, an assistant answer |
| `CPListTemplate` | yes | vehicle parameters, trip periods, preset questions |
| `CPAlertTemplate` | available | not needed yet |
| `CPActionSheetTemplate` | available | not needed yet |
| `CPGridTemplate` | available | not needed yet |
| `CPPointOfInterestTemplate` | available | reserved for a future charging/service-station view |

`CPMapTemplate` is navigation-only and is **not** available to this app. There is no way to
draw a custom dashboard, and no attempt is made to work around that.

The entitlement file lives at `Config/ChazorAI.entitlements` but is **not** wired into the
build settings, so the project compiles and runs for anyone who has not been granted the
entitlement by Apple. See "Trying CarPlay" below.

## 3. Hard limits the code respects

| Limit | Value | Where it is handled |
|---|---|---|
| Template stack depth (driving task) | 2 (3 on iOS 26.4+) | `CarPlayLimits.maximumTemplateDepth`, enforced in `CarPlayCoordinator.push` |
| Content hierarchy (HIG) | 3 levels or fewer | root tab bar + one push |
| `CPListTemplate` items / sections | read from `CPListTemplate.maximumItemCount` / `.maximumSectionCount` at runtime | `CarPlayLimits.clampListItems` |
| `CPInformationTemplate` | 10 items, 3 actions | `CarPlayLimits.clampInformationItems` / `clampActions` |
| `CPGridTemplate` | 8 buttons | `CarPlayLimits.maximumGridButtons` |
| `CPTabBarTemplate` | `CPTabBarTemplate.maximumTabCount` | `CarPlayLimits.clampTabs` |

The framework limits are read at runtime rather than hard-coded: Apple has changed them
between releases, and exceeding them throws rather than truncating.

Text entry is restricted while the vehicle is moving, and list scrolling is limited. That is
why the CarPlay assistant offers a **fixed list of questions** instead of dictation or a
keyboard, and why "Add service" exists only on the phone.

## 4. Deliberate product decisions inside those limits

**No speedometer in CarPlay.** The car's instrument cluster is the authoritative speed
display. A second speed number on the centre screen would arrive later than the cluster's
(it travels ECU → OBD adapter → Bluetooth → phone → CarPlay), and two disagreeing numbers is
worse than one. CarPlay shows what the cluster does *not*: state of charge, remaining range,
trip totals, consumption, health status, service countdown.

The phone screen does show speed, as a mirror for a phone in a cradle, and says so in the
code and in the UI footnote. **This app does not replace the factory instrument cluster and
must not be described as doing so.**

**Slow refresh.** CarPlay values update every 5 seconds (`CarPlayCoordinator.refreshInterval`),
not at the 1 Hz the provider emits. Numbers that tick constantly in peripheral vision are a
distraction rather than information.

**Nothing that writes to the car.** No template offers an action that could change vehicle
state; see `Docs/SAFETY.md`.

## 5. What is phone-only, and why

| Feature | Phone | CarPlay | Reason |
|---|---|---|---|
| Large speed readout | yes | no | cluster is authoritative; no custom drawing in CarPlay |
| Trip charts (Swift Charts) | yes | no | third-party apps cannot draw |
| Energy split bar | yes | summarised as EV/HEV percentages | no custom drawing |
| Add / edit service records | yes | no | text entry is restricted while driving |
| Diagnostic code list with descriptions | yes | error count and status only | depth limit, glanceability |
| Free-form voice question | yes | preset questions only | no dictation UI for driving-task apps |
| API key entry | yes | no | never a driving task |

## 6. Trying CarPlay

1. Request the driving-task entitlement from Apple for your App ID
   (<https://developer.apple.com/contact/request/carplay-platform/>).
2. In the `ChazorAI` target's build settings set
   `CODE_SIGN_ENTITLEMENTS = Config/ChazorAI.entitlements`.
3. Simulator: run the app, then **I/O → External Displays → CarPlay**. The Simulator does not
   validate entitlements against a provisioning profile, so the CarPlay screen appears as soon
   as step 2 is done.
4. Device: regenerate the provisioning profile after Apple grants the entitlement.

## Sources

- [Requesting CarPlay entitlements](https://developer.apple.com/documentation/carplay/requesting-carplay-entitlements)
- [CarPlay framework](https://developer.apple.com/documentation/carplay)
- [`CPListTemplate`](https://developer.apple.com/documentation/carplay/cplisttemplate)
- [`CPInformationTemplate`](https://developer.apple.com/documentation/carplay/cpinformationtemplate)
- [Human Interface Guidelines — CarPlay](https://developer.apple.com/design/human-interface-guidelines/carplay)
- [CarPlay Developer Guide (PDF)](https://developer.apple.com/download/files/CarPlay-Developer-Guide.pdf)
- [WWDC22 — Get more mileage out of your app with CarPlay](https://developer.apple.com/videos/play/wwdc2022/10016/)
