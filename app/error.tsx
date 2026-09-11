"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main>
      <header className="masthead">
        <h1>TAKE THE WALL</h1>
      </header>
      <section className="owner-section">
        <h2>The wall is reconnecting.</h2>
        <p>
          We couldn’t load the current owner. If you just paid, please don’t pay
          again.
        </p>
        <button className="button" onClick={reset}>
          TRY AGAIN
        </button>
      </section>
    </main>
  );
}
