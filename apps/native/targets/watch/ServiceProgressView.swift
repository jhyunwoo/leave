import SwiftUI

/// 복무율 타일을 탭했을 때: 복무율이 화면 가득, 소수점 열 자리까지 실시간.
/// TimelineView(.animation)는 디스플레이 주사율에 맞춰 프레임마다 그리므로
/// 120Hz 기기에서는 매 프레임 새 퍼센트가 찍힌다. 18개월 복무면 여덟째 자리부터
/// 아래는 한 프레임 사이에도 바뀐다.
struct ServiceProgressView: View {
    @EnvironmentObject private var session: WatchSessionManager

    var body: some View {
        TimelineView(.animation) { context in
            let ratio = progress(at: context.date)
            let parts = percentParts(ratio)
            GeometryReader { geo in
                ZStack {
                    // 배경 링
                    Circle()
                        .stroke(Color.blue.opacity(0.2), lineWidth: ringWidth(geo))
                    // 진행 링
                    Circle()
                        .trim(from: 0, to: ratio)
                        .stroke(
                            Color.blue,
                            style: StrokeStyle(lineWidth: ringWidth(geo), lineCap: .round)
                        )
                        .rotationEffect(.degrees(-90))
                    VStack(spacing: 0) {
                        Text("복무율")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.blue)
                        Text(parts.head)
                            .font(.system(size: percentFontSize(geo), weight: .bold, design: .rounded))
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.4)
                        Text("\(parts.tail)%")
                            .font(.system(size: tailFontSize(geo), weight: .semibold, design: .rounded))
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.4)
                        if let service = session.service {
                            Text("전역 \(SeoulDate.tiny(service.dischargeAt))")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
                .frame(width: geo.size.width, height: geo.size.height)
            }
        }
        .navigationTitle {
            EmptyView()
        }
    }

    private func progress(at now: Date) -> Double {
        guard let service = session.service else { return 0 }
        return SeoulDate.serviceProgress(
            enlistedAt: service.enlistedAt,
            dischargeAt: service.dischargeAt,
            now: now
        )
    }

    private func ringWidth(_ geo: GeometryProxy) -> CGFloat {
        min(geo.size.width, geo.size.height) * 0.085
    }

    private func percentFontSize(_ geo: GeometryProxy) -> CGFloat {
        min(geo.size.width, geo.size.height) * 0.16
    }

    /// 열 자리 숫자는 링 안 한 줄에 들어가지 않는다. 아이폰 히어로(splitPercentText)처럼
    /// 소수 둘째 자리까지 크게, 나머지 여덟 자리는 아래 줄에 작게(67.12 / 34567890%).
    private func percentParts(_ ratio: Double) -> (head: String, tail: String) {
        let text = String(format: "%.10f", ratio * 100)
        guard let dot = text.firstIndex(of: ".") else { return (text, "") }
        let cut = text.index(dot, offsetBy: 3)
        return (String(text[..<cut]), String(text[cut...]))
    }

    private func tailFontSize(_ geo: GeometryProxy) -> CGFloat {
        min(geo.size.width, geo.size.height) * 0.09
    }
}
