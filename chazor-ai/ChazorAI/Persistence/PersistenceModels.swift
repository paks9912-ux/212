import Foundation
import SwiftData

// MARK: - Vehicle

@Model
final class Vehicle {
    @Attribute(.unique) var id: UUID
    var make: String
    var model: String
    var modelYear: Int?
    var odometerKm: Double
    var createdAt: Date

    @Relationship(deleteRule: .cascade, inverse: \Trip.vehicle)
    var trips: [Trip] = []

    @Relationship(deleteRule: .cascade, inverse: \MaintenanceRecord.vehicle)
    var maintenanceRecords: [MaintenanceRecord] = []

    @Relationship(deleteRule: .cascade, inverse: \DiagnosticEvent.vehicle)
    var diagnosticEvents: [DiagnosticEvent] = []

    init(
        id: UUID = UUID(),
        make: String = "BYD",
        model: String = "Chazor",
        modelYear: Int? = 2025,
        odometerKm: Double = 84_320,
        createdAt: Date = .now
    ) {
        self.id = id
        self.make = make
        self.model = model
        self.modelYear = modelYear
        self.odometerKm = odometerKm
        self.createdAt = createdAt
    }

    var identity: VehicleIdentity {
        VehicleIdentity(make: make, model: model, modelYear: modelYear, vin: nil)
    }
}

// MARK: - Trip

@Model
final class Trip {
    @Attribute(.unique) var id: UUID
    var date: Date
    /// Kilometres.
    var distance: Double
    /// Seconds.
    var duration: TimeInterval
    /// km/h.
    var averageSpeed: Double
    /// Litres per 100 km.
    var consumption: Double
    /// 0...100.
    var evPercentage: Double
    /// 0...100.
    var hevPercentage: Double

    var vehicle: Vehicle?

    init(
        id: UUID = UUID(),
        date: Date = .now,
        distance: Double = 0,
        duration: TimeInterval = 0,
        averageSpeed: Double = 0,
        consumption: Double = 0,
        evPercentage: Double = 0,
        hevPercentage: Double = 0,
        vehicle: Vehicle? = nil
    ) {
        self.id = id
        self.date = date
        self.distance = distance
        self.duration = duration
        self.averageSpeed = averageSpeed
        self.consumption = consumption
        self.evPercentage = evPercentage
        self.hevPercentage = hevPercentage
        self.vehicle = vehicle
    }
}

// MARK: - Maintenance

enum MaintenanceType: String, Codable, CaseIterable, Identifiable, Sendable {
    case engineOil = "ENGINE OIL"
    case airFilter = "AIR FILTER"
    case cabinFilter = "CABIN FILTER"
    case brakeCheck = "BRAKE CHECK"
    case brakeFluid = "BRAKE FLUID"
    case coolant = "COOLANT"
    case tyreRotation = "TYRE ROTATION"
    case generalService = "SERVICE"
    case other = "OTHER"

    var id: String { rawValue }

    /// Default interval in kilometres, `nil` when the item is time-based only.
    var intervalKm: Double? {
        switch self {
        case .engineOil: return 10_000
        case .airFilter: return 20_000
        case .cabinFilter: return 15_000
        case .brakeCheck: return 15_000
        case .brakeFluid: return 40_000
        case .coolant: return 60_000
        case .tyreRotation: return 10_000
        case .generalService: return 15_000
        case .other: return nil
        }
    }

    /// Name used in spoken answers. The raw value stays English because it is also the
    /// on-screen label and the key sent to the model.
    var spokenName: String {
        switch self {
        case .engineOil: return "замена масла"
        case .airFilter: return "воздушный фильтр"
        case .cabinFilter: return "салонный фильтр"
        case .brakeCheck: return "проверка тормозов"
        case .brakeFluid: return "тормозная жидкость"
        case .coolant: return "антифриз"
        case .tyreRotation: return "перестановка колёс"
        case .generalService: return "плановое ТО"
        case .other: return "обслуживание"
        }
    }

    /// Default interval in days, `nil` when the item is distance-based only.
    var intervalDays: Int? {
        switch self {
        case .engineOil: return 365
        case .brakeFluid: return 730
        case .coolant: return 1_095
        case .generalService: return 365
        default: return nil
        }
    }
}

@Model
final class MaintenanceRecord {
    @Attribute(.unique) var id: UUID
    /// Stored as the raw value of `MaintenanceType` so the schema survives enum changes.
    var typeRawValue: String
    var date: Date
    /// Odometer reading at the time of the service, kilometres.
    var mileage: Double
    /// Cost in the user's currency. `0` when unknown.
    var cost: Double
    var notes: String

    var vehicle: Vehicle?

    init(
        id: UUID = UUID(),
        type: MaintenanceType = .generalService,
        date: Date = .now,
        mileage: Double = 0,
        cost: Double = 0,
        notes: String = "",
        vehicle: Vehicle? = nil
    ) {
        self.id = id
        self.typeRawValue = type.rawValue
        self.date = date
        self.mileage = mileage
        self.cost = cost
        self.notes = notes
        self.vehicle = vehicle
    }

    var type: MaintenanceType {
        get { MaintenanceType(rawValue: typeRawValue) ?? .other }
        set { typeRawValue = newValue.rawValue }
    }
}

// MARK: - Diagnostics

@Model
final class DiagnosticEvent {
    @Attribute(.unique) var id: UUID
    var code: String
    var descriptionText: String
    var date: Date
    var mileage: Double
    var isCleared: Bool
    var severityRawValue: String

    var vehicle: Vehicle?

    init(
        id: UUID = UUID(),
        code: String,
        descriptionText: String,
        date: Date = .now,
        mileage: Double = 0,
        isCleared: Bool = false,
        severity: MetricStatus = .warning,
        vehicle: Vehicle? = nil
    ) {
        self.id = id
        self.code = code
        self.descriptionText = descriptionText
        self.date = date
        self.mileage = mileage
        self.isCleared = isCleared
        self.severityRawValue = severity.rawValue
        self.vehicle = vehicle
    }

    var severity: MetricStatus {
        get { MetricStatus(rawValue: severityRawValue) ?? .warning }
        set { severityRawValue = newValue.rawValue }
    }
}
