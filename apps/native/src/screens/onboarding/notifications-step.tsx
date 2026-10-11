/**
 * 알림 단계 — 기기 알림을 켤지 묻는다 (네이티브 전용, 웹 온보딩에는 없다).
 *
 * 사용처: `screens/onboarding/index.tsx`.
 *
 * 여기서는 OS 권한만 받는다. 서버는 온보딩 완료 전 토큰 등록을 428로 막으므로,
 * 토큰은 온보딩이 끝난 순간 `usePushTokenSync`가 등록한다. 거절해도 다음으로
 * 넘어간다 — 알림은 진입 조건이 아니다.
 */

import { useState } from "react";
import { requestPushPermission } from "@/lib/notifications";
import { StepNext, StepNote, StepShell, StepSkip } from "./step-shell";

export function NotificationsStep(props: { onNext: () => void }) {
  const [pending, setPending] = useState(false);

  const enable = async () => {
    setPending(true);
    await requestPushPermission();
    setPending(false);
    props.onNext();
  };

  return (
    <StepShell
      title="알림을 받아볼까요?"
      lead="출타 인원이 넘치거나, 친구가 휴가를 올리거나, 복무 기념일이 오면 바로 알려드려요."
    >
      <StepNote>프로필의 알림 설정에서 언제든 끄거나 켤 수 있어요.</StepNote>
      <StepNext
        label="알림 켜기"
        pending={pending}
        onPress={() => void enable()}
        testID="onboarding-notifications-enable"
      />
      <StepSkip
        label="나중에 할게요"
        onPress={props.onNext}
        testID="onboarding-notifications-skip"
      />
    </StepShell>
  );
}
