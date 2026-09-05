/**
 * 내 정보 라우트 — `/profile/edit`.
 *
 * 프로필 탭 스택 안에 둔다. 탭 밖의 최상위 라우트로 두면 탭바가 사라지고,
 * 이 화면은 딥링크로 곧장 열리는 자리가 아니라 프로필에서 한 단계 들어가는
 * 자리라 그 편이 맞다.
 */
import { ProfileEditScreen } from "@/screens/profile-edit";
export default function ProfileEditRoute() {
  return <ProfileEditScreen />;
}
