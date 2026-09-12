"use client";
import Link from "next/link";
export default function Page({ retry }: { retry: () => void }) {
  return (
    <section>
      <h1>CLAIM SESSION UNAVAILABLE</h1>
      <p>
        Your session may have expired. Open your protected email link and
        request a fresh code.
      </p>
      <button onClick={() => retry()}>Try again</button>
      <Link href="/?info=support">Contact support</Link>
    </section>
  );
}
