import Foundation

/// 셀룰러 단독 모드용 응답 모델 — 기존 엔드포인트의 필요한 조각만 디코딩한다.
struct WatchMe: Decodable {
    struct User: Decodable {
        let enlistedAt: String?
        let dischargeAt: String?
    }
    let user: User
}

struct WatchDutyDays: Decodable {
    let dutyDays: Int
}

struct WatchLeaveSegment: Decodable {
    let category: String
}

struct WatchLeave: Decodable {
    let title: String
    let startDate: String
    let endDate: String
    let status: String
    let returnTime: String?
    let segments: [WatchLeaveSegment]
}

struct WatchLeaves: Decodable {
    let leaves: [WatchLeave]
}

enum WatchApiError: Error {
    case unauthorized
    case requestFailed
}

/**
 * 아이폰 없이 셀룰러로도 워치가 지표를 세는 경로.
 *
 * 숫자는 여기서 세지 않는다 — 응답을 WatchSource로 옮기기만 하고, 세는 일은
 * 아이폰이 보낸 재료와 똑같이 WatchMetrics가 한다. dutyDays는 서버가 `from: 오늘`로
 * 센 값만 오고 날짜 목록은 없으므로, 호출자가 저장해 둔 목록을 이어 붙인다.
 */
enum WatchApi {
    private static func get<T: Decodable>(
        _ path: String,
        apiUrl: String,
        token: String
    ) async throws -> T {
        var request = URLRequest(url: URL(string: apiUrl + path)!)
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        if status == 401 { throw WatchApiError.unauthorized }
        guard (200..<300).contains(status) else { throw WatchApiError.requestFailed }
        return try JSONDecoder().decode(T.self, from: data)
    }

    /// 오늘 기준 재료를 받아 온다. 실패(오프라인·401)는 호출자가 다룬다.
    static func fetchSource(apiUrl: String, token: String, today: String) async throws -> WatchSource {
        async let meTask: WatchMe = get("/auth/me", apiUrl: apiUrl, token: token)
        async let dutyTask: WatchDutyDays = get("/auth/me/duty-days", apiUrl: apiUrl, token: token)
        async let leavesTask: WatchLeaves = get("/leaves/mine", apiUrl: apiUrl, token: token)
        let me = try await meTask
        let dutyDays = try await dutyTask
        let leaves = try await leavesTask

        let countedStatuses: Set<String> = ["shared", "requested", "approved", "completed"]
        return WatchSource(
            enlistedAt: me.user.enlistedAt,
            dischargeAt: me.user.dischargeAt,
            dutyDays: WatchSource.DutyDays(from: today, days: dutyDays.dutyDays, dates: []),
            leaves: leaves.leaves
                .filter { countedStatuses.contains($0.status) && $0.endDate >= today }
                .map { leave in
                    WatchSource.Leave(
                        title: leave.title,
                        startDate: leave.startDate,
                        endDate: leave.endDate,
                        returnTime: leave.returnTime,
                        outing: !leave.segments.isEmpty &&
                            leave.segments.allSatisfy { $0.category == "outing" }
                    )
                }
        )
    }
}
