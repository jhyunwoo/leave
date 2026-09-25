import Foundation

/// apps/native/src/widgets/payload.ts의 LeaveWidgetProps / MetricValue와 같은 모양.
/// 아이폰 앱이 위젯용으로 만든 14일치 타임라인을 그대로 보내 오므로,
/// 워치는 지금 시각에 맞는 엔트리를 골라 그리기만 하면 된다.
struct WatchMetricValue: Decodable {
    let value: String
    let label: String
    let caption: String?
    let compact: String?
    let gauge: Double?
}

struct LeaveWatchProps: Decodable {
    let state: String
    let date: String
    let metrics: [String: WatchMetricValue]
}

struct WatchTimelineEntry: Decodable {
    let date: String
    let props: LeaveWatchProps
}

/// 전체화면 복무율이 매 프레임 새로 세는 데 필요한 날짜 두 개.
struct WatchServiceDates: Decodable {
    let enlistedAt: String
    let dischargeAt: String
}

/// 셀룰러 단독 모드용. 아이폰이 같이 보내는 API 주소와 세션 토큰.
struct WatchAuth: Decodable {
    let apiUrl: String
    let token: String
}

/// 페이스 컴플리케이션용 값 — 지표 4개 외에 다음 외출도 들어간다.
struct WatchFaceData: Codable {
    struct Countdown: Codable {
        let days: Int
        let title: String?
        let range: String?
    }
    struct Discharge: Codable {
        let days: Int
        let date: String
    }

    let state: String
    let discharge: Discharge?
    let progress: Double?
    let dutyDays: Int?
    let nextLeave: Countdown?
    let nextOuting: Countdown?
}

/// 아이폰 → 워치 applicationContext 한 통.
struct WatchEnvelope: Decodable {
    let timeline: [WatchTimelineEntry]
    let service: WatchServiceDates?
    let face: WatchFaceData?
    let auth: WatchAuth?
}

enum SeoulDate {
    /// "YYYY-MM-DD" (Asia/Seoul 자정 기준 날짜 문자열)
    static func today(at now: Date = Date()) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Seoul")!
        let parts = calendar.dateComponents([.year, .month, .day], from: now)
        return String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
    }

    /// ISODate가 가리키는 서울 자정의 epoch ms — shared의 kstMidnight와 같은 정의.
    static func midnight(of iso: String) -> Double {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Seoul")!
        let parts = iso.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3,
              let at = calendar.date(from: DateComponents(
                  year: parts[0], month: parts[1], day: parts[2]
              ))
        else { return 0 }
        return at.timeIntervalSince1970 * 1000
    }

    /// 두 ISODate 차이(일). b - a.
    static func diffDays(_ a: String, _ b: String) -> Int {
        Int(((midnight(of: b) - midnight(of: a)) / 86_400_000).rounded())
    }

    /// shared serviceProgressAt과 같은 계산 — kstMidnight 양 끝 사이 비율.
    static func serviceProgress(enlistedAt: String, dischargeAt: String, now: Date = Date()) -> Double {
        let start = midnight(of: enlistedAt)
        let end = midnight(of: dischargeAt)
        guard end > start else { return 0 }
        let ratio = (now.timeIntervalSince1970 * 1000 - start) / (end - start)
        return min(max(ratio, 0), 1)
    }

    /// "8/2–8/5", 하루짜리면 "8/2" — shared fmtRangeTiny.
    static func rangeTiny(_ start: String, _ end: String) -> String {
        func tiny(_ iso: String) -> String {
            let p = iso.split(separator: "-").compactMap { Int($0) }
            guard p.count == 3 else { return iso }
            return "\(p[1])/\(p[2])"
        }
        return start == end ? tiny(start) : "\(tiny(start))–\(tiny(end))"
    }

    /// "8/2" 형태의 짧은 표기를 ISO로부터.
    static func tiny(_ iso: String) -> String {
        let p = iso.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return iso }
        return "\(p[1])/\(p[2])"
    }
}

enum LeaveWatchPayload {
    static func currentProps(from entries: [WatchTimelineEntry], at now: Date = Date()) -> LeaveWatchProps? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let current = entries.last { entry in
            guard let at = formatter.date(from: entry.date) else { return false }
            return at <= now
        }
        return (current ?? entries.last)?.props
    }
}
