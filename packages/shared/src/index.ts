/**
 * `@leave/shared` — 서버·웹·앱·관리자가 모두 공유하는 순수 도메인 규칙.
 *
 * 여기 있는 코드는 어떤 플랫폼 API도 쓰지 않는다(fetch·localStorage·React 없음).
 * 그래서 Cloudflare Workers 안에서도, 브라우저에서도, React Native에서도 같은
 * 결과를 낸다. "휴가 며칠이 남았는가", "이 날 몇 명이 나가는가" 같은 판단은
 * 한 곳에서만 정의돼야 클라이언트와 서버의 답이 갈리지 않는다.
 *
 * 구성:
 *  - dates/calendar : 날짜 계산과 한국어 표기
 *  - rank           : 군 종류별 복무 기간과 자동 진급
 *  - onboarding     : 가입 직후 단계 구성과 히어로 일러스트 기하
 *  - leave          : 휴가 종류·상태·구간의 정의
 *  - leave-title    : 자동 제목과 사람이 지은 이름의 구분
 *  - leave-merge    : 붙어 있는 휴가를 한 건으로 합치는 규칙
 *  - leave-grants   : 적립분(언제 얼마가 부여됐고 언제 만료되는가)
 *  - regular-overnight : 주기 기반 정기외박
 *  - overage/availability : 하루 출타 인원 집계와 대안 날짜 추천
 *  - username       : 공개 사용자 이름(@아이디)의 정규화·검증 규칙
 *  - schemas        : 모든 API 입력의 zod 스키마(서버 검증 = 앱 검증)
 *  - http           : API 주소 해석과 응답 unwrap
 */

export * from "./dates";
export * from "./rank";
export * from "./overage";
export * from "./schemas";
export * from "./calendar";
export * from "./holidays";
export * from "./http";
export * from "./leave";
export * from "./leave-draft";
export * from "./leave-title";
export * from "./leave-merge";
export * from "./leave-grants";
export * from "./onboarding";
export * from "./regular-overnight";
export * from "./regular-overnight-guidance";
export * from "./availability";
export * from "./friends";
export * from "./username";
