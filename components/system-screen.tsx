import Link from "next/link";
export function SystemScreen({
  code,
  title,
  children,
}: {
  code: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="system-screen">
      <header className="system-header">
        <Link className="system-wordmark" href="/">
          TAKE THE WALL
        </Link>
        <span>ONE WALL. ONE OWNER.</span>
      </header>
      <div className="system-stage">
        <div className="system-poster" aria-hidden="true">
          <span>TAKE THE WALL</span>
          <strong>{code}</strong>
          <div className="system-poster-rule" />
          <small>
            {code === "404"
              ? "NOT EVERY LINK LEADS TO A WALL."
              : code === "…"
                ? "YOUR NEXT MOMENT IS LOADING."
                : "A SHORT PAUSE. TRY AGAIN."}
          </small>
        </div>
        <section className="system-content">
          <span className="system-code">
            {code === "404"
              ? "PAGE NOT FOUND"
              : code === "…"
                ? "LOADING"
                : "TEMPORARILY UNAVAILABLE"}
          </span>
          <h1>{title}</h1>
          {children}
        </section>
      </div>
      <footer className="system-footer">
        <span>ONE WALL. STILL HERE.</span>
        <nav aria-label="Help and information">
          <Link href="/">Live wall</Link>
          <Link href="/?info=support">Support</Link>
          <Link href="/?info=privacy">Privacy</Link>
          <Link href="/?info=terms">Terms</Link>
        </nav>
      </footer>
    </main>
  );
}
