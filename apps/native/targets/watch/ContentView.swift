import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var session: WatchSessionManager
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if let props = session.props, props.state == "ready" {
                metricsView(props: props)
            } else {
                noticeView
            }
        }
        // 단독 모드: 화면이 켜질 때·포그라운드로 돌아올 때 API를 직접 친다.
        .task { await session.refreshStandalone() }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                Task { await session.refreshStandalone() }
            }
        }
    }

    // MARK: - 지표

    @ViewBuilder
    private func metricsView(props: LeaveWatchProps) -> some View {
        ScrollView {
            VStack(spacing: 8) {
                // 전역일 타일을 누르면 복무율이 화면 가득 실시간으로 차오른다.
                if session.service != nil {
                    NavigationLink {
                        ServiceProgressView()
                    } label: {
                        tileContent(
                            metric: props.metrics["discharge"], accent: .orange
                        )
                    }
                    .buttonStyle(.plain)
                } else {
                    metricTile(metric: props.metrics["discharge"], accent: .orange)
                }
                metricTile(metric: props.metrics["dutyDays"], accent: .green)
                metricTile(
                    metric: props.metrics["progress"],
                    accent: .blue,
                    gauge: props.metrics["progress"]?.gauge
                )
                metricTile(metric: props.metrics["nextLeave"], accent: .purple)
            }
            .padding(.horizontal, 2)
        }
    }

    private func tileContent(metric: WatchMetricValue?, accent: Color) -> some View {
        tileBody(metric: metric, accent: accent, gauge: nil)
    }

    private func metricTile(
        metric: WatchMetricValue?,
        accent: Color,
        gauge: Double? = nil
    ) -> some View {
        tileBody(metric: metric, accent: accent, gauge: gauge)
    }

    private func tileBody(
        metric: WatchMetricValue?,
        accent: Color,
        gauge: Double?
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Text(metric?.label ?? "")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(accent)
                Spacer()
                if let gauge {
                    gaugeRing(gauge, accent: accent)
                }
            }
            Text(metric?.compact ?? metric?.value ?? "—")
                .font(.title2.weight(.bold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            if let caption = metric?.caption {
                Text(caption)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 8)
        .padding(.horizontal, 10)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.gray.opacity(0.18))
        )
    }

    private func gaugeRing(_ fraction: Double, accent: Color) -> some View {
        ZStack {
            Circle()
                .stroke(accent.opacity(0.25), lineWidth: 3)
            Circle()
                .trim(from: 0, to: max(0, min(fraction, 1)))
                .stroke(accent, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Text("\(Int(fraction * 100))%")
                .font(.system(size: 7).weight(.bold))
                .foregroundStyle(accent)
        }
        .frame(width: 20, height: 20)
    }

    // MARK: - 안내 상태

    @ViewBuilder
    private var noticeView: some View {
        let state = session.props?.state
        VStack(spacing: 6) {
            Image(systemName: state == "signedOut" ? "iphone.slash" : "iphone.and.arrow.forward")
                .font(.title2)
                .foregroundStyle(.secondary)
            Text(noticeText(state))
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }

    private func noticeText(_ state: String?) -> String {
        switch state {
        case "signedOut":
            return "아이폰 앱에 로그인하면 지표가 표시돼요"
        case "needsOnboarding":
            return "아이폰 앱에서 복무 정보를 입력하면 지표가 표시돼요"
        default:
            return session.hasToken
                ? "네트워크를 확인해주세요"
                : "아이폰 앱을 한 번 열면 지표를 가져와요"
        }
    }
}
