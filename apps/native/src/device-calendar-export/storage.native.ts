/**
 * 기기 캘린더 내보내기 설정 저장소 — iOS/Android 구현.
 *
 * 위젯 설정과 데이터베이스를 나눈다. 위젯 설정은 로그아웃해도 남는 기기 취향이지만,
 * 이 값은 로그아웃할 때 `리브` 캘린더와 함께 지운다(./bridge.android.ts).
 */
import { SQLiteStorage } from "expo-sqlite/kv-store";

export interface ExportStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const exportStorage: ExportStorage = new SQLiteStorage(
  "leave-calendar-export.db",
);
