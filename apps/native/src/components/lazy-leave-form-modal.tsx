/**
 * 휴가 등록·수정 폼의 지연 평가 경계.
 *
 * 사용처: 달력 화면, 내 휴가 화면. 둘 다 `{열렸을 때만 && <…/>}` 로 감싸 두므로
 * 이 경계는 실제로 폼을 열기 전까지 아무것도 평가하지 않는다.
 *
 * ## 왜 필요한가
 *
 * `leave-form-modal` → `@leave/client`의 `use-leave-form` → `@leave/shared`의
 * zod 스키마로 이어지는 사슬이 있다. zod는 프로덕션 번들에서 385KB(전체의 10.6%,
 * 79개 모듈)이고, 첫 화면까지 평가되는 796KB 중 385KB가 이 zod다. 그런데 달력
 * 탭은 입력 검증을 한 줄도 하지 않는다 — 검증은 폼을 열어야 비로소 필요하다.
 *
 * 정적 import는 "화면에 그리지 않아도 모듈은 평가한다". 그래서 조건부 렌더만으로는
 * 이 비용이 사라지지 않고, 평가 자체를 미루는 경계가 있어야 한다.
 *
 * Metro는 네이티브에서 `import()`를 같은 번들 안의 지연 require로 바꾼다. 즉
 * 번들이 쪼개지는 게 아니라 **평가 시점만** 폼을 처음 여는 순간으로 옮겨간다.
 * (Expo Router가 지원하지 않는 별도 번들 분할을 흉내 내지 않는다.)
 */

import { lazy, Suspense, type ComponentProps } from "react";
import type { LeaveFormModal } from "./leave-form-modal";

const LeaveFormModalLazy = lazy(async () => ({
  default: (await import("./leave-form-modal")).LeaveFormModal,
}));

export function LazyLeaveFormModal(
  props: ComponentProps<typeof LeaveFormModal>,
) {
  // 폼은 모달이라 한 틱 동안 아무것도 없는 게 맞다. 자리 표시자를 두면 시트가
  // 올라오기 전에 빈 판이 깜빡인다.
  return (
    <Suspense fallback={null}>
      <LeaveFormModalLazy {...props} />
    </Suspense>
  );
}
