# Architecture

```
                      ┌──────────────────────────────────────────┐
   phone scene  ──────▶                                          │
   (SwiftUI)          │              AppServices                 │
                      │        (single composition root)         │
   CarPlay scene ─────▶                                          │
   (templates)        └───────────────┬──────────────────────────┘
                                      │
        ┌─────────────────────────────┼──────────────────────────┐
        │                             │                          │
   VehicleTelemetryStore        SwiftData store              AIService
   (@Observable)                Vehicle / Trip /           ┌──────┴───────┐
        │                       MaintenanceRecord /    ClaudeService  OfflineAIService
        │                       DiagnosticEvent            │
   VehicleDataProvider                                AssistantContext
   ┌────┴───────────────┬──────────────────┐         (the only thing sent)
   │                    │                  │
 Mock…Provider   BluetoothOBDProvider  CANDataProvider
 (drive-cycle     (ELM327 over BLE)    (ingest-only)
  simulator)
```

## The two seams

Everything in this project exists to keep two boundaries clean.

**`VehicleDataProvider`** is the seam to the car. Above it, nothing knows whether a number
came from a simulator, a Bluetooth dongle or a CAN gateway — the UI, CarPlay, persistence
and the AI all consume `VehicleFrame` snapshots. Swapping the source is one line in
`AppServices.switchDataSource(to:)`, and the app has a picker for it on the Car screen.

**`AIService`** is the seam to the model. `ClaudeService` is one implementation;
`OfflineAIService` is another that needs no network. Replacing Claude with a different model
touches one file. Neither implementation can reach vehicle data directly: both are handed an
`AssistantContext` built by `AIContextBuilder`.

## Concurrency

The whole app is `@MainActor`. Vehicle telemetry arrives at about 1 Hz and the data volume
is a few dozen numbers, so there is nothing to gain from moving it off the main actor, and
plenty to lose in complexity. `CBCentralManager` is created with `queue: .main` for the same
reason, which is what lets the CoreBluetooth delegate methods hop back with
`MainActor.assumeIsolated`.

Providers publish through `AsyncStream<VehicleFrame>` with `.bufferingNewest(1)`: a display
only ever wants the latest frame, never a backlog.

## Layers

| Folder | Contains | Depends on |
|---|---|---|
| `Domain` | snapshots, `HealthRules`, `TripMath`, `Formatters` | Foundation only |
| `Persistence` | SwiftData models, seeding, trip and maintenance queries | Domain |
| `Vehicle` | provider protocol, mock, OBD, CAN, telemetry store, trip recorder | Domain |
| `AI` | `AIService`, context builder, Claude client, offline engine, voice | Domain, Persistence |
| `DesignSystem` | theme, components | Domain |
| `Features` | SwiftUI screens | everything above |
| `CarPlay` | scene delegate, coordinator, template limits | Domain, Persistence, Vehicle, AI |
| `App` | composition root, entry point, tab bar | everything |

`Domain` has no imports beyond Foundation, which is what makes `HealthRules`, `TripMath`,
`OBDResponseParser` and `CANDecoder` testable without a car, a simulator or a network.

## The Claude call

`ClaudeService` posts to `POST https://api.anthropic.com/v1/messages` with
`anthropic-version: 2023-06-01` and model `claude-opus-5`.

- The **system prompt is byte-stable** and marked `cache_control: ephemeral`, so repeated
  questions hit the prompt cache. The volatile vehicle JSON goes in the *user* turn, after
  the cache breakpoint — putting it in the system prompt would invalidate the cache on every
  question.
- `output_config.effort` is `low`: these are short factual questions, and latency matters
  more than depth when someone is driving.
- Response parsing filters content blocks by `type == "text"`. Current models return
  `thinking` blocks too, so reading `content[0]` positionally would break.
- `stop_reason == "refusal"` is surfaced as an error rather than shown as an empty answer.
- Any failure falls back to `OfflineAIService`. A spinner that never resolves is the worst
  outcome at 100 km/h.

The key never appears in UI code. `ClaudeService` takes an `@Sendable () -> String?` and
`APIKeyStore` resolves it from the `ANTHROPIC_API_KEY` environment variable (development,
via the Xcode scheme) or the Keychain (device).

## Trips

`MockVehicleDataProvider` and `BluetoothOBDProvider` both produce a live `TripSnapshot`.
`TripRecorder` watches it and writes a `Trip` row when the provider starts a new trip or
when the car has been stationary for three minutes. Rows are keyed by start time, so a drive
that resumes after a long stop updates its row instead of duplicating it.

The factory trip computer is not readable over generic OBD-II, so `OBDTripAccumulator`
integrates speed and fuel rate itself, clamping sample gaps to 10 seconds so a backgrounded
app cannot book a phantom 200 km.

## Regenerating the project file

`ChazorAI.xcodeproj` is generated from the source tree:

```sh
python3 Tools/generate_xcodeproj.py
```

Object IDs are hashes of paths, so regenerating after an unrelated change produces an
identical file. Adding files through Xcode works normally; the script is there so that the
project can be rebuilt from scratch and so that file moves produce a readable diff.
