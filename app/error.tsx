"use client";
import { SystemScreen } from "@/components/system-screen";
export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <SystemScreen code="!" title="THE WALL HIT A SNAG.">
      <p>We couldn’t load this page. Please try again in a moment.</p>
      <p className="system-payment-note">
        If you just paid, don’t submit another payment. Your confirmation may
        still be processing.
      </p>
      <div className="system-actions">
        <button className="button" onClick={() => retry()}>
          TRY AGAIN
        </button>
      </div>
    </SystemScreen>
  );
}
