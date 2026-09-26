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
    let progress: Double?
    let dutyDays: Int?
    let nextLeave: Countdown?
    let nextOuting: Countdown?

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

    /// 두 ISODate 차이(일). b - a.
    static func diffDays(_ a: String, _ b: String) -> Int {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Seoul")!
        func midnight(_ iso: String) -> Date? {
            let p = iso.split(separator: "-").compactMap { Int($0) }
            guard p.count == 3 else { return nil }
            return calendar.date(from: DateComponents(year: p[0], month: p[1], day: p[2]))
        }
        guard let from = midnight(a), let to = midnight(b) else { return 0 }
        return Int((to.timeIntervalSince(from) / 86400).rounded())
    }
}
