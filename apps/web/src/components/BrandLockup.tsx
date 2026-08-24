/**
 * 브랜드 마크 + 워드마크 조합.
 * 사용처: 상단바, 로그인·회원가입, 랜딩 페이지.
 */

type BrandLockupProps = {
  className?: string;
  iconSize?: number;
};

export function BrandLockup({
  className = "",
  iconSize = 30,
}: BrandLockupProps) {
  const classes = ["brand-lockup", className].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      <img
        className="brand-lockup__mark"
        src="/icon-192.png"
        width={iconSize}
        height={iconSize}
        alt=""
        aria-hidden="true"
      />
      <span>리브</span>
    </span>
  );
}
