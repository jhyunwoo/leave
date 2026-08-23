/**
 * 공개 프로필 라우트 — `/u/{username}`.
 *
 * 탭 그룹 **바깥**의 최상위 라우트인 것이 중요하다. 딥링크로 곧장 열릴 때
 * 탭 스택 안의 화면을 목적지로 삼으면, 어느 탭에서 열렸는지에 따라 뒤로가기가
 * 달라지고 탭 상태가 함께 밀린다. 프로필은 어디서 왔든 같은 카드로 열린다.
 *
 * 이 경로가 곧 공유 주소의 경로다(`https://leave.moveto.kr/u/{username}`,
 * `leave://u/{username}`). expo-router가 라우트 트리로 링크를 해석하므로
 * 별도의 링킹 설정 없이 두 형태가 모두 여기로 떨어진다.
 */
import { UserProfileScreen } from "@/screens/user-profile";
export default function UserProfileRoute() {
  return <UserProfileScreen />;
}
