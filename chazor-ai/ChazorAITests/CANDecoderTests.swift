import XCTest
@testable import ChazorAI

/// A CAN decoder that is off by one bit produces numbers that look plausible and are
/// wrong, which is the worst possible failure in a car. Both bit layouts are pinned.
final class CANDecoderTests: XCTestCase {

    private func definition(
        startBit: Int,
        bitLength: Int,
        bigEndian: Bool,
        signed: Bool = false,
        scale: Double = 1,
        offset: Double = 0
    ) -> CANSignalDefinition {
        CANSignalDefinition(
            name: "test",
            frameID: 0x100,
            startBit: startBit,
            bitLength: bitLength,
            isBigEndian: bigEndian,
            isSigned: signed,
            scale: scale,
            offset: offset,
            unit: ""
        )
    }

    func testBigEndianExtraction() {
        let frame = CANFrame(identifier: 0x100, payload: [0x02, 0xBC], timestamp: .now)
        let signal = definition(startBit: 0, bitLength: 16, bigEndian: true, scale: 0.1)
        XCTAssertEqual(CANDecoder.physicalValue(of: signal, in: frame) ?? 0, 70.0, accuracy: 0.001)
    }

    func testLittleEndianExtraction() {
        // Same value, Intel byte order.
        let frame = CANFrame(identifier: 0x100, payload: [0xBC, 0x02], timestamp: .now)
        let signal = definition(startBit: 0, bitLength: 16, bigEndian: false, scale: 0.1)
        XCTAssertEqual(CANDecoder.physicalValue(of: signal, in: frame) ?? 0, 70.0, accuracy: 0.001)
    }

    func testSignedValues() {
        let frame = CANFrame(identifier: 0x100, payload: [0xFF], timestamp: .now)
        let signal = definition(startBit: 0, bitLength: 8, bigEndian: true, signed: true)
        XCTAssertEqual(CANDecoder.physicalValue(of: signal, in: frame) ?? 0, -1, accuracy: 0.001)
    }

    func testScaleAndOffset() {
        let frame = CANFrame(identifier: 0x100, payload: [0x83], timestamp: .now)
        let signal = definition(startBit: 0, bitLength: 8, bigEndian: true, scale: 1, offset: -40)
        XCTAssertEqual(CANDecoder.physicalValue(of: signal, in: frame) ?? 0, 91, accuracy: 0.001)
    }

    func testFrameIdentifierMustMatch() {
        let frame = CANFrame(identifier: 0x200, payload: [0x02, 0xBC], timestamp: .now)
        XCTAssertNil(CANDecoder.physicalValue(of: definition(startBit: 0, bitLength: 16, bigEndian: true), in: frame))
    }

    func testSignalRunningPastThePayloadIsRejected() {
        let frame = CANFrame(identifier: 0x100, payload: [0x02], timestamp: .now)
        XCTAssertNil(CANDecoder.physicalValue(of: definition(startBit: 0, bitLength: 16, bigEndian: true), in: frame))
    }

    /// Shipping without a BYD signal map is deliberate; the provider must refuse to
    /// invent values rather than report zeros.
    @MainActor
    func testProviderWithoutSignalMapReportsNothing() async {
        let provider = CANDataProvider()
        provider.connect()
        provider.ingest(CANFrame(identifier: 0x100, payload: [0x02, 0xBC], timestamp: .now))

        do {
            _ = try await provider.getVehicleStatus()
            XCTFail("Expected the provider to refuse without a signal map")
        } catch {
            XCTAssertEqual(
                error as? VehicleDataError,
                .requiresManufacturerDefinition("CAN signal map for BYD Chazor")
            )
        }
    }
}
