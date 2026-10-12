/**
 * 내보낼 일정을 받아 ‘리브’ 기기 캘린더에 맞춘다. 화면을 그리지 않는 컴포넌트다.
 *
 * 사용처: app/_layout.tsx의 RootNavigator. `WidgetSync`와 같은 자리다.
 *
 * 언제 맞추는가: 항목 쿼리 결과가 바뀔 때. 그 쿼리는 앱이 포그라운드로 올 때
 * (query-persistence.ts가 focusManager를 AppState에 묶었다)와 휴가·개인·부대 일정을
 * 쓴 뒤(Task 14의 무효화) 다시 받아진다.
 *
 * 한계: 앱이 실행 중일 때만 맞춘다. 관리자가 바꾼 부대 일정은 다음에 앱을 열 때 반영된다.
 */
import { useCalendarFeedItems } from "@leave/client/hooks/calendar-feed";
import { useEffect, useRef, useState } from "react";
import { captureHandledError } from "@/lib/observability";
import {
  hasExportPermission,
  ownCalendarPresent,
  removeExportCalendar,
  writeItems,
} from "./bridge";
import { itemsSignature } from "./convert";
import { getExportPreferences, saveExportPreferences } from "./preferences";
import { useExportPreferences } from "./use-export-preferences";

function ReadyCalendarExportSync() {
  const preferences = useExportPreferences();
  const items = useCalendarFeedItems(preferences.enabled);
  const running = useRef(false);
  // 쓰는 도중 항목이 또 바뀌면 그 effect는 건너뛴다. 쓰기가 끝나면 한 번 더 돌려 놓친 변경을 맞춘다.
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const data = items.data?.items;
    if (!preferences.enabled || !data || running.current) return;
    const signature = itemsSignature(data);
    const unchanged = signature === preferences.signature;

    running.current = true;
    void (async () => {
      try {
        if (!(await hasExportPermission())) {
          // 기기 설정에서 권한을 거둬 갔다. 화면 토글이 꺼짐으로 보이게 한다.
          await saveExportPreferences({
            ...getExportPreferences(),
            enabled: false,
          });
          return;
        }
        if (unchanged) {
          // 일정이 그대로여도 사용자가 `리브` 캘린더를 지웠을 수 있다. 서명을 비워 다음 실행이
          // 다시 만들게 한다. 쓰기가 끝나면 서명이 다시 채워지고, 캘린더가 있으면 아무것도 바꾸지 않아 반복되지 않는다.
          if (!(await ownCalendarPresent(getExportPreferences().calendarId))) {
            await saveExportPreferences({
              ...getExportPreferences(),
              signature: null,
            });
          }
          return;
        }
        const calendarId = await writeItems(
          data,
          getExportPreferences().calendarId,
        );
        // 쓰는 동안 사용자가 껐으면(첫 쓰기라 저장된 id가 없어 끄기가 못 지웠다) 방금 쓴 캘린더를 지운다.
        if (!getExportPreferences().enabled) {
          await removeExportCalendar();
          return;
        }
        await saveExportPreferences({ enabled: true, calendarId, signature });
        // 성공했을 때만 다시 본다. 실패마다 다시 돌면 고장 난 캘린더 제공자에 무한히 쓴다.
        setRetry((count) => count + 1);
      } catch (error) {
        captureHandledError(error, { source: "device_calendar_export" });
      } finally {
        running.current = false;
      }
    })();
  }, [items.data, preferences.enabled, preferences.signature, retry]);

  return null;
}

export function CalendarExportSync({
  authenticated,
}: {
  authenticated: boolean;
}) {
  // 로그아웃 상태에서는 항목 요청이 아예 나가지 않도록 컴포넌트를 갈아 끼운다.
  return authenticated ? <ReadyCalendarExportSync /> : null;
}
