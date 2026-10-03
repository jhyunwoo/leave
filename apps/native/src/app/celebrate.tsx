/**
 * 루트 상세 라우트 `/celebrate?kind=…&days=…|rank=…` → 복무 기념일 축하 화면.
 *
 * 주소는 누구나 고쳐 칠 수 있으므로 목록에 없는 기념일이면 알림함으로 돌려보낸다.
 */

import { parseMilestoneParams } from "@leave/shared/milestones";
import { Redirect, useLocalSearchParams } from "expo-router";
import { CelebrateScreen } from "@/screens/celebrate";

export default function CelebrateRoute() {
  const params = useLocalSearchParams<{
    kind?: string;
    days?: string;
    rank?: string;
  }>();
  const milestone = parseMilestoneParams(params);
  if (!milestone) return <Redirect href="/(tabs)/notifications" />;
  return <CelebrateScreen milestone={milestone} />;
}
