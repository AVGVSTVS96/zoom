// `<zoom-pinch>`: where the chat is on its one scale (1 Full, 2 Short, 3 Map), as a number that moves
// with two fingers anywhere on the chat and springs to a stop when they lift. app.contract lays the chat
// out from that number every frame. Exact reports a transform drag's pinch only on release, so the
// pinch is UIKit's own, on the scroller this view sits in.
//
// It reports with `change`: "b <z> <x> <y>" as a move starts (x and y where the fingers are in the
// scroller's visible box, -1 -1 for a move the app asked for), "m <z> <y>" each frame, "e <z>" once it
// rests on a stop. Props: `level` (where it opens), `stops` (the highest stop), `ask` ("<stop>#<n>",
// a move the app asks for) and `still` (reduced motion: no frames between stops).
#if os(iOS)
import UIKit

final class ZoomModule: ExactModule {
    override class var views: [String: ExactNativeFactory] {
        ["zoom-pinch": ExactNativeFactory(for: ZoomModule.self) { module, props, events in Pinch(module, props, events) }]
    }
}
let exactModule: ExactModule.Type = ZoomModule.self

final class Pinch: ExactNativeInstance {
    private let probe = Probe()
    private let module: ZoomModule
    private var z = 2.0, top = 3.0, still = false, ask = ""
    private var placed = false
    private var start = 2.0, base: CGFloat = 1, focus = CGPoint.zero, ticked: Double?
    private var spring: ExactTicket?
    private var velocity = 0.0, goal = 2.0, last = 0.0
    private let tick = UIImpactFeedbackGenerator(style: .light)

    init(_ module: ZoomModule, _ props: [String: String], _ events: ExactNativeEvents) {
        self.module = module
        super.init(events: events)
        try? setProps(props)
        probe.pinched = { [weak self] in self?.pinched($0) }
    }
    override var view: ExactNativeView { probe }
    override func destroy() { spring?.stop(); probe.detach() }

    override func setProps(_ props: [String: String]) throws {
        top = Double(props["stops"] ?? "") ?? 3
        still = props["still"] == "true"
        let next = props["ask"] ?? ""
        // The ask it is made with was answered before it was made.
        if !placed { z = Double(props["level"] ?? "") ?? 2; ask = next; placed = true }
        if next != ask, let stop = Double(next.split(separator: "#").first ?? "") {
            ask = next
            move(to: min(max(stop, 1), top), from: nil)
        }
        z = min(z, top)
    }

    /// One stop per 1.6× of pinch scale; past the ends the scale gives a little and pulls back.
    private func level(_ scale: CGFloat) -> Double {
        let raw = start - log(Double(max(scale / base, 0.01))) / log(1.6)
        let over = raw > top ? raw - top : raw < 1 ? raw - 1 : 0
        return raw - over + 0.2 * tanh(over / 0.2)
    }

    private func pinched(_ g: UIPinchGestureRecognizer) {
        guard let scroller = probe.scroller else { return }
        let at = g.location(in: scroller), seen = CGPoint(x: at.x - scroller.contentOffset.x, y: at.y - scroller.contentOffset.y)
        switch g.state {
        case .began:
            spring?.stop(); spring = nil
            start = z
            // UIKit recognizes a pinch some way into it: the chat moves from there, without a jump.
            base = g.scale
            ticked = nil
            focus = seen
            tick.prepare()
            events.change("b \(z) \(seen.x) \(seen.y)")
        case .changed:
            let next = level(g.scale)
            crossed(from: z, to: next)
            z = next
            if !still { events.change("m \(z) \(seen.y)") }
        case .ended, .cancelled, .failed:
            // The pinch's speed in stops a second: a fast one goes on to the next stop that way.
            let speed = g.scale > 0 ? -Double(g.velocity / g.scale) / log(1.6) : 0
            let near = min(max(z.rounded(), 1), top)
            let stop = speed > 1.2 ? min(floor(z + 0.001) + 1, top) : speed < -1.2 ? max(ceil(z - 0.001) - 1, 1) : near
            focus = seen
            move(to: stop, from: speed)
        default: break
        }
    }

