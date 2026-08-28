/**
 * 치명적 JS 오류를 붙잡아 기록하고, 프로세스가 죽지 않게 막는다.
 *
 * 프로덕션 RN은 오류를 두 갈래로 처리한다.
 * - 렌더 중 오류: 위에 에러 경계가 있으면 onCaughtError(비치명), 없으면
 *   onUncaughtError → handleException(isFatal=true). 이 경우 React는 루트
 *   element를 null로 바꿔 뷰 트리를 통째로 언마운트하고, RN은 RCTFatal을 불러
 *   프로세스를 abort() 시킨다(SIGABRT).
 * - 렌더 밖 오류(이벤트 핸들러·타이머·네이티브 콜백): 에러 경계가 잡을 수 없고
 *   ErrorUtils 전역 핸들러로 isFatal=true가 올라와 마찬가지로 앱이 죽는다.
 *
 * 어느 쪽이든 크래시 리포트(.ips)에는 JS 메시지가 남지 않아 원인을 알 수 없다.
 * 그래서 여기서 오류 내용을 남기고, 전역 핸들러로 온 것은 비치명으로 낮춰
 * 앱이 살아 있는 채로 화면에 오류를 보여준다.
 */

import * as SecureStore from "expo-secure-store";
import { captureException } from "./observability";
import type { ErrorSource, ObservabilityLevel } from "./observability/types";

const STORE_KEY = "leave.lastFatalError";
/** SecureStore는 값이 2KB를 넘으면 경고·실패한다. 스택은 앞부분만 남긴다. */
const MAX_STACK = 1000;
/** 이 시간이 지난 기록은 이번 실행과 무관하다고 보고 띄우지 않는다. */
const RECENT_MS = 10 * 60 * 1000;

export type FatalErrorRecord = {
  message: string;
  stack: string | null;
  componentStack: string | null;
  /** ISO 8601. 언제 났는지 알아야 지난 실행의 기록인지 판단할 수 있다. */
  occurredAt: string;
};

type Listener = (record: FatalErrorRecord) => void;

const listeners = new Set<Listener>();

function clip(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > MAX_STACK ? `${value.slice(0, MAX_STACK)}…` : value;
}

/** 던져진 값이 Error가 아닐 수도 있다(문자열·객체·null). 모두 기록 가능한 꼴로. */
export function toFatalRecord(
  error: unknown,
  componentStack?: string | null,
): FatalErrorRecord {
  const occurredAt = new Date().toISOString();
  try {
    const isError = error instanceof Error;
    const name = isError && error.name ? error.name : null;
    // String(error)는 toString이 던지는 값에서 다시 터질 수 있다.
    const raw = isError ? error.message : String(error);
    return {
      message: name && !raw.startsWith(name) ? `${name}: ${raw}` : raw,
      stack: clip(isError ? error.stack : null),
      componentStack: clip(componentStack),
      occurredAt,
    };
  } catch {
    return {
      message: "설명할 수 없는 오류",
      stack: null,
      componentStack: clip(componentStack),
      occurredAt,
    };
  }
}

/** 다음 실행에서도 원인을 볼 수 있게 남긴다. 저장 실패는 무시한다. */
export function persistFatalError(record: FatalErrorRecord): void {
  try {
    void SecureStore.setItemAsync(STORE_KEY, JSON.stringify(record)).catch(
      () => {},
    );
  } catch {
    // SecureStore를 쓸 수 없는 상황이면 기록만 포기한다. 여기서 던지면
    // 오류 처리 중에 다시 오류가 나 전역 핸들러가 재귀한다.
  }
}

/** 지난 실행이 오류로 끝났다면 그 기록. 한 번 읽으면 지운다. */
export async function takePersistedFatalError(): Promise<FatalErrorRecord | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORE_KEY);
    if (!raw) return null;
    await SecureStore.deleteItemAsync(STORE_KEY);
    const record = JSON.parse(raw) as FatalErrorRecord;
    if (typeof record?.message !== "string") return null;
    const age = Date.now() - Date.parse(record.occurredAt);
    return Number.isFinite(age) && age < RECENT_MS ? record : null;
  } catch {
    return null;
  }
}

/** 사용자가 오류를 확인했으면 지운다. 다음 실행에서 또 띄우지 않기 위해서다. */
export function clearPersistedFatalError(): void {
  try {
    void SecureStore.deleteItemAsync(STORE_KEY).catch(() => {});
  } catch {
    // 지우지 못해도 RECENT_MS가 지나면 어차피 무시된다.
  }
}

/** 화면이 오류를 띄울 수 있도록 구독한다. */
export function subscribeFatalError(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** 오류를 기록하고(저장 + 구독자 통지) 기록 자체를 돌려준다. */
export function reportFatalError(
  error: unknown,
  componentStack?: string | null,
  options: {
    source?: ErrorSource;
    level?: ObservabilityLevel;
    notify?: boolean;
  } = {},
): FatalErrorRecord {
  const record = toFatalRecord(error, componentStack);
  persistFatalError(record);
  captureException(error, {
    source: options.source ?? "global_error_handler",
    level: options.level ?? "fatal",
    handled: false,
    componentStack,
    extra: {
      occurred_at: record.occurredAt,
      normalized_message: record.message,
    },
  });
  if (options.notify !== false) {
    for (const listener of listeners) {
      try {
        listener(record);
      } catch {
        // 통지 실패가 오류 처리를 막지 않는다.
      }
    }
  }
  return record;
}

type ErrorHandler = (error: unknown, isFatal?: boolean) => void;

type ErrorUtilsShape = {
  getGlobalHandler: () => ErrorHandler;
  setGlobalHandler: (handler: ErrorHandler) => void;
};

let installed = false;

/**
 * 렌더 밖에서 난 오류를 받는다. 에러 경계는 이 경로를 잡을 수 없다.
 *
 * 원래 핸들러에 isFatal=false로 넘기면 RN은 오류를 그대로 보고하되 RCTFatal을
 * 부르지 않는다. 앱은 살아 있고, 구독한 화면이 내용을 보여준다.
 */
export function installFatalErrorHandler(): void {
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsShape })
    .ErrorUtils;
  if (installed || !errorUtils) return;
  installed = true;

  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (!isFatal) {
      captureException(error, {
        source: "global_error_handler",
        level: "error",
        handled: true,
      });
      previous(error, isFatal);
      return;
    }
    // 이 안에서 나는 오류는 다시 이 핸들러로 들어와 무한 재귀가 된다.
    try {
      reportFatalError(error, null, {
        source: "global_error_handler",
        level: "fatal",
      });
    } catch {
      // 기록에 실패해도 아래에서 원래 경로로는 보고한다.
    }
    previous(error, false);
  });
}
