import Foundation

/**
 * WatchSource로 지금 시각의 지표를 센다 — 아이폰이 보낸 재료든 셀룰러로 받은 재료든
 * 같은 길을 지난다. 네트워크가 없어도 날짜만 넘어가면 숫자가 따라 바뀐다.
 *
 * 세는 규칙은 아이폰 위젯 타임라인(apps/native/src/widgets/payload.ts)과 같다.
 */
enum WatchMetrics {
    private static let dayMs: Double = 86_400_000

    static func props(_ source: WatchSource, at now: Date = Date()) -> LeaveWatchProps {
        let today = SeoulDate.today(at: now)
        var metrics: [String: WatchMetricValue] = [:]
        if let dischargeAt = source.dischargeAt {
            let days = SeoulDate.diffDays(today, dischargeAt)
            if days >= 0 {
                metrics["discharge"] = WatchMetricValue(
                    value: dday(days), label: "전역",
                    caption: dischargeAt, compact: "전역 \(dday(days))", gauge: nil
                )
            }
            if let enlistedAt = source.enlistedAt {
                let ratio = SeoulDate.serviceProgress(
                    enlistedAt: enlistedAt, dischargeAt: dischargeAt, now: now
                )
                let percent = Int(ratio * 100)
                metrics["progress"] = WatchMetricValue(
                    value: "\(percent)%", label: "복무율",
                    caption: "\(enlistedAt) 입대", compact: "복무 \(percent)%",
                    gauge: ratio
                )
            }
        }
        if let duty = source.dutyDays {
            let days = dutyDays(duty, on: today)
            metrics["dutyDays"] = WatchMetricValue(
                value: "\(days)일", label: "일과",
                caption: "남은 일과일", compact: "일과 \(days)일", gauge: nil
            )
        }
        if let leave = nextLeave(source.leaves, at: now, outing: false) {
            metrics["nextLeave"] = leaveMetric(leave, today: today, outing: false)
        }
        if let outing = nextLeave(source.leaves, at: now, outing: true) {
            metrics["nextOuting"] = leaveMetric(outing, today: today, outing: true)
        }
        return LeaveWatchProps(state: "ready", date: today, metrics: metrics)
    }

    /// 컴플리케이션용 값 — 타일과 같은 재료, 같은 시각으로 센다.
    static func face(_ source: WatchSource, at now: Date = Date()) -> WatchFaceData {
        let today = SeoulDate.today(at: now)
        var discharge: WatchFaceData.Discharge?
        var progress: Double?
        if let dischargeAt = source.dischargeAt {
            let days = SeoulDate.diffDays(today, dischargeAt)
            if days >= 0 {
                discharge = WatchFaceData.Discharge(days: days, date: dischargeAt)
            }
            if let enlistedAt = source.enlistedAt {
                progress = SeoulDate.serviceProgress(
                    enlistedAt: enlistedAt, dischargeAt: dischargeAt, now: now
                )
            }
        }
        return WatchFaceData(
            state: "ready",
            discharge: discharge,
            progress: progress,
            enlistedAt: source.enlistedAt,
            dutyDays: source.dutyDays.map { dutyDays($0, on: today) },
            nextLeave: countdown(nextLeave(source.leaves, at: now, outing: false), today: today),
            nextOuting: countdown(nextLeave(source.leaves, at: now, outing: true), today: today)
        )
    }

    /// 지표가 다음으로 바뀌는 순간 — 서울 자정이나, 그보다 이른 휴가 복귀 시각.
    static func nextChange(_ source: WatchSource, after now: Date = Date()) -> Date {
        let nowMs = now.timeIntervalSince1970 * 1000
        let midnight = SeoulDate.midnight(of: SeoulDate.today(at: now)) + dayMs
        let returns = source.leaves.map(returnAt).filter { $0 > nowMs }
        let next = ([midnight] + returns).min()!
        return Date(timeIntervalSince1970: next / 1000)
    }

    /// payload.ts `dutyDays`와 같은 뺄셈 — 기준일의 값에서 그 뒤로 보낸 일과일을 뺀다.
    private static func dutyDays(_ duty: WatchSource.DutyDays, on today: String) -> Int {
        let spent = duty.dates.filter { $0 >= duty.from && $0 < today }.count
        return max(duty.days - spent, 0)
    }

    /// D-0은 "0일 남았다"로 읽힌다 — payload.ts `dday`처럼 그 하루는 이름을 따로 준다.
    private static func dday(_ days: Int) -> String {
        days == 0 ? "D-DAY" : "D-\(days)"
    }

    private static func returnAt(_ leave: WatchSource.Leave) -> Double {
        let parts = (leave.returnTime ?? "21:00").split(separator: ":").compactMap { Int($0) }
        let hour = parts.first ?? 21
        let minute = parts.count > 1 ? parts[1] : 0
        return SeoulDate.midnight(of: leave.endDate) + Double((hour * 60 + minute) * 60_000)
    }

    /// client의 nextLeaveCountdowns와 같은 규칙: 휴가(외출 제외) 또는 외출만,
    /// 복귀 시각이 지나지 않은 것 중 가장 이른 것.
    private static func nextLeave(
        _ leaves: [WatchSource.Leave], at now: Date, outing: Bool
    ) -> WatchSource.Leave? {
        let today = SeoulDate.today(at: now)
        let nowMs = now.timeIntervalSince1970 * 1000
        return leaves
            .filter { $0.outing == outing && $0.endDate >= today && returnAt($0) > nowMs }
            .sorted { $0.startDate == $1.startDate ? $0.endDate < $1.endDate : $0.startDate < $1.startDate }
            .first
    }

    private static func leaveMetric(
        _ leave: WatchSource.Leave, today: String, outing: Bool
    ) -> WatchMetricValue {
        let noun = outing ? "외출" : "휴가"
        let onLeave = leave.startDate <= today
        let days = max(SeoulDate.diffDays(today, onLeave ? leave.endDate : leave.startDate), 0)
        let range = SeoulDate.rangeTiny(leave.startDate, leave.endDate)
        if onLeave {
            let value = "복귀 \(days == 0 ? "오늘" : "D-\(days)")"
            return WatchMetricValue(
                value: value, label: "\(noun) 중",
                caption: "\(leave.title) · \(range)", compact: value, gauge: nil
            )
        }
        return WatchMetricValue(
            value: dday(days), label: "다음 \(noun)",
            caption: "\(leave.title) · \(range)", compact: "\(noun) \(dday(days))", gauge: nil
        )
    }

    private static func countdown(_ leave: WatchSource.Leave?, today: String) -> WatchFaceData.Countdown? {
        guard let leave else { return nil }
        // 진행 중이면 복귀일, 아니면 시작일이 목표 날짜다.
        let target = leave.startDate <= today ? leave.endDate : leave.startDate
        return WatchFaceData.Countdown(
            days: max(SeoulDate.diffDays(today, target), 0),
            date: target,
            title: leave.title,
            range: SeoulDate.rangeTiny(leave.startDate, leave.endDate)
        )
    }
}
