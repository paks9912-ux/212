# Safety boundaries

The app reads. It never writes to the vehicle. This is enforced in three places, so that
removing any one of them still leaves the guarantee standing.

## 1. The protocol has no write member

`VehicleDataProvider` (`ChazorAI/Vehicle/VehicleDataProvider.swift`) exposes `connect`,
`disconnect` and four getters. There is no `send`, `write`, `command`, `set` or `execute`.
A caller holding a provider has no vocabulary for changing anything in the car.

## 2. The OBD command type refuses anything but a read

Every byte that reaches the adapter goes through `OBDCommand`
(`ChazorAI/Vehicle/OBDCommand.swift`), whose failable initialiser accepts only:

- OBD services `01`, `02`, `03`, `07`, `09`, `0A` — current data, freeze frames, stored,
  pending and permanent trouble codes, vehicle information. All reads.
- A fixed list of `AT…` adapter-configuration commands, which are handled by the dongle
  and never reach the vehicle bus.

Everything else returns `nil` and is never transmitted, including:

| Rejected | What it would do |
|---|---|
| `04` | clear diagnostic trouble codes |
| `08` | control an on-board system or component |
| `2E`, `2F`, `31` | UDS write-by-identifier, I/O control, routine control |
| `11` | ECU reset |
| `27`, `10` | security access, diagnostic session control |

`OBDCommandTests` asserts each of these is refused.

Clearing a check-engine light is a write. The app therefore reads codes and shows them, and
says in the UI that clearing them is a workshop operation.

## 3. The CAN layer is ingest-only

`CANDataProvider` (`ChazorAI/Vehicle/CANDataProvider.swift`) has an `ingest(_:)` method and
no transmit path. It cannot request, acknowledge or inject a frame; a gateway hands it
frames and it decodes them.

It also ships **without a signal map for the BYD Chazor**. The vehicle's CAN matrix is not
public. Guessing identifiers and bit offsets would produce numbers that look plausible and
are wrong, which in a car is worse than showing nothing — so the provider refuses to report
anything until a map from a documented source is supplied. `CANDecoderTests` asserts the
refusal.

## Not implemented, and not planned

No steering, braking, throttle, gear or drive-mode control. No door locks or unlocking. No
remote start. No climate control. No writes of any kind. If a user asks the assistant for
one of these, the answer says the app only displays data — `OfflineAIService` handles the
`control` intent explicitly, and the Claude system prompt says the same thing.

## Distraction

- The app never claims to replace the instrument cluster. Speed appears on the phone screen
  as a mirror with a stated caveat, and is absent from CarPlay entirely
  (`Docs/CARPLAY.md` §4).
- Assistant answers are capped in length in code (`AssistantAnswer.fromModelText`), not just
  requested to be short in the prompt.
- CarPlay refreshes every 5 seconds and offers preset questions instead of dictation.
- Controls are larger than the 44 pt minimum (`Theme.Metrics.minimumTouchTarget` is 56 pt).

## Data leaving the device

The only outbound request is the Claude API call, and its payload is exactly one
`AssistantContext` plus the question. That struct is the audit surface: vehicle model,
speed, charge, drive mode, temperature, error count, odometer, trip and period statistics,
and service intervals.

Not collected and not sent: VIN, location, contacts, phone identifiers, audio. Speech is
recognised with `SFSpeechRecognizer`, on-device where the hardware supports it
(`requiresOnDeviceRecognition`), and only the resulting text is used.

The exact JSON for the next question can be read in the app: **AI → gear icon → "Что
отправляется модели"**.

With no API key configured, nothing leaves the device at all: `OfflineAIService` answers
from the same context locally.
