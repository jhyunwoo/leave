import WatchConnectivity
import WidgetKit

/// 워치의 데이터 원천 두 가지:
///  - 아이폰이 보낸 타임라인(applicationContext) — 같이 켜져 있으면 이게 주 경로.
///  - 워치가 토큰으로 직접 API를 두드려 센 지표 — 셀룰러 단독 모드.
/// 둘 다 최신이 이기도록 `props`만 갱신한다.
final class WatchSessionManager: NSObject, ObservableObject {
    private static let storeKey = "leave.watchEnvelope"

    @Published private(set) var props: LeaveWatchProps?
    @Published private(set) var service: WatchServiceDates?
    /// 단독 모드로 마지막 갱신이 성공한 시각.
    @Published private(set) var standaloneUpdatedAt: Date?

    private var apiUrl: String?

    var hasToken: Bool { WatchKeychain.read() != nil }

    override init() {
        super.init()
        if let json = UserDefaults.standard.string(forKey: Self.storeKey) {
            apply(json: json)
        }
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    private func apply(json: String) {
        UserDefaults.standard.set(json, forKey: Self.storeKey)
        guard let data = json.data(using: .utf8),
              let envelope = try? JSONDecoder().decode(WatchEnvelope.self, from: data)
        else { return }
        if let auth = envelope.auth {
            apiUrl = auth.apiUrl
            UserDefaults.standard.set(auth.apiUrl, forKey: "leave.watchApiUrl")
            WatchKeychain.save(auth.token)
        } else {
            // 폰이 명시적으로 비로그인 페이로드를 보냈다 — 토큰도 지운다.
            apiUrl = nil
            WatchKeychain.clear()
        }
        // 페이스 컴플리케이션이 읽는 App Group — 위젯 익스텐션과 공유.
        if let face = envelope.face, let data = try? JSONEncoder().encode(face),
           let json = String(data: data, encoding: .utf8) {
            UserDefaults(suiteName: "group.app.leave.mobile")?
                .set(json, forKey: "leave.watchFace")
        }
        DispatchQueue.main.async {
            self.service = envelope.service
            self.props = LeaveWatchPayload.currentProps(from: envelope.timeline)
            if envelope.face != nil {
                WidgetCenter.shared.reloadAllTimelines()
            }
        }
    }

    /// 단독 갱신 성공 시에도 컴플리케이션 값을 App Group에 쓴다.
    private func persistFace(_ face: WatchFaceData) {
        guard let data = try? JSONEncoder().encode(face),
              let json = String(data: data, encoding: .utf8) else { return }
        UserDefaults(suiteName: "group.app.leave.mobile")?
            .set(json, forKey: "leave.watchFace")
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// 아이폰 없이 API를 직접 쳐서 지표를 새로 고친다. 토큰이 없거나 실패하면 캐시 유지.
    @MainActor
    func refreshStandalone() async {
        guard let token = WatchKeychain.read() else { return }
        let apiUrl = apiUrl ?? UserDefaults.standard.string(forKey: "leave.watchApiUrl") ?? ""
        guard !apiUrl.isEmpty else { return }
        let today = SeoulDate.today()
        do {
            let result = try await WatchApi.fetchMetrics(
                apiUrl: apiUrl, token: token, today: today
            )
            self.props = result.props
            self.service = result.service
            self.standaloneUpdatedAt = Date()
            persistFace(result.face)
        } catch WatchApiError.unauthorized {
            WatchKeychain.clear()
            self.props = LeaveWatchProps(state: "signedOut", date: today, metrics: [:])
        } catch {
            // 오프라인 등 — 캐시된 마지막 값을 그대로 보여준다.
        }
    }
}

extension WatchSessionManager: WCSessionDelegate {
    func session(
        _: WCSession,
        activationDidCompleteWith _: WCSessionActivationState,
        error _: Error?
    ) {}

    func session(_: WCSession, didReceiveApplicationContext context: [String: Any]) {
        if let json = context["payload"] as? String {
            apply(json: json)
        }
    }

    func session(_: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        if let json = userInfo["payload"] as? String {
            apply(json: json)
        }
    }
}
