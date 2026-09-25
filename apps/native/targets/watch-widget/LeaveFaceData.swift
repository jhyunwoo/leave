import Foundation

/// 컴플리케이션이 읽는 값 한 벌. 워치 앱(아이폰 타임라인·셀룰러 단독 갱신
/// 양쪽에서)이 App Group `group.app.leave.mobile`의 "leave.watchFace" 키에
/// 써 두고, 위젯 익스텐션이 타임라인을 만들 때마다 읽는다.
struct LeaveFaceData: Decodable {
    struct Countdown: Decodable {
        let days: Int
        let title: String?
        let range: String?
    }

    struct Discharge: Decodable {
        let days: Int
        let date: String
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
}
