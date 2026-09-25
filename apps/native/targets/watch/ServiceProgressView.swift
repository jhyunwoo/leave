import SwiftUI

/// 전역일 타일을 탭했을 때 — 복무율이 화면 가득, 소수점 다섯 자리까지 실시간.
/// TimelineView(.animation)는 디스플레이 주사율에 맞춰 프레임마다 그리므로
/// 120Hz 기기에서는 매 프레임 새 퍼센트가 찍힌다.
struct ServiceProgressView: View {
    @EnvironmentObject private var session: WatchSessionManager

    var body: some View {
        TimelineView(.animation) { context in
            let ratio = progress(at: context.date)
            GeometryReader { geo in
                ZStack {
                    // 배경 링
                    Circle()
                        .stroke(Color.orange.opacity(0.2), lineWidth: ringWidth(geo))
                    // 진행 링
                    Circle()
                        .trim(from: 0, to: ratio)
                        .stroke(
                            Color.orange,
                            style: StrokeStyle(lineWidth: ringWidth(geo), lineCap: .round)
                        )
                        .rotationEffect(.degrees(-90))
                    VStack(spacing: 2) {
                        Text("복무율")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(.orange)
                        Text(percentText(ratio))
                            .font(.system(size: percentFontSize(geo), weight: .bold, design: .rounded))
                            .monospacedDigit()
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

    /// 5번째 자리까지 — 67.12345%
    private func percentText(_ ratio: Double) -> String {
        String(format: "%.5f%%", ratio * 100)
    }
}
