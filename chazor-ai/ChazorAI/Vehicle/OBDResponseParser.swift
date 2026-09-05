import Foundation

/// Pure parsing of ELM327 text responses into physical values.
///
/// Formulas are the SAE J1979 standard ones. Everything here is a free function over a
/// string, which makes the whole transport layer testable without a car or an adapter.
enum OBDResponseParser {

    /// Strips the adapter's echo, prompt characters and status words, then returns the
    /// payload bytes of a mode-01 style response.
    ///
    /// Example: `"41 0D 44"` → `[0x41, 0x0D, 0x44]`.
    static func bytes(from response: String) -> [UInt8] {
        let cleaned = response
            .replacingOccurrences(of: ">", with: " ")
            .replacingOccurrences(of: "\r", with: " ")
            .replacingOccurrences(of: "\n", with: " ")
            .uppercased()

        // Drop non-data words such as SEARCHING..., NO DATA, OK, BUS INIT.
        let words = cleaned.split(separator: " ").map(String.init)
        var payload: [UInt8] = []
        for word in words {
            guard word.allSatisfy({ $0.isHexDigit }) else { continue }
            // Some adapters return unspaced bytes ("410D44"); split them into pairs.
            var index = word.startIndex
            while index < word.endIndex {
                let next = word.index(index, offsetBy: 2, limitedBy: word.endIndex) ?? word.endIndex
                let pair = String(word[index..<next])
                if pair.count == 2, let value = UInt8(pair, radix: 16) { payload.append(value) }
                index = next
            }
        }
        return payload
    }

    static func isNoData(_ response: String) -> Bool {
        let upper = response.uppercased()
        return upper.contains("NO DATA") || upper.contains("UNABLE TO CONNECT") || upper.contains("STOPPED")
    }

    /// Returns the data bytes that follow the `41 <pid>` header, or `nil` if the
    /// response does not answer the requested PID.
    static func dataBytes(from response: String, service: UInt8, pid: UInt8) -> [UInt8]? {
        guard !isNoData(response) else { return nil }
        let payload = bytes(from: response)
        let expectedHeader = service + 0x40
        guard let headerIndex = payload.firstIndex(where: { $0 == expectedHeader }) else { return nil }
        let pidIndex = payload.index(after: headerIndex)
        guard pidIndex < payload.endIndex, payload[pidIndex] == pid else { return nil }
        return Array(payload[payload.index(after: pidIndex)...])
    }

    // MARK: Mode 01 values

    /// PID 0D — vehicle speed, km/h.
    static func vehicleSpeedKph(_ response: String) -> Double? {
        guard let data = dataBytes(from: response, service: 0x01, pid: 0x0D), let a = data.first else { return nil }
        return Double(a)
    }

    /// PID 05 — engine coolant temperature, °C (offset −40).
    static func coolantTemperatureC(_ response: String) -> Double? {
        guard let data = dataBytes(from: response, service: 0x01, pid: 0x05), let a = data.first else { return nil }
        return Double(Int(a) - 40)
    }

    /// PID 0C — engine speed, rpm: `(256A + B) / 4`.
    static func engineRPM(_ response: String) -> Double? {
        guard let data = dataBytes(from: response, service: 0x01, pid: 0x0C), data.count >= 2 else { return nil }
        return (Double(data[0]) * 256 + Double(data[1])) / 4
    }

    /// PID 42 — control module voltage, V: `(256A + B) / 1000`.
    static func controlModuleVoltage(_ response: String) -> Double? {
        guard let data = dataBytes(from: response, service: 0x01, pid: 0x42), data.count >= 2 else { return nil }
        return (Double(data[0]) * 256 + Double(data[1])) / 1_000
    }

    /// PID 31 — distance travelled since codes cleared, km: `256A + B`.
    static func distanceSinceCodesClearedKm(_ response: String) -> Double? {
        guard let data = dataBytes(from: response, service: 0x01, pid: 0x31), data.count >= 2 else { return nil }
        return Double(data[0]) * 256 + Double(data[1])
    }

    /// PID 5E — engine fuel rate, L/h: `(256A + B) / 20`.
    static func engineFuelRateLitresPerHour(_ response: String) -> Double? {
        guard let data = dataBytes(from: response, service: 0x01, pid: 0x5E), data.count >= 2 else { return nil }
        return (Double(data[0]) * 256 + Double(data[1])) / 20
    }

    /// PID 5B — hybrid battery pack remaining life, %: `A * 100 / 255`.
    static func hybridPackRemainingLifePercent(_ response: String) -> Double? {
        guard let data = dataBytes(from: response, service: 0x01, pid: 0x5B), let a = data.first else { return nil }
        return Double(a) * 100 / 255
    }

    /// `ATRV` — adapter supply voltage, e.g. `"12.6V"`.
    static func adapterVoltage(_ response: String) -> Double? {
        let cleaned = response
            .uppercased()
            .replacingOccurrences(of: "V", with: "")
            .replacingOccurrences(of: ">", with: "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return Double(cleaned)
    }

    // MARK: Mode 03 / 07 — trouble codes

    /// Decodes a mode 03/07 response into DTC strings such as `P0420`.
    static func troubleCodes(_ response: String, isPending: Bool = false, now: Date = .now) -> [TroubleCode] {
        guard !isNoData(response) else { return [] }
        var payload = bytes(from: response)
        // Drop the response header (0x43 for mode 03, 0x47 for mode 07) and, when present,
        // the count byte some adapters insert after it.
        if let headerIndex = payload.firstIndex(where: { $0 == 0x43 || $0 == 0x47 }) {
            payload = Array(payload[payload.index(after: headerIndex)...])
        }
        guard payload.count >= 2 else { return [] }

        var codes: [TroubleCode] = []
        var index = 0
        while index + 1 < payload.count {
            let first = payload[index]
            let second = payload[index + 1]
            index += 2
            if first == 0 && second == 0 { continue }  // padding

            let systemLetters = ["P", "C", "B", "U"]
            let letter = systemLetters[Int(first >> 6) & 0b11]
            let digit1 = (first >> 4) & 0b11
            let digit2 = first & 0x0F
            let digit3 = (second >> 4) & 0x0F
            let digit4 = second & 0x0F
            let code = String(
                format: "%@%d%X%X%X",
                letter,
                Int(digit1),
                Int(digit2),
                Int(digit3),
                Int(digit4)
            )
            codes.append(
                TroubleCode(
                    code: code,
                    descriptionText: DTCDictionary.description(for: code),
                    isPending: isPending,
                    detectedAt: now
                )
            )
        }
        return codes
    }
}

/// A deliberately small set of common generic codes. Anything unknown is shown as the
/// raw code — inventing a description for a manufacturer-specific code would be worse
/// than showing none.
enum DTCDictionary {
    private static let generic: [String: String] = [
        "P0016": "Crankshaft / camshaft position correlation",
        "P0128": "Coolant thermostat below regulating temperature",
        "P0171": "System too lean (bank 1)",
        "P0300": "Random / multiple cylinder misfire",
        "P0420": "Catalyst system efficiency below threshold",
        "P0442": "Evaporative emission system small leak",
        "P0455": "Evaporative emission system large leak",
        "P0562": "System voltage low",
        "P0563": "System voltage high",
        "P0A80": "Replace hybrid battery pack",
        "P0AFA": "Hybrid battery system voltage low",
        "U0100": "Lost communication with ECM/PCM"
    ]

    static func description(for code: String) -> String {
        generic[code.uppercased()] ?? "Unknown code — check with a dealer scan tool"
    }
}
