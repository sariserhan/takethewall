"use client";
import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { ReportContent } from "./report-content";
async function send(body: Record<string, unknown>) {
  const r = await fetch("/api/ama", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Could not save. Please retry.");
}
export function MicroAma({
  takeoverId,
  name,
}: {
  takeoverId: Id<"takeovers">;
  name: string;
}) {
  const data = useQuery(api.ama.current, { takeoverId });
  const [question, setQuestion] = useState(""),
    [company, setCompany] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  if (!data) return null;
  return (
    <section className="micro-ama" aria-label="Live micro-AMA">
      <p className="eyebrow">LIVE MICRO-AMA</p>
      <h2>Ask {name} anything.</h2>
      <p>
        Your question is private until the owner answers. The AMA closes when
        the wall changes hands.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await send({ action: "ask", takeoverId, question, company });
            setQuestion("");
            setMessage(
              "Question sent privately. The owner chooses which questions to answer.",
            );
          } catch (e) {
            setMessage(e instanceof Error ? e.message : "Could not send.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Your question
          <input
            placeholder="What would you like to know?"
            required
            minLength={3}
            maxLength={240}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
        </label>
        <input
          className="honeypot"
          aria-hidden="true"
          tabIndex={-1}
          autoComplete="off"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        />
        <div className="ama-submit-row">
          <span className="ama-question-count">
            {question.length}/240 characters
          </span>
          <button className="ama-submit" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Ask the owner"}
            <span aria-hidden="true"> →</span>
          </button>
        </div>
        <p role="status">{message}</p>
      </form>
      {data.answers.length > 0 && (
        <h3 className="ama-answers-title">Answered by {name}</h3>
      )}
      <div className="ama-answers">
        {data.answers.map((q) => (
          <details key={q.id}>
            <summary>
              <h3>{q.question}</h3>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
            <p>{q.answer}</p>
          </details>
        ))}
      </div>
      <ReportContent takeoverId={takeoverId} name={name + " — AMA"} />
    </section>
  );
}
type Inbox = {
  enabled: boolean;
  live: boolean;
  pending: { id: string; question: string; answer: string | null }[];
  answers: { id: string; question: string; answer: string | null }[];
};
export function OwnerAma() {
  const [data, setData] = useState<Inbox | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function refresh() {
    const r = await fetch("/api/ama", { cache: "no-store" });
    if (!r.ok) throw new Error("AMA inbox unavailable. Refresh to retry.");
    setData(await r.json());
  }
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/ama", { cache: "no-store" });
        if (!r.ok) throw Error();
        const data = await r.json();
        if (alive) setData(data);
      } catch {
        if (alive) setMessage("AMA inbox unavailable. Refresh to retry.");
      }
    };
    void poll();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, 15000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await send(body);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="owner-ama">
      <h2>Live micro-AMA</h2>
      <p>
        Only answered questions are published. Enabling questions does not send
        emails.
      </p>
      <label className="check-label">
        <input
          type="checkbox"
          checked={data?.enabled ?? false}
          disabled={!data || busy || !data.live}
          onChange={(e) =>
            void act({ action: "toggle", enabled: e.target.checked })
          }
        />
        Accept questions during this reign
      </label>
      <p className="field-note">
        New unanswered questions are grouped into an email every five minutes.
        Disable questions to stop these notifications.
      </p>
      {data && !data.live && (
        <p>Your reign ended. New questions and replies are closed.</p>
      )}
      <button
        onClick={() => void refresh().catch((e) => setMessage(e.message))}
      >
        Refresh questions
      </button>
      <p role="status">{message}</p>
      {data?.pending.map((q) => (
        <Answer
          key={q.id}
          question={q.question}
          disabled={busy || !data.live}
          onAnswer={(answer) =>
            act({ action: "answer", questionId: q.id, answer })
          }
          onDismiss={() => void act({ action: "dismiss", questionId: q.id })}
        />
      ))}
      {data?.pending.length === 0 && <p>No pending questions.</p>}
      {data?.answers.map((q) => (
        <article key={q.id}>
          <h3>{q.question}</h3>
          <p>{q.answer}</p>
          <button
            disabled={busy}
            onClick={() => void act({ action: "dismiss", questionId: q.id })}
          >
            Remove public answer
          </button>
        </article>
      ))}
    </section>
  );
}
function Answer({
  question,
  disabled,
  onAnswer,
  onDismiss,
}: {
  question: string;
  disabled: boolean;
  onAnswer: (answer: string) => Promise<void>;
  onDismiss: () => void;
}) {
  const [answer, setAnswer] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onAnswer(answer);
      }}
    >
      <h3>{question}</h3>
      <label>
        Your answer
        <textarea
          required
          maxLength={600}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
        />
      </label>
      <button disabled={disabled}>Publish answer</button>
      <button type="button" disabled={disabled} onClick={onDismiss}>
        Dismiss question
      </button>
    </form>
  );
}
