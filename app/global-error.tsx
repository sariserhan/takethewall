"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Hard navigation recovers from a failed root layout/router. */
// This boundary replaces the root layout, so it must work without its CSS or fonts.
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="robots" content="noindex, nofollow" />
        <title>Something went wrong | Take The Wall</title>
      </head>
      <body
        style={{
          margin: 0,
          background: "#f3f0e7",
          color: "#171717",
          fontFamily: "Arial, sans-serif",
        }}
      >
        <main
          style={{
            minHeight: "100dvh",
            display: "flex",
            flexDirection: "column",
            padding: "24px",
            boxSizing: "border-box",
          }}
        >
          <header
            style={{ fontSize: "clamp(2rem, 10vw, 8rem)", fontWeight: 900 }}
          >
            TAKE THE WALL
          </header>
          <section
            style={{
              flex: 1,
              display: "grid",
              alignContent: "center",
              gap: 16,
              maxWidth: 680,
            }}
          >
            <span>SERVER ERROR</span>
            <h1>We couldn’t load the wall.</h1>
            <p>
              Please try again. If you just paid, don’t submit another payment.
            </p>
            <button
              onClick={() => retry()}
              style={{
                padding: 16,
                background: "#dfff00",
                border: "1px solid",
                font: "inherit",
                cursor: "pointer",
              }}
            >
              TRY AGAIN
            </button>
            <a href="/" style={{ color: "inherit" }}>
              Return to the wall
            </a>
          </section>
          <footer>
            <a href="/?info=support" style={{ color: "inherit" }}>
              Contact support
            </a>
          </footer>
        </main>
      </body>
    </html>
  );
}
