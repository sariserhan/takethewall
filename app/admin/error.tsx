"use client";
import Link from "next/link";
export default function ErrorPage({ retry }: { retry: () => void }) {
  return (
    <section className="segment-error">
      <span className="segment-error-mark" aria-hidden="true">
        !
      </span>
      <h1>Admin dashboard unavailable</h1>
      <p>
        We couldn’t load the dashboard. Try again. If access is still denied,
        sign in with an authorized administrator email.
      </p>
      <div className="system-actions">
        <button onClick={() => retry()}>Retry</button>
        <Link href="/">Return to the wall</Link>
      </div>
    </section>
  );
}
