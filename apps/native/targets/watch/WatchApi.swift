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
 * 계산 규칙은 최소한만 가져온다 — dutyDays는 서버가 `from: 오늘`로 센 값을
 * 그대로 쓰고, 다음 휴가·전역 D-day·복무율은 shared와 같은 규칙으로 센다.
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

    struct Result {
        let props: LeaveWatchProps
        let service: WatchServiceDates?
        let face: WatchFaceData
    }

    /// 오늘 날짜로 지표 4개를 계산한다. 실패(오프라인·401)는 호출자가 다룬다.
    static func fetchMetrics(apiUrl: String, token: String, today: String) async throws -> Result {
        async let meTask: WatchMe = get("/auth/me", apiUrl: apiUrl, token: token)
        async let dutyTask: WatchDutyDays = get("/auth/me/duty-days", apiUrl: apiUrl, token: token)
        async let leavesTask: WatchLeaves = get("/leaves/mine", apiUrl: apiUrl, token: token)
        let me = try await meTask
        let dutyDays = try await dutyTask
        let leaves = try await leavesTask

        var metrics: [String: WatchMetricValue] = [:]
        if let dischargeAt = me.user.dischargeAt {
            let days = SeoulDate.diffDays(today, dischargeAt)
            if days >= 0 {
                metrics["discharge"] = WatchMetricValue(
                    value: "D-\(days)", label: "전역",
                    caption: dischargeAt, compact: "전역 D-\(days)", gauge: nil
                )
            }
            if let enlistedAt = me.user.enlistedAt {
                let ratio = SeoulDate.serviceProgress(
                    enlistedAt: enlistedAt, dischargeAt: dischargeAt
                )
                let percent = Int(ratio * 100)
                metrics["progress"] = WatchMetricValue(
                    value: "\(percent)%", label: "복무율",
                    caption: "\(enlistedAt) 입대", compact: "복무 \(percent)%",
                    gauge: ratio
                )
            }
        }
        metrics["dutyDays"] = WatchMetricValue(
            value: "\(dutyDays.dutyDays)일", label: "일과",
            caption: "남은 일과일", compact: "일과 \(dutyDays.dutyDays)일",
            gauge: nil
        )
        if let next = nextLeave(leaves.leaves, today: today) {
            metrics["nextLeave"] = next
        }

        let service: WatchServiceDates?
        if let enlistedAt = me.user.enlistedAt, let dischargeAt = me.user.dischargeAt {
            service = WatchServiceDates(enlistedAt: enlistedAt, dischargeAt: dischargeAt)
        } else {
            service = nil
        }
        return Result(
            props: LeaveWatchProps(
                state: "ready",
                date: today,
                metrics: metrics
            ),
            service: service,
            face: faceData(me: me, dutyDays: dutyDays, leaves: leaves.leaves, today: today)
        )
    }

    /// 컴플리케이션용 값 — 타일 지표에 없는 다음 외출까지 포함한다.
    private static func faceData(
        me: WatchMe, dutyDays: WatchDutyDays, leaves: [WatchLeave], today: String
    ) -> WatchFaceData {
        var discharge: WatchFaceData.Discharge?
        var progress: Double?
        if let dischargeAt = me.user.dischargeAt {
            let days = SeoulDate.diffDays(today, dischargeAt)
            if days >= 0 {
                discharge = WatchFaceData.Discharge(days: days, date: dischargeAt)
            }
            if let enlistedAt = me.user.enlistedAt {
                progress = SeoulDate.serviceProgress(
                    enlistedAt: enlistedAt, dischargeAt: dischargeAt
                )
            }
        }
        return WatchFaceData(
            state: "ready",
            discharge: discharge,
            progress: progress,
            dutyDays: dutyDays.dutyDays,
            nextLeave: nextCountdown(leaves, today: today, outingsOnly: false),
            nextOuting: nextCountdown(leaves, today: today, outingsOnly: true)
        )
    }

    /// 다음 휴가(외출 제외) 또는 다음 외출(외출만) — 같은 counted-status 규칙.
    private static func nextCountdown(
        _ leaves: [WatchLeave], today: String, outingsOnly: Bool
    ) -> WatchFaceData.Countdown? {
        let countedStatuses: Set<String> = ["shared", "requested", "approved", "completed"]
        let counted = leaves.filter { countedStatuses.contains($0.status) }
            .filter { leave in
                let allOuting = !leave.segments.isEmpty &&
                    leave.segments.allSatisfy { $0.category == "outing" }
                return outingsOnly ? allOuting : !allOuting
            }
        let upcoming = counted
            .filter { $0.endDate >= today }
            .sorted { $0.startDate == $1.startDate ? $0.endDate < $1.endDate : $0.startDate < $1.startDate }
            .filter { leave in
                let time = leave.returnTime ?? "21:00"
                let parts = time.split(separator: ":").compactMap { Int($0) }
                let hour = parts.first ?? 21
                let minute = parts.count > 1 ? parts[1] : 0
                return SeoulDate.midnight(of: leave.endDate) +
                    Double((hour * 60 + minute) * 60_000) > Date().timeIntervalSince1970 * 1000
            }
        guard let leave = upcoming.first else { return nil }
        let target = leave.startDate <= today ? leave.endDate : leave.startDate
        return WatchFaceData.Countdown(
            days: max(SeoulDate.diffDays(today, target), 0),
            date: target,
            title: leave.title,
            range: SeoulDate.rangeTiny(leave.startDate, leave.endDate)
        )
    }

    /// client의 nextLeaveCountdown(휴가만)과 같은 규칙 — 외출 제외, 진행 중이면 복귀까지.
    private static func nextLeave(_ leaves: [WatchLeave], today: String) -> WatchMetricValue? {
        let countedStatuses: Set<String> = ["shared", "requested", "approved", "completed"]
        let counted = leaves.filter { countedStatuses.contains($0.status) }
            .filter { !(($0.segments.count > 0) && $0.segments.allSatisfy { $0.category == "outing" }) }
        let upcoming = counted
            .filter { $0.endDate >= today }
            .sorted { $0.startDate == $1.startDate ? $0.endDate < $1.endDate : $0.startDate < $1.startDate }
            .filter { leave in
                let time = leave.returnTime ?? "21:00"
                let parts = time.split(separator: ":").compactMap { Int($0) }
                let hour = parts.first ?? 21
                let minute = parts.count > 1 ? parts[1] : 0
                return SeoulDate.midnight(of: leave.endDate) +
                    Double((hour * 60 + minute) * 60_000) > Date().timeIntervalSince1970 * 1000
            }
        guard let leave = upcoming.first else { return nil }

        let onLeave = leave.startDate <= today
        let days = max(SeoulDate.diffDays(today, onLeave ? leave.endDate : leave.startDate), 0)
        let range = SeoulDate.rangeTiny(leave.startDate, leave.endDate)
        if onLeave {
            return WatchMetricValue(
                value: "복귀 \(days == 0 ? "오늘" : "D-\(days)")", label: "휴가 중",
                caption: "\(leave.title) · \(range)", compact: "복귀 \(days == 0 ? "오늘" : "D-\(days)")",
                gauge: nil
            )
        }
        return WatchMetricValue(
            value: "D-\(days)", label: "다음 휴가",
            caption: "\(leave.title) · \(range)", compact: "휴가 D-\(days)", gauge: nil
        )
    }
}
