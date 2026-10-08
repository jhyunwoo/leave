import Foundation

/// 컴플리케이션이 읽는 값 한 벌. 워치 앱(아이폰 타임라인·셀룰러 단독 갱신
/// 양쪽에서)이 App Group `group.app.leave.mobile`의 "leave.watchFace" 키에
/// 써 두고, 위젯 익스텐션이 타임라인을 만들 때마다 읽는다.
struct LeaveFaceData: Decodable {
    struct Countdown: Decodable {
        let days: Int
        /// 카운트다운 목표 날짜. 있으면 days 대신 엔트리 시각 기준으로 다시 센다 —
        /// 자정이 지나도 저장값을 새로 받기 전에 숫자가 먼저 맞는다.
        let date: String?
        let title: String?
        let range: String?

        func daysLeft(at entryDate: Date) -> Int {
            guard let date else { return days }
            return max(LeaveFaceData.diffDays(
                LeaveFaceData.today(at: entryDate), date
            ), 0)
        }
    }

    struct Discharge: Decodable {
        let days: Int
        let date: String

        func daysLeft(at entryDate: Date) -> Int {
            max(LeaveFaceData.diffDays(
                LeaveFaceData.today(at: entryDate), date
            ), 0)
        }
    }

    let state: String
    let discharge: Discharge?
    /// 저장 시점(아이폰은 그날 자정) 기준 복무율. 엔트리에는 liveProgress(at:)를 쓴다.
    let progress: Double?
    let enlistedAt: String?
    let dutyDays: Int?
    let nextLeave: Countdown?
    let nextOuting: Countdown?

    /// 엔트리 시각의 복무율. shared serviceProgressAt과 같은 계산.
    /// 입대일이 없으면(이 필드 이전의 아이폰 앱이 쓴 값, 전역 후) 저장값 그대로.
    func liveProgress(at entryDate: Date) -> Double? {
        guard let span = serviceSpan else { return progress }
        let ratio = entryDate.timeIntervalSince(span.start) /
            span.end.timeIntervalSince(span.start)
        return min(max(ratio, 0), 1)
    }

    /// 정수 퍼센트가 다음으로 바뀌는 시각. 컴플리케이션이 그 순간에 엔트리를 둔다.
    func nextPercentChange(after date: Date) -> Date? {
        guard let span = serviceSpan, let ratio = liveProgress(at: date) else { return nil }
        let next = (ratio * 100).rounded(.down) + 1
        guard next <= 100 else { return nil }
        // 경계 그 순간은 부동소수 오차로 아직 이전 정수일 수 있어 1초 뒤에 둔다.
        return span.start
            .addingTimeInterval(span.end.timeIntervalSince(span.start) * next / 100)
            .addingTimeInterval(1)
    }

    private var serviceSpan: (start: Date, end: Date)? {
        guard let enlistedAt, let dischargeAt = discharge?.date,
              let start = Self.midnight(of: enlistedAt),
              let end = Self.midnight(of: dischargeAt),
              end > start
        else { return nil }
        return (start, end)
    }

    static func load() -> LeaveFaceData? {
        guard let json = UserDefaults(suiteName: "group.app.leave.mobile")?
            .string(forKey: "leave.watchFace"),
            let data = json.data(using: .utf8)
        else { return nil }
        return try? JSONDecoder().decode(LeaveFaceData.self, from: data)
    }

    // 워치 앱의 SeoulDate와 같은 규칙 — 위젯 타깃은 그 파일을 컴파일하지 않아
    // 여기 한 벌 더 둔다.

    /// "YYYY-MM-DD" (Asia/Seoul 자정 기준 날짜 문자열).
    static func today(at date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Seoul")!
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
    }

    /// ISODate가 가리키는 서울 자정.
    static func midnight(of iso: String) -> Date? {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Seoul")!
        let p = iso.split(separator: "-").compactMap { Int($0) }
        guard p.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: p[0], month: p[1], day: p[2]))
    }

    /// 두 ISODate 차이(일). b - a.
    static func diffDays(_ a: String, _ b: String) -> Int {
        guard let from = midnight(of: a), let to = midnight(of: b) else { return 0 }
        return Int((to.timeIntervalSince(from) / 86400).rounded())
    }
}
