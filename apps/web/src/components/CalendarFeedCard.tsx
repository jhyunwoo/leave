import { useState } from "react";
import {
  useCalendarFeed,
  useDisableCalendarFeed,
  useEnableCalendarFeed,
} from "@leave/client";
import {
  calendarFeedWebcalUrl,
  googleCalendarSubscribeUrl,
} from "@leave/shared";
import { ActionIcon } from "./ActionIcon";

/**
 * 리브 일정을 아이폰·구글 캘린더에서 구독하는 링크.
 *
 * 링크는 비밀번호와 같다. 재발급과 끄기는 이미 붙여 둔 캘린더를 끊으므로 한 번 묻는다.
 */
export function CalendarFeedCard() {
  const feed = useCalendarFeed();
  const enable = useEnableCalendarFeed();
  const disable = useDisableCalendarFeed();
  const [copied, setCopied] = useState(false);
  const url = feed.data?.url ?? null;
  const busy = enable.isPending || disable.isPending;

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
  };

  const rotate = () => {
    if (
      window.confirm(
        "새 링크를 만들면 지금 링크로 구독한 캘린더는 더 이상 갱신되지 않아요. 계속할까요?",
      )
    ) {
      setCopied(false);
      enable.mutate();
    }
  };

  const turnOff = () => {
    if (
      window.confirm(
        "링크를 끄면 구독한 캘린더에서 리브 일정이 더 이상 갱신되지 않아요. 끌까요?",
      )
    ) {
      setCopied(false);
      disable.mutate();
    }
  };

  return (
    <section
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: "var(--sp-md)" }}
    >
      <h2 className="display-xs">외부 캘린더</h2>
      <p className="body-sm text-body">
        외출·외박·휴가·개인 일정·부대 일정을 아이폰 캘린더나 구글 캘린더에서 볼
        수 있어요. 삼성 캘린더는 구글 캘린더에 추가하면 함께 보여요.
      </p>
      {feed.isPending ? null : url === null ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => enable.mutate()}
        >
          <ActionIcon name="calendar" />
          구독 링크 만들기
        </button>
      ) : (
        <>
          <div
            style={{ display: "flex", gap: "var(--sp-md)", flexWrap: "wrap" }}
          >
            <a className="btn btn-secondary" href={calendarFeedWebcalUrl(url)}>
              iPhone·Mac 캘린더에 추가
            </a>
            <a
              className="btn btn-secondary"
              href={googleCalendarSubscribeUrl(url)}
              target="_blank"
              rel="noreferrer"
            >
              Google 캘린더에 추가
            </a>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void copy()}
            >
              {copied ? "복사했어요" : "링크 복사"}
            </button>
          </div>
          <p className="body-sm text-body">
            구글 캘린더는 바뀐 일정이 반영되기까지 최대 하루가 걸릴 수 있어요.
            링크를 가진 사람은 누구나 일정을 볼 수 있으니 공유하지 마세요.
          </p>
          <div
            style={{ display: "flex", gap: "var(--sp-md)", flexWrap: "wrap" }}
          >
            <button
              type="button"
              className="btn btn-tertiary"
              disabled={busy}
              onClick={rotate}
            >
              링크 재발급
            </button>
            <button
              type="button"
              className="btn btn-tertiary"
              disabled={busy}
              onClick={turnOff}
            >
              끄기
            </button>
          </div>
        </>
      )}
      {enable.error || disable.error ? (
        <p className="body-sm" role="alert">
          {(enable.error ?? disable.error)?.message}
        </p>
      ) : null}
    </section>
  );
}
