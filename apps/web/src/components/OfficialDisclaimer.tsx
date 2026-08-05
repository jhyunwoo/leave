/**
 * 출타 상태가 보이는 모든 화면에 붙는 고지. 네이티브 앱의
 * `official-disclaimer.tsx`와 문구를 똑같이 유지해야 스토어 심사와
 * 이용약관에서 말하는 서비스 성격이 화면마다 어긋나지 않는다.
 */
const FULL_NOTICE =
  "출타 상태는 이용자가 입력한 계획과 관리자가 정한 참고 기준으로 계산한 추정치입니다. 공식 기록·승인과 무관하며 실제 휴가는 지휘관 승인과 소속 부대 지침을 따라야 합니다.";

export function OfficialDisclaimer(props: { compact?: boolean }) {
  if (props.compact) {
    return (
      <p className="caption text-mute" style={{ textAlign: "center" }}>
        참고용 추정치 · 공식 승인과 무관
      </p>
    );
  }

  return (
    <aside className="card-sage" style={{ padding: "var(--sp-md)" }}>
      <p className="caption strong">비공식 참고용 도구</p>
      <p className="caption text-body" style={{ marginTop: 2 }}>
        {FULL_NOTICE}
      </p>
    </aside>
  );
}
