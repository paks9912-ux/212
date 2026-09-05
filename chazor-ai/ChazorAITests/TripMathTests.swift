import XCTest
@testable import ChazorAI

final class TripMathTests: XCTestCase {

    func testAverageSpeedHandlesZeroDuration() {
        XCTAssertEqual(TripMath.averageSpeedKph(distanceKm: 10, duration: 0), 0)
        XCTAssertEqual(TripMath.averageSpeedKph(distanceKm: 0, duration: 600), 0)
    }

    func testAverageSpeed() {
        XCTAssertEqual(TripMath.averageSpeedKph(distanceKm: 24.7, duration: 38 * 60), 39, accuracy: 0.5)
    }

    func testConsumptionIgnoresNoiseDistances() {
        XCTAssertEqual(TripMath.consumptionLper100km(fuelLitres: 1, distanceKm: 0.01), 0)
        XCTAssertEqual(TripMath.consumptionLper100km(fuelLitres: 1.06, distanceKm: 24.7), 4.3, accuracy: 0.05)
    }

    /// A 2 km trip must not drag the average as hard as a 200 km one.
    func testWeightedConsumptionIsDistanceWeighted() {
        let value = TripMath.weightedConsumption([
            (distanceKm: 200, consumption: 5.0),
            (distanceKm: 2, consumption: 20.0)
        ])
        XCTAssertEqual(value, 5.15, accuracy: 0.02)
    }

    func testWeightedEVShare() {
        let value = TripMath.weightedEVShare([
            (distanceKm: 50, evPercentage: 100),
            (distanceKm: 50, evPercentage: 0)
        ])
        XCTAssertEqual(value, 50, accuracy: 0.001)
    }

    func testPercentChangeNeedsABaseline() {
        XCTAssertNil(TripMath.percentChange(from: 0, to: 4.3))
        XCTAssertEqual(TripMath.percentChange(from: 4.0, to: 5.0) ?? 0, 25, accuracy: 0.001)
    }
}
