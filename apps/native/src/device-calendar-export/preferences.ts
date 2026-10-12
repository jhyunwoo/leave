/**
 * 안드로이드 기기 캘린더 내보내기 설정 — 이 기기에서만 뜻이 있는 값.
 *
 * 사용처: screens/calendar-export.tsx(켜고 끄기), ./calendar-export-sync.android.tsx(동기화).
 *
 * 서버에 두지 않는 이유: `calendarId`는 이 휴대폰의 캘린더 제공자가 준 번호라 다른
 * 기기에서는 아무 뜻이 없다.
 */
import { exportStorage } from "./storage";

const STORAGE_KEY = "leave.calendar-export.preferences";

export type ExportPreferences = {
  enabled: boolean;
  /** 우리가 만든 `리브` 캘린더. 아직 만들지 않았으면 null. */
  calendarId: string | null;
  /** 마지막으로 쓴 내용의 서명(convert.ts의 itemsSignature). */
  signature: string | null;
};

export const defaultExportPreferences: ExportPreferences = {
  enabled: false,
  calendarId: null,
  signature: null,
};

export function normalizeExportPreferences(value: unknown): ExportPreferences {
  const raw = (value ?? {}) as Partial<
    Record<keyof ExportPreferences, unknown>
  >;
  return {
    enabled: raw.enabled === true,
    calendarId: typeof raw.calendarId === "string" ? raw.calendarId : null,
    signature: typeof raw.signature === "string" ? raw.signature : null,
  };
}

let current: ExportPreferences = defaultExportPreferences;
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeExportPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getExportPreferences(): ExportPreferences {
  return current;
}

export async function loadExportPreferences(): Promise<ExportPreferences> {
  if (loaded) return current;
  loaded = true;
  try {
    const stored = await exportStorage.getItem(STORAGE_KEY);
    if (stored) current = normalizeExportPreferences(JSON.parse(stored));
  } catch {
    // 못 읽으면 꺼진 상태로 간다. 다시 켜면 캘린더를 새로 만든다.
  }
  emit();
  return current;
}

export async function saveExportPreferences(
  next: ExportPreferences,
): Promise<ExportPreferences> {
  current = normalizeExportPreferences(next);
  loaded = true;
  emit();
  try {
    await exportStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // 저장 실패는 이번 실행을 막지 않는다 — 메모리 값으로 계속 동작한다.
  }
  return current;
}
