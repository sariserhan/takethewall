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
      <header className="masthead">
        <Link href="/" aria-label="Take The Wall home">
          <h1>TAKE THE WALL</h1>
        </Link>
      </header>
      <section className="system-content">
        <span className="system-code">{code}</span>
        <h2>{title}</h2>
        {children}
      </section>
      <footer className="system-footer">
        <Link href="/">Return to the wall</Link>
        <Link href="/?info=support">Support</Link>
        <Link href="/?info=privacy">Privacy</Link>
        <Link href="/?info=terms">Terms</Link>
      </footer>
    </main>
  );
}
