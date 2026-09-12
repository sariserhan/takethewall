"use client";
import Link from "next/link";
export default function Page({ retry }: { retry: () => void }) {
  return (
    <section className="segment-error">
      <span className="segment-error-mark" aria-hidden="true">
        !
      </span>
      <h1>CLAIM SESSION UNAVAILABLE</h1>
      <p>
        Your session may have expired. Open your protected email link and
        request a fresh code.
      </p>
      <div className="system-actions">
        <button onClick={() => retry()}>Try again</button>
        <Link href="/?info=support">Contact support</Link>
      </div>
    </section>
  );
}
