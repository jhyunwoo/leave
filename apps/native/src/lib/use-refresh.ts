/**
 * 당겨서 새로고침 — 화면이 들고 있는 쿼리들을 한 번에 다시 받는다.
 *
 * 사용처: 달력을 제외한 모든 탭(내 휴가·친구·알림·프로필).
 *
 * 달력 탭에는 붙이지 않는다. 그 화면은 FlatList 위에서 휴가 칩을 끌어 옮기는
 * 제스처를 쓰는데, 당겨서 새로고침은 같은 세로 방향 제스처라 서로를 뺏는다.
 *
 * `Promise.allSettled`인 이유는 QueryClient가 `networkMode: "offlineFirst"`이기
 * 때문이다. 오프라인에서 refetch 하나가 대기 상태로 남으면 `Promise.all`은 영영
 * 끝나지 않고 스피너만 남는다. 실패는 화면이 이미 각자 오류 상태로 그리므로
 * 여기서 다시 다루지 않는다.
 */

import { useState } from "react";

type Refetchable = { refetch: () => Promise<unknown> };

export function useRefresh(...results: Refetchable[]): {
  refreshing: boolean;
  onRefresh: () => void;
} {
  const [refreshing, setRefreshing] = useState(false);

  // 메모이제이션하지 않는다. `RefreshControl`은 이 함수의 정체성에 기대지 않고,
  // 감싸면 첫 렌더의 결과 배열을 그대로 붙들어 나중에 늘어난 쿼리를 놓친다.
  const onRefresh = () => {
    setRefreshing(true);
    void Promise.allSettled(results.map((result) => result.refetch())).finally(
      () => setRefreshing(false),
    );
  };

  return { refreshing, onRefresh };
}
