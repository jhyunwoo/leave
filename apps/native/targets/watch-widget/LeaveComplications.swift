import SwiftUI
import WidgetKit

/// 페이스 컴플리케이션 엔트리 — 저장된 LeaveFaceData를 그대로 옮긴다.
struct LeaveFaceEntry: TimelineEntry {
    let date: Date
    let face: LeaveFaceData?
}

/// App Group에 저장된 최신 값을 읽어 현재 시각 엔트리 하나를 만든다.
/// 워치 앱이 새 값을 쓸 때 WidgetCenter.reloadTimelines을 부르므로
/// 장시간 정책만 두면 된다 — 자정이 지나면 D-day도 다시 세야 해서
/// 다음 자정까지의 만료 엔트리도 같이 둔다.
struct LeaveFaceProvider: TimelineProvider {
    func placeholder(in _: Context) -> LeaveFaceEntry {
        LeaveFaceEntry(date: Date(), face: nil)
    }

    func getSnapshot(in _: Context, completion: @escaping (LeaveFaceEntry) -> Void) {
        completion(LeaveFaceEntry(date: Date(), face: LeaveFaceData.load()))
    }

    func getTimeline(
        in _: Context,
        completion: @escaping (Timeline<LeaveFaceEntry>) -> Void
    ) {
        var entries = [LeaveFaceEntry(date: Date(), face: LeaveFaceData.load())]
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "Asia/Seoul") ?? .current
        if let midnight = calendar.nextDate(
            after: Date(), matching: DateComponents(hour: 0), matchingPolicy: .nextTime
        ) {
            entries.append(LeaveFaceEntry(date: midnight, face: LeaveFaceData.load()))
        }
        completion(Timeline(entries: entries, policy: .after(midnightSafe(in: calendar))))
    }

    private func midnightSafe(in calendar: Calendar) -> Date {
        calendar.nextDate(
            after: Date(), matching: DateComponents(hour: 1), matchingPolicy: .nextTime
        ) ?? Date().addingTimeInterval(3600)
    }
}

// MARK: - 공통 뷰

/// 큰 숫자 + 위아래 한 줄씩. 원형/코너/사각 전부 이 조각을 변형해서 쓴다.
private func countdownView(
    label: String, value: String, caption: String?, accent: Color
) -> some View {
    VStack(alignment: .leading, spacing: 0) {
        Text(label)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(accent)
        Text(value)
            .font(.headline.weight(.bold))
            .lineLimit(1)
            .minimumScaleFactor(0.6)
        if let caption {
            Text(caption)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
    }
}

private func inlineText(_ parts: [String?]) -> String {
    parts.compactMap { $0 }.joined(separator: " · ")
}

// MARK: - 전역 D-Day

struct DischargeComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: LeaveFaceEntry

    var body: some View {
        if let d = entry.face?.discharge {
            switch family {
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    VStack(spacing: 0) {
                        if let p = entry.face?.progress {
                            Gauge(value: p) {
                                EmptyView()
                            }
                            .gaugeStyle(.accessoryCircular)
                            .tint(.orange)
                        }
                        Text("D-\(d.daysLeft(at: entry.date))")
                            .font(.title3.weight(.bold))
                            .minimumScaleFactor(0.45)
                    }
                }
            case .accessoryCorner:
                Text("D-\(d.daysLeft(at: entry.date))")
                    .font(.headline.weight(.bold))
                    .minimumScaleFactor(0.6)
                    .widgetLabel { Text("전역") }
            case .accessoryInline:
                Text("전역 D-\(d.daysLeft(at: entry.date))")
            default:
                countdownView(
                    label: "전역", value: "D-\(d.daysLeft(at: entry.date))", caption: d.date,
                    accent: .orange
                )
            }
        } else {
            Text("—")
        }
    }
}

struct DischargeComplication: Widget {
    let kind = "LeaveDischarge"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LeaveFaceProvider()) { entry in
            DischargeComplicationView(entry: entry)
                .containerBackground(for: .widget) {}
        }
        .configurationDisplayName("전역")
        .description("전역까지 남은 날짜")
        .supportedFamilies([
            .accessoryCircular, .accessoryRectangular,
            .accessoryCorner, .accessoryInline,
        ])
    }
}

// MARK: - 다음 휴가 D-Day

struct NextLeaveComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: LeaveFaceEntry

    var body: some View {
        if let leave = entry.face?.nextLeave {
            switch family {
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    VStack(spacing: 0) {
                        Text("휴가")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.purple)
                        Text("D-\(leave.daysLeft(at: entry.date))")
                            .font(.title3.weight(.bold))
                            .minimumScaleFactor(0.45)
                    }
                }
            case .accessoryCorner:
                Text("D-\(leave.daysLeft(at: entry.date))")
                    .font(.headline.weight(.bold))
                    .minimumScaleFactor(0.6)
                    .widgetLabel { Text("다음 휴가") }
            case .accessoryInline:
                Text(inlineText(["휴가 D-\(leave.daysLeft(at: entry.date))", leave.range]))
            default:
                countdownView(
                    label: "다음 휴가", value: "D-\(leave.daysLeft(at: entry.date))",
                    caption: leave.title ?? leave.range, accent: .purple
                )
            }
        } else {
            Text("—")
        }
    }
}

struct NextLeaveComplication: Widget {
    let kind = "LeaveNextLeave"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LeaveFaceProvider()) { entry in
            NextLeaveComplicationView(entry: entry)
                .containerBackground(for: .widget) {}
        }
        .configurationDisplayName("다음 휴가")
        .description("다음 휴가까지 남은 날짜")
        .supportedFamilies([
            .accessoryCircular, .accessoryRectangular,
            .accessoryCorner, .accessoryInline,
        ])
    }
}

// MARK: - 다음 외출 D-Day

struct NextOutingComplicationView: View {
    @Environment(\.widgetFamily) private var family
    let entry: LeaveFaceEntry

    var body: some View {
        if let outing = entry.face?.nextOuting {
            switch family {
            case .accessoryCircular:
                ZStack {
                    AccessoryWidgetBackground()
                    VStack(spacing: 0) {
                        Text("외출")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.green)
                        Text("D-\(outing.daysLeft(at: entry.date))")
                            .font(.title3.weight(.bold))
                            .minimumScaleFactor(0.45)
                    }
                }
            case .accessoryCorner:
                Text("D-\(outing.daysLeft(at: entry.date))")
                    .font(.headline.weight(.bold))
                    .minimumScaleFactor(0.6)
                    .widgetLabel { Text("다음 외출") }
            case .accessoryInline:
                Text(inlineText(["외출 D-\(outing.daysLeft(at: entry.date))", outing.range]))
            default:
                countdownView(
                    label: "다음 외출", value: "D-\(outing.daysLeft(at: entry.date))",
                    caption: outing.title ?? outing.range, accent: .green
                )
            }
        } else {
            Text("—")
        }
    }
}

struct NextOutingComplication: Widget {
    let kind = "LeaveNextOuting"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: LeaveFaceProvider()) { entry in
            NextOutingComplicationView(entry: entry)
                .containerBackground(for: .widget) {}
        }
        .configurationDisplayName("다음 외출")
        .description("다음 외출까지 남은 날짜")
        .supportedFamilies([
            .accessoryCircular, .accessoryRectangular,
            .accessoryCorner, .accessoryInline,
        ])
    }
}

@main
struct LeaveComplications: WidgetBundle {
    var body: some Widget {
        DischargeComplication()
        NextLeaveComplication()
        NextOutingComplication()
    }
}
