/**
 * 초대 링크 착지점 — `/invite/{code}`.
 *
 * `u/[username]`과 같은 이유로 탭 그룹 **바깥**의 최상위 라우트다. 딥링크로 곧장
 * 열릴 때 탭 스택 안의 화면을 목적지로 삼으면 어느 탭에서 열렸는지에 따라
 * 뒤로가기가 달라진다.
 *
 * 이 경로가 곧 공유 주소의 경로다(`https://leave.moveto.kr/invite/{code}`,
 * `leave://invite/{code}`). expo-router가 라우트 트리로 링크를 해석하므로
 * 별도의 링킹 설정 없이 두 형태가 모두 여기로 떨어진다.
 */
import { InviteJoinScreen } from "@/screens/invite-join";
export default function InviteJoinRoute() {
  return <InviteJoinScreen />;
}
