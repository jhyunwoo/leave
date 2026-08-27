/**
 * CSV 내보내기의 셀 escape.
 *
 * 라우트에서 떼어 둔 이유는 두 가지다. 하나는 이 규칙이 D1도 hono도 필요 없는
 * 순수 함수라는 것, 다른 하나는 **테스트가 직접 부를 수 있어야 한다는 것**이다.
 * HTTP로는 이 규칙의 절반밖에 건드릴 수 없다 — 헤더 값은 전송 과정에서 앞의
 * 공백이 잘리고, 본문으로 들어오는 문자열은 스키마가 `trim()`으로 다듬는다.
 */

/**
 * 수식으로 해석될 수 있는 셀의 앞에 작은따옴표를 붙인다.
 *
 * CSV의 큰따옴표는 필드 구분일 뿐이라 보호가 되지 않는다 — 엑셀은 `"=1+1"`을 읽어
 * 따옴표를 벗긴 뒤 수식으로 평가한다. 막는 것은 앞에 붙는 `'` 하나뿐이다.
 *
 * 판정할 때 **앞의 공백·제어문자를 건너뛰고** 첫 글자를 본다. 스프레드시트는 셀을
 * 읽을 때 선행 공백·탭·개행을 버리고 그다음 글자부터 보므로, `\t=...`처럼 한 글자만
 * 끼워 넣으면 `^[=+\-@]`만 보는 검사를 그대로 지나간다.
 *
 * `trim()`은 공백과 줄바꿈만 걷어낸다. `\u0001` 같은 C0 제어문자는 그대로 남아
 * 표시명(`users.name`)을 타고 CSV 한 칸에 실릴 수 있으므로 함께 본다.
 */
export function csvCell(value: unknown): string {
  let text =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  // 의도적으로 스프레드시트가 건너뛰는 ASCII 제어문자까지 검사한다.
  // eslint-disable-next-line no-control-regex
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function csvResponse(
  rows: Array<Record<string, unknown>>,
  filename: string,
): Response {
  const headers = Object.keys(rows[0] ?? {});
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(",")),
  ];
  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
