// A UI test that pinches zoom with two real fingers, through XCTest's event synthesis, on the
// simulator. scripts/pinch builds it into Xcode's XCTRunner.app and runs it. ZOOM_PINCHES is
// "<scale>@<velocity>" pinches, "wait <seconds>" pauses and "tap <testId>" taps, separated by ";" (velocity is XCTest's,
// scale per second; negative pinches together).
import XCTest

final class ZoomPinch: XCTestCase {
    func testPinches() throws {
        let app = XCUIApplication(bundleIdentifier: "com.shahidy.zoom")
        app.activate()
        let chat = app.windows.firstMatch
        XCTAssertTrue(chat.waitForExistence(timeout: 10))
        let steps = (ProcessInfo.processInfo.environment["ZOOM_PINCHES"] ?? "").split(separator: ";").map { $0.trimmingCharacters(in: .whitespaces) }
        for step in steps where !step.isEmpty {
            if step.hasPrefix("wait ") {
                Thread.sleep(forTimeInterval: Double(step.dropFirst(5)) ?? 1)
                continue
            }
            if step.hasPrefix("tap ") {
                app.descendants(matching: .any)[String(step.dropFirst(4))].firstMatch.tap()
                continue
            }
            let parts = step.split(separator: "@").compactMap { Double($0) }
            guard parts.count == 2 else { XCTFail("not a pinch: \(step)"); continue }
            print("pinch \(parts[0]) at \(parts[1]) a second")
            chat.pinch(withScale: parts[0], velocity: parts[1])
        }
    }
}
