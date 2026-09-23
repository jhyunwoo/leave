// 메일 클라이언트는 <style>과 웹폰트를 대부분 버린다. 표 레이아웃과 인라인 스타일만 쓰고,
// 색은 apps/web/src/styles/global.css의 디자인 토큰 값을 그대로 옮겨 온다.
const INK = "#0e0f0c";
const INK_DEEP = "#163300";
const BODY = "#454745";
const MUTE = "#666864";
const MUTED_SOFT = "#9a9c99";
const PRIMARY_PALE = "#e2f6d5";
const PRIMARY = "#9fe870";
const SURFACE = "#f3f5f1";
const HAIRLINE = "#edf0eb";
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Pretendard', 'Malgun Gothic', 'Segoe UI', sans-serif";
// 메일에서는 스크립트가 돌지 않아 클립보드 복사 버튼을 만들 수 없다. 대신 코드 칸을
// user-select: all로 두어 한 번 탭(클릭)하면 6자리 전체가 선택되게 한다.
// 버튼은 이미지·CSS 버튼이 아니라 배경색을 칠한 표 칸 안의 링크다. Outlook까지 모양이 유지된다.
// 이미지가 막힌 클라이언트에서도 alt와 배경색으로 자리가 무너지지 않게 크기를 고정한다.
const ICON_URL = "https://leave.moveto.kr/icon-192.png";

export function verificationEmail(code: string, link: string) {
  const text = `아래 링크를 열면 리브 이메일 인증이 끝납니다.\n${link}\n\n또는 리브 화면에 인증 코드를 입력해주세요: ${code}\n\n링크와 코드는 10분 동안 유효하고 한 번만 사용할 수 있습니다.\n본인이 요청하지 않았다면 이 메일을 무시해주세요.`;
  const href = escapeHtml(link);
  // 받은편지함 목록의 미리보기 줄. 뒤의 공백 문자는 본문이 미리보기에 끌려오지 않게 채운다.
  const preheader = `버튼을 누르거나 인증 코드 ${code}를 입력해주세요`;
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>리브 이메일 인증</title>
</head>
<body style="margin:0;padding:0;background:${SURFACE};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${SURFACE};">${preheader}${"&#847;&zwnj;&nbsp;".repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SURFACE};">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;">
<tr><td style="padding:0 8px 20px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:10px;"><img src="${ICON_URL}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border-radius:10px;background:${PRIMARY};border:0;"></td>
<td style="font-family:${FONT};font-size:20px;font-weight:800;color:${INK};letter-spacing:-0.3px;">리브</td>
</tr></table>
</td></tr>
<tr><td style="background:#ffffff;border-radius:24px;padding:40px 32px;font-family:${FONT};">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;font-weight:800;color:${INK};letter-spacing:-0.4px;">이메일 인증</h1>
<p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:${BODY};">아래 버튼을 누르면 바로 인증이 끝나요.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" bgcolor="${PRIMARY}" style="background:${PRIMARY};border-radius:9999px;">
<a href="${href}" target="_blank" style="display:block;padding:16px 24px;font-family:${FONT};font-size:16px;line-height:1.2;font-weight:700;color:${INK};text-decoration:none;border-radius:9999px;">이메일 인증하기</a>
</td></tr>
</table>
<p style="margin:28px 0 12px;font-size:14px;line-height:1.6;color:${MUTE};">버튼이 열리지 않으면 리브 화면에 아래 코드를 입력해주세요.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="background:${PRIMARY_PALE};border-radius:16px;padding:20px 12px;">
<div style="font-family:${FONT};font-size:32px;line-height:1;font-weight:800;letter-spacing:10px;color:${INK_DEEP};font-variant-numeric:tabular-nums;padding-left:10px;-webkit-user-select:all;user-select:all;cursor:pointer;">${code}</div>
</td></tr>
</table>
<p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:${MUTE};">버튼과 코드는 10분 동안 유효하고 한 번만 사용할 수 있어요.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
<tr><td style="border-top:1px solid ${HAIRLINE};padding-top:20px;font-size:13px;line-height:1.6;color:${MUTE};">본인이 요청하지 않았다면 이 메일을 무시해주세요. 버튼을 누르거나 코드를 입력하지 않으면 계정은 인증되지 않아요.</td></tr>
</table>
</td></tr>
<tr><td style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED_SOFT};">이 메일은 발신 전용이에요. 리브 · leave.moveto.kr</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  return { subject: "리브 이메일 인증", text, html };
}

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}

const BUTTON_STYLE = `display:block;box-sizing:border-box;width:100%;padding:16px 24px;border:0;border-radius:9999px;background:${PRIMARY};color:${INK};font-family:${FONT};font-size:16px;line-height:1.2;font-weight:700;text-align:center;text-decoration:none;cursor:pointer;`;

type LinkPage =
  | { kind: "confirm"; fields: Record<string, string> }
  | { kind: "verified"; appUrl: string }
  | { kind: "invalid"; appUrl: string };

/**
 * 메일 버튼이 여는 페이지. 메일 보안 스캐너는 링크를 미리 열어 보므로 GET만으로는
 * 인증하지 않는다. 확인 페이지가 스크립트로 곧바로 POST를 보내고, 스크립트가 막힌
 * 브라우저에서는 같은 폼의 버튼을 누르면 된다.
 */
export function verificationLinkPage(page: LinkPage) {
  const content =
    page.kind === "confirm"
      ? {
          title: "이메일 인증 중",
          body: "잠시만 기다려주세요. 자동으로 넘어가지 않으면 아래 버튼을 눌러주세요.",
          action: `<form method="post" action="/auth/verify-email">${Object.entries(
            page.fields,
          )
            .map(
              ([name, value]) =>
                `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
            )
            .join(
              "",
            )}<button type="submit" style="${BUTTON_STYLE}">이메일 인증 완료하기</button></form><script>document.forms[0].submit()</script>`,
        }
      : page.kind === "verified"
        ? {
            title: "이메일 인증을 마쳤어요",
            body: "리브로 돌아가면 이어서 시작할 수 있어요. 앱에서 가입했다면 앱을 다시 열어주세요.",
            action: `<a href="${escapeHtml(page.appUrl)}" style="${BUTTON_STYLE}">리브 열기</a>`,
          }
        : {
            title: "인증 링크를 쓸 수 없어요",
            body: "링크가 만료됐거나 이미 새 메일이 발송됐어요. 리브 화면에서 인증 메일을 다시 받아주세요.",
            action: `<a href="${escapeHtml(page.appUrl)}" style="${BUTTON_STYLE}">리브 열기</a>`,
          };
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${content.title} · 리브</title>
</head>
<body style="margin:0;padding:0;background:${SURFACE};font-family:${FONT};">
<main style="max-width:480px;margin:0 auto;padding:48px 16px;">
<div style="display:flex;align-items:center;gap:10px;margin:0 8px 20px;">
<img src="${ICON_URL}" width="36" height="36" alt="" style="border-radius:10px;background:${PRIMARY};">
<span style="font-size:20px;font-weight:800;color:${INK};letter-spacing:-0.3px;">리브</span>
</div>
<div style="background:#ffffff;border-radius:24px;padding:40px 32px;">
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;font-weight:800;color:${INK};letter-spacing:-0.4px;">${content.title}</h1>
<p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:${BODY};">${content.body}</p>
${content.action}
</div>
</main>
</body>
</html>`;
}
