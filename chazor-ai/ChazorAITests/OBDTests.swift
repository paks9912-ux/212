import XCTest
@testable import ChazorAI

/// The parser turns adapter text into numbers a driver reads as fact, so its formulas are
/// pinned against the SAE J1979 definitions.
final class OBDResponseParserTests: XCTestCase {

    func testVehicleSpeed() {
        XCTAssertEqual(OBDResponseParser.vehicleSpeedKph("41 0D 44"), 68)
        // Adapters with spaces switched off return an unbroken run of bytes.
        XCTAssertEqual(OBDResponseParser.vehicleSpeedKph("410D44"), 68)
    }

    func testCoolantTemperatureAppliesTheOffset() {
        XCTAssertEqual(OBDResponseParser.coolantTemperatureC("41 05 83"), 91)
    }

    func testEngineRPM() {
        XCTAssertEqual(OBDResponseParser.engineRPM("41 0C 1A F8") ?? 0, 1726, accuracy: 0.01)
    }

    func testControlModuleVoltage() {
        XCTAssertEqual(OBDResponseParser.controlModuleVoltage("41 42 31 38") ?? 0, 12.6, accuracy: 0.001)
    }

    func testDistanceSinceCodesCleared() {
        XCTAssertEqual(OBDResponseParser.distanceSinceCodesClearedKm("41 31 01 2C") ?? 0, 300, accuracy: 0.001)
    }

    func testFuelRate() {
        XCTAssertEqual(OBDResponseParser.engineFuelRateLitresPerHour("41 5E 00 64") ?? 0, 5.0, accuracy: 0.001)
    }

    func testHybridPackRemainingLife() {
        XCTAssertEqual(OBDResponseParser.hybridPackRemainingLifePercent("41 5B BC") ?? 0, 73.7, accuracy: 0.1)
    }

    func testNoDataIsNotParsedAsAValue() {
        XCTAssertNil(OBDResponseParser.vehicleSpeedKph("NO DATA"))
        XCTAssertNil(OBDResponseParser.coolantTemperatureC("SEARCHING..."))
        XCTAssertTrue(OBDResponseParser.isNoData("NO DATA"))
    }

    func testMismatchedPIDIsRejected() {
        // A response to a different PID must never be read as the requested one.
        XCTAssertNil(OBDResponseParser.vehicleSpeedKph("41 05 83"))
    }

    func testAdapterVoltage() {
        XCTAssertEqual(OBDResponseParser.adapterVoltage("12.6V") ?? 0, 12.6, accuracy: 0.001)
    }

    func testTroubleCodeDecoding() {
        let codes = OBDResponseParser.troubleCodes("43 04 20 01 28 00 00")
        XCTAssertEqual(codes.map(\.code), ["P0420", "P0128"])
        XCTAssertEqual(codes.first?.descriptionText, "Catalyst system efficiency below threshold")
    }

    func testTroubleCodesAcrossSystemLetters() {
        let codes = OBDResponseParser.troubleCodes("43 C1 00")
        XCTAssertEqual(codes.map(\.code), ["U0100"])
    }

    func testEmptyTroubleCodeResponse() {
        XCTAssertTrue(OBDResponseParser.troubleCodes("43 00 00").isEmpty)
        XCTAssertTrue(OBDResponseParser.troubleCodes("NO DATA").isEmpty)
    }
}

/// The command guard is the code-level guarantee that the app cannot write to the car.
final class OBDCommandTests: XCTestCase {

    func testReadServicesAreAllowed() {
        XCTAssertNotNil(OBDCommand("010D"))
        XCTAssertNotNil(OBDCommand("03"))
        XCTAssertNotNil(OBDCommand("09 02"))
        XCTAssertNotNil(OBDCommand("0A"))
    }

    func testWriteServicesAreRejected() {
        // 04 clears diagnostic trouble codes — a write to the vehicle.
        XCTAssertNil(OBDCommand("04"))
        // 08 controls an on-board component.
        XCTAssertNil(OBDCommand("08 01"))
        // UDS write-by-identifier and ECU reset.
        XCTAssertNil(OBDCommand("2E F190"))
        XCTAssertNil(OBDCommand("11 01"))
        XCTAssertNil(OBDCommand("31 01 FF 00"))
    }

    func testOnlyAdapterATCommandsAreAllowed() {
        XCTAssertNotNil(OBDCommand("ATZ"))
        XCTAssertNotNil(OBDCommand("atsp0"))
        XCTAssertNil(OBDCommand("ATPP 0C SV 01"))
        XCTAssertNil(OBDCommand(""))
        XCTAssertNil(OBDCommand("hello"))
    }

    func testCommandsAreNormalised() {
        XCTAssertEqual(OBDCommand("01 0d")?.text, "010D")
    }
}

final class OBDTripAccumulatorTests: XCTestCase {

    func testIntegratesDistanceAndFuel() {
        var accumulator = OBDTripAccumulator()
        let start = Date()
        _ = accumulator.update(speedKph: 0, fuelRateLitresPerHour: 0, isElectric: true, at: start)

        // One hour at 60 km/h burning 3 L/h → 60 km on 3 litres → 5 L/100 km.
        var snapshot = TripSnapshot.placeholder
        for second in 1...3_600 {
            snapshot = accumulator.update(
                speedKph: 60,
                fuelRateLitresPerHour: 3,
                isElectric: false,
                at: start.addingTimeInterval(Double(second))
            )
        }
        XCTAssertEqual(snapshot.distanceKm, 60, accuracy: 0.1)
        XCTAssertEqual(snapshot.consumptionLper100km, 5, accuracy: 0.05)
        XCTAssertEqual(snapshot.evPercentage, 0, accuracy: 0.1)
    }

    /// A backgrounded app or a dropped adapter must not book a phantom 200 km.
    func testLongGapsAreClamped() {
        var accumulator = OBDTripAccumulator()
        let start = Date()
        _ = accumulator.update(speedKph: 100, fuelRateLitresPerHour: 5, isElectric: false, at: start)
        let snapshot = accumulator.update(
            speedKph: 100,
            fuelRateLitresPerHour: 5,
            isElectric: false,
            at: start.addingTimeInterval(3_600)
        )
        XCTAssertLessThan(snapshot.distanceKm, 1)
    }
}
