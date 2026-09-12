"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Hard navigation recovers from a failed root layout/router. */
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
        <style>{`*{box-sizing:border-box}body{margin:0;background:#f3f0e7;color:#171717;font-family:Arial,sans-serif}main{min-height:100dvh;padding:24px clamp(16px,4vw,56px);display:flex;flex-direction:column}header{font-size:24px;font-weight:900;padding-bottom:20px;border-bottom:2px solid}section{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:48px 0;gap:22px;max-width:760px}.mark{background:#171717;color:#dfff00;font-size:68px;font-weight:900;width:110px;height:110px;display:grid;place-items:center}h1{font-size:clamp(36px,7vw,76px);line-height:1.05;letter-spacing:-.04em;margin:0}p{font-size:16px;line-height:1.7;max-width:55ch;margin:0}.note{font-size:13px;border-left:3px solid;padding-left:16px}.actions{display:flex;gap:24px;align-items:center;flex-wrap:wrap}button{padding:18px 28px;background:#dfff00;border:1px solid;font:700 14px Arial;cursor:pointer}a{color:inherit;text-underline-offset:4px;font-size:13px}footer{border-top:1px solid;padding-top:20px;display:flex;gap:24px;flex-wrap:wrap}`}</style>
      </head>
      <body>
        <main>
          <header>TAKE THE WALL</header>
          <section>
            <div className="mark" aria-hidden="true">
              !
            </div>
            <h1>
              A short pause.
              <br />
              Your wall is still worth a try.
            </h1>
            <p>
              We couldn’t load the page. Try again, or return to the live wall.
            </p>
            <p className="note">
              If you just paid, don’t submit another payment. Your confirmation
              may still be processing.
            </p>
            <div className="actions">
              <button onClick={() => retry()}>TRY AGAIN</button>
              <a href="/">Return to the wall</a>
            </div>
          </section>
          <footer>
            <a href="/?info=support">Contact support</a>
            <a href="/?info=privacy">Privacy</a>
            <a href="/?info=terms">Terms</a>
          </footer>
        </main>
      </body>
    </html>
  );
}
