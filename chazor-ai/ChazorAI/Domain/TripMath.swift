import Foundation

/// Trip arithmetic shared by the live recorder, the history screen and the AI context builder.
enum TripMath {

    /// Average speed in km/h. Returns 0 for a zero-length interval instead of `inf`.
    static func averageSpeedKph(distanceKm: Double, duration: TimeInterval) -> Double {
        guard duration > 0, distanceKm > 0 else { return 0 }
        return distanceKm / (duration / 3_600)
    }

    /// Litres per 100 km. Returns 0 when the car has not moved yet.
    static func consumptionLper100km(fuelLitres: Double, distanceKm: Double) -> Double {
        guard distanceKm > 0.05 else { return 0 }
        return fuelLitres / distanceKm * 100
    }

    /// Distance-weighted mean, so a 2 km trip does not outweigh a 200 km one.
    static func weightedConsumption(_ trips: [(distanceKm: Double, consumption: Double)]) -> Double {
        let distance = trips.reduce(0) { $0 + $1.distanceKm }
        guard distance > 0 else { return 0 }
        let litres = trips.reduce(0) { $0 + $1.consumption / 100 * $1.distanceKm }
        return litres / distance * 100
    }

    static func weightedEVShare(_ trips: [(distanceKm: Double, evPercentage: Double)]) -> Double {
        let distance = trips.reduce(0) { $0 + $1.distanceKm }
        guard distance > 0 else { return 0 }
        let evDistance = trips.reduce(0) { $0 + $1.distanceKm * $1.evPercentage / 100 }
        return min(100, max(0, evDistance / distance * 100))
    }

    /// Relative change between two consumption figures, in percent.
    /// `nil` when there is no meaningful baseline to compare against.
    static func percentChange(from baseline: Double, to current: Double) -> Double? {
        guard baseline > 0.05 else { return nil }
        return (current - baseline) / baseline * 100
    }
}
