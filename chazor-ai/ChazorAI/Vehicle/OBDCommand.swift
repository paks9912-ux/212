import Foundation

/// An ELM327 command that is safe to send to a vehicle.
///
/// The type exists so that "read only" is enforced by the compiler and by
/// `OBDCommand.init?`, not by a comment. Nothing in the app can construct a
/// command that writes to the car: OBD service 04 (clear DTCs), 08 (control of
/// on-board component) and every UDS write service are rejected here.
struct OBDCommand: Equatable, Sendable {
    let text: String

    /// OBD-II services this app is allowed to use. All of them are pure reads.
    /// - 01: current data
    /// - 02: freeze-frame data
    /// - 03: stored diagnostic trouble codes
    /// - 07: pending trouble codes
    /// - 09: vehicle information
    /// - 0A: permanent trouble codes
    static let allowedServices: Set<String> = ["01", "02", "03", "07", "09", "0A"]

    /// AT commands that configure the adapter itself. They never reach the vehicle bus.
    /// `ATZ`/`ATD` reset the adapter, `ATE`/`ATL`/`ATS`/`ATH` shape its text output,
    /// `ATSP` selects the protocol, `ATRV` reads the adapter's own voltage sensor.
    static let allowedATPrefixes = ["ATZ", "ATD", "ATE", "ATL", "ATS", "ATH", "ATSP", "ATRV", "ATAT", "ATST"]

    private init(unchecked text: String) {
        self.text = text
    }

    /// Returns `nil` for anything that is not a permitted read.
    init?(_ raw: String) {
        let normalised = raw.uppercased().filter { !$0.isWhitespace }
        guard !normalised.isEmpty else { return nil }

        if normalised.hasPrefix("AT") {
            guard Self.allowedATPrefixes.contains(where: { normalised.hasPrefix($0) }) else { return nil }
            self.text = normalised
            return
        }

        // A vehicle request is a service byte followed by an optional PID.
        guard normalised.count >= 2, normalised.allSatisfy({ $0.isHexDigit }) else { return nil }
        let service = String(normalised.prefix(2))
        guard Self.allowedServices.contains(service) else { return nil }
        self.text = normalised
    }

    // MARK: Standard requests (SAE J1979)

    static let reset = OBDCommand(unchecked: "ATZ")
    static let echoOff = OBDCommand(unchecked: "ATE0")
    static let linefeedsOff = OBDCommand(unchecked: "ATL0")
    static let spacesOff = OBDCommand(unchecked: "ATS0")
    static let headersOff = OBDCommand(unchecked: "ATH0")
    static let autoProtocol = OBDCommand(unchecked: "ATSP0")
    /// Adapter-measured supply voltage — a good proxy for the 12 V battery.
    static let adapterVoltage = OBDCommand(unchecked: "ATRV")

    static let supportedPIDs = OBDCommand(unchecked: "0100")
    static let vehicleSpeed = OBDCommand(unchecked: "010D")
    static let coolantTemperature = OBDCommand(unchecked: "0105")
    static let engineRPM = OBDCommand(unchecked: "010C")
    static let controlModuleVoltage = OBDCommand(unchecked: "0142")
    static let distanceSinceCodesCleared = OBDCommand(unchecked: "0131")
    static let engineFuelRate = OBDCommand(unchecked: "015E")
    /// Standard "hybrid battery pack remaining life", reported by some — not all — hybrids.
    /// Whether the Chazor answers it has to be verified on the car before it is trusted.
    static let hybridPackRemainingLife = OBDCommand(unchecked: "015B")
    static let storedTroubleCodes = OBDCommand(unchecked: "03")
    static let pendingTroubleCodes = OBDCommand(unchecked: "07")
}
