export function LoadingSkeleton({
  label = "Loading the wall",
}: {
  label?: string;
}) {
  return (
    <section
      className="loading-skeleton"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <p>{label}…</p>
      <div aria-hidden="true" className="skeleton-content">
        <div className="skeleton-block skeleton-heading" />
        <div className="skeleton-block skeleton-creative" />
        <div className="skeleton-block skeleton-line" />
        <div className="skeleton-cards">
          {[0, 1, 2, 3].map((n) => (
            <div key={n} className="skeleton-block" />
          ))}
        </div>
      </div>
    </section>
  );
}
