/**
 * 로그인 전에도 열 수 있어야 하는 공개 문서 링크(Apple 5.1.1(i)).
 * 정적 페이지는 같은 워커의 `public/` 에서 서빙되므로 절대 URL이 필요 없다.
 */
const LINKS = [
  { label: "개인정보처리방침", href: "/privacy" },
  { label: "이용약관", href: "/terms" },
  { label: "지원·문의", href: "/support" },
] as const;

export function LegalLinks() {
  return (
    <nav
      aria-label="법적 고지와 지원 링크"
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "var(--sp-lg)",
        justifyContent: "center",
        minHeight: 44,
        alignItems: "center",
      }}
    >
      {LINKS.map((item) => (
        <a
          key={item.href}
          className="caption text-body"
          href={item.href}
          target="_blank"
          rel="noreferrer"
          style={{ textDecoration: "underline", padding: "10px 0" }}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
