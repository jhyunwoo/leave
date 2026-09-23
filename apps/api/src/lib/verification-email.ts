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
// 이미지가 막힌 클라이언트에서도 alt와 배경색으로 자리가 무너지지 않게 크기를 고정한다.
const ICON_URL = "https://leave.moveto.kr/icon-192.png";

export function verificationEmail(code: string) {
  const text = `리브 이메일 인증 코드: ${code}\n\n10분 안에 리브 화면에 입력해주세요. 코드는 한 번만 사용할 수 있습니다.\n본인이 요청하지 않았다면 이 메일을 무시해주세요.`;
  // 받은편지함 목록의 미리보기 줄. 뒤의 공백 문자는 본문이 미리보기에 끌려오지 않게 채운다.
  const preheader = `인증 코드 ${code} · 10분 안에 입력해주세요`;
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>리브 이메일 인증 코드</title>
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
<h1 style="margin:0 0 12px;font-size:24px;line-height:1.3;font-weight:800;color:${INK};letter-spacing:-0.4px;">이메일 인증 코드</h1>
<p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:${BODY};">아래 숫자 6자리를 리브 화면에 입력하면 인증이 끝나요.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="background:${PRIMARY_PALE};border-radius:16px;padding:24px 12px;">
<div style="font-family:${FONT};font-size:38px;line-height:1;font-weight:800;letter-spacing:10px;color:${INK_DEEP};font-variant-numeric:tabular-nums;padding-left:10px;-webkit-user-select:all;user-select:all;cursor:pointer;">${code}</div>
<div style="margin-top:12px;font-family:${FONT};font-size:12px;line-height:1.4;color:${MUTE};">탭하면 코드 전체가 선택돼요</div>
</td></tr>
</table>
<p style="margin:20px 0 0;font-size:14px;line-height:1.6;color:${MUTE};">10분 동안 유효하고 한 번만 사용할 수 있어요.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
<tr><td style="border-top:1px solid ${HAIRLINE};padding-top:20px;font-size:13px;line-height:1.6;color:${MUTE};">본인이 요청하지 않았다면 이 메일을 무시해주세요. 코드를 입력하지 않으면 계정은 인증되지 않아요.</td></tr>
</table>
</td></tr>
<tr><td style="padding:20px 8px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:${MUTED_SOFT};">이 메일은 발신 전용이에요. 리브 · leave.moveto.kr</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  return { subject: "리브 이메일 인증 코드", text, html };
}
