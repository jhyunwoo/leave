/**
 * 공개 사용자 이름 입력 — 규칙 안내, 중복 확인, 미리보기를 한 덩어리로 묶는다.
 *
 * 사용처: 온보딩의 이름 단계, 1회성 이름 설정 화면, 프로필의 이름 바꾸기.
 *
 * 세 화면이 같은 규칙과 같은 문구를 써야 해서 컴포넌트로 뽑았다. 규칙 자체는
 * `@leave/shared`의 `usernameProblem`이 한 벌로 들고 있고, 여기서는 그것을 언제
 * 보여줄지(입력을 시작한 뒤)와 서버에 언제 물어볼지(디바운스 뒤)만 정한다.
 *
 * 중복 확인 결과는 **조언**이다. 확인과 저장 사이에 남이 같은 이름을 가져갈 수
 * 있으므로 최종 판정은 저장 요청의 409다 — 그래서 "사용 가능"이 떠 있어도
 * 저장을 낙관적으로 처리하지 않는다.
 *
 * `Field`를 쓰지 않고 마크업을 직접 짜는 이유: 안내 문구가 상태에 따라 바뀌는
 * live region이라 `<label>` 안에 들어가면 안 된다. 스크린리더가 라벨을 읽을 때마다
 * "확인 중…"까지 함께 읽는다.
 */

import { useUsernameAvailability } from "@leave/client";
import {
  isCanonicalUsername,
  normalizeUsername,
  usernameProblem,
  USERNAME_MAX_LENGTH,
} from "@leave/shared";
import { useEffect, useId, useState } from "react";

/** 타이핑이 멎고 나서야 서버에 묻는다 — 글자마다 왕복하면 rate limit에 걸린다. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

export interface UsernameDraft {
  /** 사람이 친 원문. 입력창의 값. */
  raw: string;
  setRaw: (value: string) => void;
  /** 저장·조회에 쓰는 정규형. */
  username: string;
  /** 규칙 위반 이유. 없으면 null. */
  problem: string | null;
  /** 규칙을 지켰는가 (중복 여부는 별개). */
  valid: boolean;
  /** 서버가 답한 사용 가능 여부. 아직 모르면 null. */
  available: boolean | null;
  checking: boolean;
}

export function useUsernameDraft(initial = ""): UsernameDraft {
  const [raw, setRaw] = useState(initial);
  const username = normalizeUsername(raw);
  const valid = isCanonicalUsername(username);
  const debounced = useDebounced(valid ? username : "", 350);
  const availability = useUsernameAvailability(debounced);
  const fresh = availability.data?.username === username;
  // 중복 확인이 실패했을 때(오프라인·서버 오류) "확인 중…"에 영원히 머무르지 않는다.
  // 답을 못 받은 것뿐이므로 아무 말도 하지 않고, 판정은 저장 시점의 409에 맡긴다.
  const failed = availability.isError && debounced === username;
  return {
    raw,
    setRaw,
    username,
    problem: raw.trim() === "" ? null : usernameProblem(raw),
    valid,
    available: fresh ? (availability.data?.available ?? null) : null,
    checking: valid && !fresh && !failed,
  };
}

type StatusTone = "error" | "muted" | "ok";

function statusOf(
  draft: UsernameDraft,
  serverError: string | null | undefined,
): { tone: StatusTone; message: string } | null {
  if (serverError) return { tone: "error", message: serverError };
  if (draft.problem) return { tone: "error", message: draft.problem };
  if (!draft.valid) return null;
  if (draft.checking) return { tone: "muted", message: "확인 중…" };
  if (draft.available === false)
    return { tone: "error", message: "이미 사용 중인 이름이에요" };
  if (draft.available === true)
    return { tone: "ok", message: "사용할 수 있어요" };
  return null;
}

export function UsernameField(props: {
  draft: UsernameDraft;
  label?: string;
  /** 저장 시도가 돌려준 오류(중복 등). 규칙 위반 안내보다 우선한다. */
  serverError?: string | null;
  autoFocus?: boolean;
  onSubmit?: () => void;
  testId?: string;
}) {
  const { draft } = props;
  const inputId = useId();
  const statusId = `${inputId}-status`;
  const status = statusOf(draft, props.serverError);

  return (
    <div className="field">
      <label className="field-label" htmlFor={inputId}>
        {props.label ?? "사용자 이름"}
      </label>
      <div className="username-input">
        <span className="username-input-at" aria-hidden="true">
          @
        </span>
        <input
          id={inputId}
          className="input"
          value={draft.raw}
          onChange={(event) => draft.setRaw(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") props.onSubmit?.();
          }}
          placeholder="hyunwoo"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          maxLength={60}
          autoFocus={props.autoFocus}
          aria-invalid={status?.tone === "error"}
          aria-describedby={statusId}
          data-testid={props.testId ?? "username-input"}
        />
      </div>
      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className={
          status?.tone === "error"
            ? "field-error"
            : status?.tone === "ok"
              ? "field-hint username-ok"
              : "field-hint"
        }
      >
        {status?.message ??
          (draft.valid
            ? `프로필 주소 · leave.moveto.kr/u/${draft.username}`
            : `영문·한글·숫자와 마침표(.), 밑줄(_)을 ${USERNAME_MAX_LENGTH}자까지. 이 이름은 공개돼요.`)}
      </p>
    </div>
  );
}
