import Foundation

/// Identifies a data source so the UI can show where numbers come from and the user
/// can switch between them.
enum VehicleDataSourceID: String, CaseIterable, Identifiable, Sendable {
    case mock
    case bluetoothOBD
    case can

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .mock: return "Demo"
        case .bluetoothOBD: return "OBD-II"
        case .can: return "CAN"
        }
    }
}

enum VehicleDataError: LocalizedError, Equatable {
    case notConnected
    case unsupportedParameter(String)
    case adapterTimeout
    case adapterError(String)
    /// The parameter exists on this car but needs a manufacturer-specific definition
    /// that this prototype deliberately does not guess at.
    case requiresManufacturerDefinition(String)

    var errorDescription: String? {
        switch self {
        case .notConnected:
            return "Adapter is not connected"
        case .unsupportedParameter(let name):
            return "Parameter is not supported by this adapter: \(name)"
        case .adapterTimeout:
            return "Adapter did not respond in time"
        case .adapterError(let message):
            return message
        case .requiresManufacturerDefinition(let name):
            return "\(name) requires a manufacturer-specific definition that is not implemented"
        }
    }
}

/// The single seam between the app and the car.
///
/// Everything above this protocol — UI, CarPlay, persistence, AI — is written against
/// snapshots only, so swapping the demo generator for a real adapter changes nothing else.
///
/// The shape follows the agreed method names (`connect`, `disconnect`, `getVehicleStatus`,
/// `getBatteryStatus`, `getDiagnostics`, `getTripData`) with two deliberate additions:
/// the accessors are `async throws` because every real transport is asynchronous and can
/// fail, and `frames` provides a push stream so the UI does not have to poll.
///
/// **Read-only by contract.** There is no member on this protocol that writes to the
/// vehicle. See `Docs/SAFETY.md`.
@MainActor
protocol VehicleDataProvider: AnyObject {
    var sourceID: VehicleDataSourceID { get }
    var connectionState: ConnectionState { get }

    /// Continuous updates. A provider emits a frame whenever any value changes,
    /// at a rate suitable for a display (about 1 Hz).
    var frames: AsyncStream<VehicleFrame> { get }

    func connect()
    func disconnect()

    func getVehicleStatus() async throws -> VehicleStatusSnapshot
    func getBatteryStatus() async throws -> BatteryStatusSnapshot
    func getDiagnostics() async throws -> DiagnosticsSnapshot
    func getTripData() async throws -> TripSnapshot
}

extension VehicleDataProvider {
    /// Convenience for callers that want one coherent set of values.
    func getFrame() async throws -> VehicleFrame {
        async let vehicle = getVehicleStatus()
        async let battery = getBatteryStatus()
        async let diagnostics = getDiagnostics()
        async let trip = getTripData()
        return try await VehicleFrame(vehicle: vehicle, battery: battery, diagnostics: diagnostics, trip: trip)
    }
}
