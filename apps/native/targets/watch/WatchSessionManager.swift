import WatchConnectivity
import WidgetKit

/// 워치의 데이터 원천 두 가지:
///  - 아이폰이 보낸 타임라인(applicationContext) — 같이 켜져 있으면 이게 주 경로.
///  - 워치가 토큰으로 직접 API를 두드려 센 지표 — 셀룰러 단독 모드.
/// 둘 다 최신이 이기도록 `props`만 갱신한다.
final class WatchSessionManager: NSObject, ObservableObject {
    private static let storeKey = "leave.watchEnvelope"
    private static let faceSuite = "group.app.leave.mobile"
    private static let faceKey = "leave.watchFace"

    @Published private(set) var props: LeaveWatchProps?
    @Published private(set) var service: WatchServiceDates?
    /// 단독 모드로 마지막 갱신이 성공한 시각.
    @Published private(set) var standaloneUpdatedAt: Date?

    private var apiUrl: String?
    /// 저장된 마지막 봉투 — 단독 갱신으로 일부만 바꿀 때 기반이 된다.
    private var stored: WatchEnvelope?
    /// 다음 타임라인 엔트리 경계에서 props를 다시 고르는 타이머.
    private var reselectTimer: Timer?

    var hasToken: Bool { WatchKeychain.read() != nil }

    override init() {
        super.init()
        if let json = UserDefaults.standard.string(forKey: Self.storeKey),
           let envelope = Self.decode(json) {
            apply(envelope, persist: false)
        }
        if WCSession.isSupported() {
            WCSession.default.delegate = self
            WCSession.default.activate()
        }
    }

    private static func decode(_ json: String) -> WatchEnvelope? {
        guard let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(WatchEnvelope.self, from: data)
    }

    /// 세션 토큰은 UserDefaults에 두지 않는다 — 저장본은 auth를 지운 사본이다.
    /// 토큰은 키체인에만 산다.
    private func persist(_ envelope: WatchEnvelope) {
        let sanitized = WatchEnvelope(
            timeline: envelope.timeline,
            service: envelope.service,
            face: envelope.face,
            auth: nil
        )
        guard let data = try? JSONEncoder().encode(sanitized),
              let json = String(data: data, encoding: .utf8)
        else { return }
        UserDefaults.standard.set(json, forKey: Self.storeKey)
    }

    private func apply(_ envelope: WatchEnvelope, persist shouldPersist: Bool = true) {
        if shouldPersist { persist(envelope) }
        stored = envelope
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
        var faceChanged = false
        if let face = envelope.face, let data = try? JSONEncoder().encode(face),
           let json = String(data: data, encoding: .utf8) {
            UserDefaults(suiteName: Self.faceSuite)?
                .set(json, forKey: Self.faceKey)
            faceChanged = true
        } else if envelope.auth == nil {
            // 비로그인 페이로드에는 face가 없다 — 지난 계정의 컴플리케이션 값을 지운다.
            UserDefaults(suiteName: Self.faceSuite)?
                .removeObject(forKey: Self.faceKey)
            faceChanged = true
        }
        DispatchQueue.main.async {
            self.service = envelope.service
            self.reselectProps(from: envelope.timeline)
            if faceChanged {
                WidgetCenter.shared.reloadAllTimelines()
            }
        }
    }

    /// 지금 시각의 엔트리를 고르고, 다음 엔트리가 시작되는 순간 다시 고르도록
    /// 타이머를 건다 — 앱이 자정을 넘어 살아 있어도 타일이 어제 값에 멈추지 않는다.
    @MainActor
    private func reselectProps(from timeline: [WatchTimelineEntry]) {
        reselectTimer?.invalidate()
        props = LeaveWatchPayload.currentProps(from: timeline)
        guard let next = LeaveWatchPayload.nextEntryDate(from: timeline) else { return }
        reselectTimer = Timer.scheduledTimer(
            withTimeInterval: next.timeIntervalSinceNow, repeats: false
        ) { [weak self] _ in
            Task { @MainActor in self?.reselectProps(from: timeline) }
        }
    }

    /// 단독 갱신 성공 시에도 컴플리케이션 값을 App Group에 쓴다.
    private func persistFace(_ face: WatchFaceData) {
        guard let data = try? JSONEncoder().encode(face),
              let json = String(data: data, encoding: .utf8) else { return }
        UserDefaults(suiteName: Self.faceSuite)?
            .set(json, forKey: Self.faceKey)
        WidgetCenter.shared.reloadAllTimelines()
    }

    /// 단독 갱신 결과를 저장 봉투에도 심는다 — 재시작해도 최신 값이 살아 있게.
    /// 지나간 엔트리는 오늘 값으로 갈아 끼우고 미래 엔트리는 그대로 둔다.
    @MainActor
    private func mergeRefresh(_ result: WatchApi.Result) {
        let now = Date()
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let fresh = WatchTimelineEntry(
            date: formatter.string(from: now), props: result.props
        )
        let future = (stored?.timeline ?? []).filter {
            LeaveWatchPayload.entryDate($0).map { $0 > now } ?? false
        }
        let updated = WatchEnvelope(
            timeline: [fresh] + future,
            service: result.service ?? stored?.service,
            face: result.face,
            auth: nil
        )
        stored = updated
        persist(updated)
        service = updated.service
        reselectProps(from: updated.timeline)
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
            self.standaloneUpdatedAt = Date()
            mergeRefresh(result)
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
        if let json = context["payload"] as? String,
           let envelope = Self.decode(json) {
            apply(envelope)
        }
    }

    func session(_: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        if let json = userInfo["payload"] as? String,
           let envelope = Self.decode(json) {
            apply(envelope)
        }
    }
}
