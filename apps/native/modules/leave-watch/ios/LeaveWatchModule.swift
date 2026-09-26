import ExpoModulesCore
import WatchConnectivity

/// iPhone 측 세션: 앱이 위젯 타임라인을 만들 때마다 그대로 워치에 밀어 넣는다.
/// applicationContext는 최신 상태만 유지되는 큐라 스로틀링이 필요 없다.
final class LeaveWatchSessionManager: NSObject, WCSessionDelegate {
    static let shared = LeaveWatchSessionManager()

    private var activated = false

    private override init() {
        super.init()
    }

    func activate() {
        guard !activated, WCSession.isSupported() else { return }
        activated = true
        WCSession.default.delegate = self
        WCSession.default.activate()
    }

    func publish(_ payload: String) {
        guard WCSession.isSupported(), WCSession.default.isPaired,
              WCSession.default.isWatchAppInstalled
        else { return }
        try? WCSession.default.updateApplicationContext(["payload": payload])
    }

    var status: [String: Bool] {
        guard WCSession.isSupported() else {
            return ["paired": false, "installed": false]
        }
        return [
            "paired": WCSession.default.isPaired,
            "installed": WCSession.default.isWatchAppInstalled,
        ]
    }

    func session(
        _: WCSession,
        activationDidCompleteWith _: WCSessionActivationState,
        error _: Error?
    ) {}

    func sessionDidBecomeInactive(_: WCSession) {}

    func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }
}

public class LeaveWatchModule: Module {
    public func definition() -> ModuleDefinition {
        Name("LeaveWatch")

        OnCreate {
            LeaveWatchSessionManager.shared.activate()
        }

        Function("publishWatchTimeline") { (payload: String) in
            LeaveWatchSessionManager.shared.publish(payload)
        }

        Function("watchStatus") { () -> [String: Bool] in
            LeaveWatchSessionManager.shared.status
        }
    }
}