    /// Springs from where it is to `stop`; `speed` is the fingers' when they lifted, nil for a move the
    /// app asked for, which reports its start.
    private func move(to stop: Double, from speed: Double?) {
        spring?.stop(); spring = nil
        if speed == nil { events.change("b \(z) -1 -1") }
        goal = stop
        velocity = speed.map { max(min($0, 8), -8) } ?? 0
        if still { z = stop; events.change("e \(stop)"); return }
        last = 0
        spring = module.context.frames { [weak self] frame in self?.step(frame.now) }
    }

    private func step(_ now: Double) {
        // The frame after the stop is reached: the chat has been placed at the stop, and now rests there.
        if z == goal && velocity == 0 {
            spring?.stop(); spring = nil
            events.change("e \(goal)")
            return
        }
        let dt = last == 0 ? 1.0 / 60 : min(max((now - last) / 1000, 0), 1.0 / 30)
        last = now
        // A stiff, nearly critically damped spring: no overshoot past a stop worth seeing.
        let stiffness = 300.0, damping = 2 * sqrt(stiffness) * 0.95
        velocity += (stiffness * (goal - z) - damping * velocity) * dt
        let next = z + velocity * dt
        crossed(from: z, to: next)
        z = next
        if abs(goal - z) < 0.002 && abs(velocity) < 0.02 {
            z = goal
            velocity = 0
            if ticked != goal { tap(goal) }
        }
        events.change("m \(z) -1")
    }

    /// A light tap as the level passes or reaches a stop.
    private func crossed(from a: Double, to b: Double) {
        let lo = min(a, b), hi = max(a, b)
        guard let stop = stride(from: 1.0, through: top, by: 1).first(where: { $0 != a && $0 >= lo && $0 <= hi }) else { return }
        tap(stop)
    }

    private func tap(_ stop: Double) {
        ticked = stop
        tick.impactOccurred()
        tick.prepare()
    }
}

/// An empty view in the chat. It puts the pinch on the window, since Exact may host a native view
/// outside the scroller it is written in, and takes it only over the scroller whose testId is
/// `chat`, whose own pan it stops while two fingers hold the chat, so the app alone places it.
final class Probe: UIView, UIGestureRecognizerDelegate {
    var pinched: ((UIPinchGestureRecognizer) -> Void)?
    private(set) weak var scroller: UIScrollView?
    private weak var host: UIWindow?
    private lazy var pinch: UIPinchGestureRecognizer = {
        let g = UIPinchGestureRecognizer(target: self, action: #selector(changed(_:)))
        g.delegate = self
        return g
    }()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        isAccessibilityElement = false
    }
    required init?(coder: NSCoder) { nil }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        detach()
        host = window
        window?.addGestureRecognizer(pinch)
    }

    func detach() {
        host?.removeGestureRecognizer(pinch)
        scroller?.panGestureRecognizer.isEnabled = true
        host = nil
        scroller = nil
    }

    /// The chat's scroller: the scroll view inside the node whose testId is `chat`.
    private func chat(in view: UIView) -> UIScrollView? {
        if view.accessibilityIdentifier == "chat", let found = view as? UIScrollView ?? view.subviews.compactMap({ $0 as? UIScrollView }).first { return found }
        for sub in view.subviews { if let found = chat(in: sub) { return found } }
        return nil
    }

    // As the pinch's delegate, which UIKit asks by the same name as a view.
    override func gestureRecognizerShouldBegin(_ g: UIGestureRecognizer) -> Bool {
        guard let host, let found = scroller ?? chat(in: host) else { return false }
        scroller = found
        return found.bounds.contains(g.location(in: found))
    }

    @objc private func changed(_ g: UIPinchGestureRecognizer) {
        guard let scroller else { return }
        switch g.state {
        case .began:
            scroller.panGestureRecognizer.isEnabled = false
            scroller.setContentOffset(scroller.contentOffset, animated: false)
        case .ended, .cancelled, .failed:
            scroller.panGestureRecognizer.isEnabled = true
        default: break
        }
        pinched?(g)
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool { true }
}
#endif
