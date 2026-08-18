/**
 * 사용자에게 그대로 보여줄 수 있는 도메인 오류.
 *
 * 사용처: 휴가 규칙을 검사하는 lib(leave-balances, leave-grants)과 그것을 부르는
 * 라우트(routes/leaves.ts, routes/auth.ts).
 *
 * 왜 별도 타입이 필요한가: 라우트가 `catch (error)` 뒤에 `error.message`를 그대로
 * 400 본문에 실으면, 규칙 위반("연가 잔여 3일보다 많이 사용할 수 없습니다")과
 * 인프라 장애(D1 타임아웃, 제약 위반)가 같은 길로 나간다. 후자는 내부 사정을
 * 클라이언트에 흘리는 데다, 500이어야 할 일을 400으로 만들어 재시도·모니터링
 * 판단까지 어긋나게 한다.
 *
 * 규칙: 사용자가 입력을 고쳐 해결할 수 있는 것만 이 타입으로 던진다.
 * 그 밖의 오류는 그대로 위로 올려 보내 index.ts의 onError가 500으로 처리하게 둔다.
 */

export class LeaveRuleError extends Error {
  override readonly name = "LeaveRuleError";
}

/**
 * 사용자에게 보여줄 메시지면 그 문자열을, 아니면 null.
 * null이면 호출한 쪽이 오류를 다시 던져야 한다 — 삼키면 장애가 조용히 묻힌다.
 */
export function leaveRuleMessage(error: unknown): string | null {
  return error instanceof LeaveRuleError ? error.message : null;
}
