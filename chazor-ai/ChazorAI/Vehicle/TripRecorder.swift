import Foundation
import SwiftData

/// Turns the live trip snapshot into stored `Trip` rows.
///
/// A trip is written when the provider starts a new one, or after the car has been
/// stationary long enough that the previous drive is clearly over.
@MainActor
final class TripRecorder {

    private let context: ModelContext
    private let vehicle: Vehicle

    /// Trips shorter than this are noise (moving the car in a car park).
    private let minimumDistanceKm: Double
    /// Stationary time after which the current trip is considered finished.
    private let idleTimeout: TimeInterval

    private var currentSnapshot: TripSnapshot?
    private var stationarySeconds: TimeInterval = 0
    private var lastFrameTime: Date?
    /// Trips already written, keyed by their start time, so a drive that resumes after a
    /// long stop updates its row instead of creating a duplicate.
    private var savedTrips: [Date: Trip] = [:]

    init(
        context: ModelContext,
        vehicle: Vehicle,
        minimumDistanceKm: Double = 0.5,
        idleTimeout: TimeInterval = 180
    ) {
        self.context = context
        self.vehicle = vehicle
        self.minimumDistanceKm = minimumDistanceKm
        self.idleTimeout = idleTimeout
    }

    func ingest(_ frame: VehicleFrame) {
        defer { lastFrameTime = frame.vehicle.timestamp }

        // The provider rolled over to a new trip: persist the one that just ended.
        if let current = currentSnapshot, current.startedAt != frame.trip.startedAt {
            persist(current)
            stationarySeconds = 0
        }
        currentSnapshot = frame.trip

        // Odometer keeps advancing even when a trip is not worth storing.
        if frame.vehicle.odometerKm > vehicle.odometerKm {
            vehicle.odometerKm = frame.vehicle.odometerKm
        }

        let elapsed = lastFrameTime.map { frame.vehicle.timestamp.timeIntervalSince($0) } ?? 0
        if frame.vehicle.speedKph <= 1 {
            stationarySeconds += max(0, min(elapsed, 10))
            if stationarySeconds >= idleTimeout {
                persist(frame.trip)
                stationarySeconds = 0
            }
        } else {
            stationarySeconds = 0
        }
    }

    /// Writes the trip in progress, e.g. when the app is backgrounded.
    func finalizeCurrentTrip() {
        guard let currentSnapshot else { return }
        persist(currentSnapshot)
    }

    private func persist(_ snapshot: TripSnapshot) {
        guard snapshot.distanceKm >= minimumDistanceKm else { return }

        let distance = (snapshot.distanceKm * 10).rounded() / 10
        let averageSpeed = (snapshot.averageSpeedKph * 10).rounded() / 10
        let consumption = (snapshot.consumptionLper100km * 10).rounded() / 10

        if let existing = savedTrips[snapshot.startedAt] {
            existing.distance = distance
            existing.duration = snapshot.duration
            existing.averageSpeed = averageSpeed
            existing.consumption = consumption
            existing.evPercentage = snapshot.evPercentage.rounded()
            existing.hevPercentage = snapshot.hevPercentage.rounded()
        } else {
            let trip = Trip(
                date: snapshot.startedAt,
                distance: distance,
                duration: snapshot.duration,
                averageSpeed: averageSpeed,
                consumption: consumption,
                evPercentage: snapshot.evPercentage.rounded(),
                hevPercentage: snapshot.hevPercentage.rounded(),
                vehicle: vehicle
            )
            context.insert(trip)
            savedTrips[snapshot.startedAt] = trip
        }
        try? context.save()
    }
}
