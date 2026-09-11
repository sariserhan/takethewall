"use client";
import Link from "next/link";
export default function Page() {
  return (
    <section>
      <h1>CLAIM SESSION UNAVAILABLE</h1>
      <p>
        Your session may have expired. Open your protected email link and
        request a fresh code.
      </p>
      <Link href="/support">Contact support</Link>
    </section>
  );
}
