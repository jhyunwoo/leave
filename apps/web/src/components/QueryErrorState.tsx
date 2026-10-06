export function QueryErrorState({
  title,
  onRetry,
  retrying,
}: {
  title: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  return (
    <section
      className="card-sage"
      role="alert"
      style={{ padding: "var(--sp-lg)", display: "grid", gap: "var(--sp-sm)" }}
    >
      <p className="body-lg strong">{title}</p>
      <p className="body-sm text-body">잠시 후 다시 시도해주세요.</p>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={retrying}
        onClick={onRetry}
      >
        {retrying ? "다시 불러오는 중" : "다시 불러오기"}
      </button>
    </section>
  );
}
