"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section>
      <h1>Admin access unavailable</h1>
      <p>
        Your identity must be on the server administrator allowlist. If access
        was granted, retry after signing in again.
      </p>
      <button onClick={reset}>Retry</button>
      <Link href="/">Return to the wall</Link>
    </section>
  );
}
