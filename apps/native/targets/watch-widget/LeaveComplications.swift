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

/// "8/2" — ISO 날짜의 짧은 표기. 워치 앱의 SeoulDate.tiny와 같은 규칙.
private func tinyDate(_ iso: String) -> String {
    let p = iso.split(separator: "-").compactMap { Int($0) }
    guard p.count == 3 else { return iso }
    return "\(p[1])/\(p[2])"
}

/// 배터리 컴플리케이션의 사각 레이아웃 — 색 입힌 작은 헤더(라벨·날짜)와 큰 값 두 줄.
/// 예전 세 번째 caption 줄은 좁은 사각 슬롯에서 아래가 잘렸다 — 날짜를 첫 줄로
/// 올리고 줄 수를 둘로 고정한다. 게이지가 있으면 배터리 용량 막대처럼 얇게 단다.
private func countdownView(
    header: String, value: String, accent: Color, gauge: Double? = nil
) -> some View {
    VStack(alignment: .leading, spacing: 2) {
        Text(header)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(accent)
            .lineLimit(1)
        Text(value)
            .font(.title3.weight(.bold))
            .lineLimit(1)
            .minimumScaleFactor(0.5)
        if let gauge {
            Gauge(value: gauge) {
                EmptyView()
            }
            .gaugeStyle(.accessoryLinear)
            .tint(accent)
        }
    }
}

/// 원형 슬롯의 게이지 없는 중앙 배치 — 라벨 위, D-day 아래.
private func circularText(
    label: String, value: String, accent: Color
) -> some View {
    VStack(spacing: 0) {
        Text(label)
            .font(.caption2.weight(.semibold))
            .foregroundStyle(accent)
        Text(value)
            .font(.title3.weight(.bold))
            .minimumScaleFactor(0.45)
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
                    if let p = entry.face?.progress {
                        // 배터리 원형처럼 링 안에 값을 얹는다 — 링이 곧 레이아웃이라
                        // 텍스트가 링 아래로 밀려 잘리는 일이 없다.
                        Gauge(value: p) {
                            Text("전역")
                                .font(.caption2.weight(.semibold))
                        } currentValueLabel: {
                            Text("D-\(d.daysLeft(at: entry.date))")
                                .font(.title3.weight(.bold))
                                .minimumScaleFactor(0.45)
                        }
                        .gaugeStyle(.accessoryCircular)
                        .tint(.orange)
                    } else {
                        circularText(
                            label: "전역",
                            value: "D-\(d.daysLeft(at: entry.date))",
                            accent: .orange
                        )
                    }
                }
            case .accessoryCorner:
                Text("D-\(d.daysLeft(at: entry.date))")
                    .font(.headline.weight(.bold))
                    .minimumScaleFactor(0.6)
                    .widgetLabel {
                        // 배터리 코너처럼 라벨 텍스트와 함께 베젤을 따라 도는 용량 아치.
                        if let p = entry.face?.progress {
                            Gauge(value: p) {
                                Text("전역")
                            }
                            .gaugeStyle(.accessoryCircularCapacity)
                            .tint(.orange)
                        } else {
                            Text("전역")
                        }
                    }
            case .accessoryInline:
                Text("전역 D-\(d.daysLeft(at: entry.date)) · \(tinyDate(d.date))")
            default:
                countdownView(
                    header: inlineText(["전역", d.date]),
                    value: "D-\(d.daysLeft(at: entry.date))",
                    accent: .orange,
                    gauge: entry.face?.progress
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
                    circularText(
                        label: "휴가",
                        value: "D-\(leave.daysLeft(at: entry.date))",
                        accent: .purple
                    )
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
                    header: inlineText(["다음 휴가", leave.range, leave.title]),
                    value: "D-\(leave.daysLeft(at: entry.date))",
                    accent: .purple
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
                    circularText(
                        label: "외출",
                        value: "D-\(outing.daysLeft(at: entry.date))",
                        accent: .green
                    )
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
                    header: inlineText(["다음 외출", outing.range, outing.title]),
                    value: "D-\(outing.daysLeft(at: entry.date))",
                    accent: .green
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
