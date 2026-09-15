/**
 * 발급된 초대코드와 초대 링크를 함께 보여주고 복사하게 한다.
 *
 * 사용처: 그룹 참여 화면(생성 직후), 그룹 관리 화면(재발급 직후).
 *
 * 원문은 서버에 해시로만 남으므로 이 화면을 떠나면 다시 볼 수 없다. 그래서
 * "언젠가 필요할 때 다시 와서 본다"가 불가능하고, 지금 복사하는 것이 주 행동이다.
 *
 * 링크와 코드를 둘 다 준다. 링크는 앱이 깔려 있으면 앱으로, 아니면 웹으로
 * 떨어져 대부분의 경우 이쪽이 빠르다. 코드는 링크를 열 수 없는 자리(구두 전달,
 * 링크가 잘리는 메신저)를 위해 남긴다.
 */

import { ActionIcon } from "./ActionIcon";

import { fmtDateTimeFull, inviteLink } from "@leave/shared";
import { useState } from "react";
import type { IssuedUnitInvite } from "@leave/client";

const CODE_STYLE = {
  padding: "var(--sp-md)",
  borderRadius: "var(--r-md)",
  background: "var(--canvas-soft)",
  wordBreak: "break-all",
  fontWeight: 600,
} as const;

export function InviteShare(props: { invite: IssuedUnitInvite }) {
  const link = inviteLink(props.invite.code);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  const copy = async (what: "link" | "code", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      // 클립보드가 막힌 브라우저·컨텍스트가 있다. 코드는 화면에 그대로 보이므로
      // 손으로 옮겨 적을 수 있다 — 실패를 오류로 키우지 않는다.
      setCopied(null);
    }
  };

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: "var(--sp-md)" }}
    >
      <code aria-label="초대 링크" style={CODE_STYLE}>
        {link}
      </code>
      <code aria-label="발급된 초대코드" style={CODE_STYLE}>
        {props.invite.code}
      </code>
      <div style={{ display: "flex", gap: "var(--sp-sm)", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void copy("link", link)}
        >
          <ActionIcon name={copied === "link" ? "check" : "copy"} />
          {copied === "link" ? "링크 복사됨" : "초대 링크 복사"}
        </button>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void copy("code", props.invite.code)}
        >
          <ActionIcon name={copied === "code" ? "check" : "copy"} />
          {copied === "code" ? "코드 복사됨" : "코드만 복사"}
        </button>
      </div>
      <p className="caption text-body" aria-live="polite">
        {fmtDateTimeFull(props.invite.expiresAt)}까지 · 최대{" "}
        {props.invite.maxUses}회
      </p>
    </div>
  );
}
