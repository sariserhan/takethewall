"use client";
import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
export function AdminCommunity() {
  const config = useQuery(api.community.controls, {}),
    issues = useQuery(api.community.issues, {});
  const configure = useMutation(api.community.configure),
    create = useMutation(api.community.createDraft);
  const [date, setDate] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="admin-community">
      <h3>Community features</h3>
      {(
        [
          ["crumblingEnabled", "Show Crumbling Wall on homepage"],
          ["gazetteEnabled", "Show the latest approved Gazette"],
          ["gazetteAuto", "Prepare a Gazette draft daily at 00:05 UTC"],
        ] as const
      ).map(([feature, label]) => (
        <label className="check-label" key={feature}>
          <input
            type="checkbox"
            checked={config?.[feature] ?? false}
            disabled={!config || busy}
            onChange={(e) =>
              void run(() => configure({ feature, enabled: e.target.checked }))
            }
          />
          {label}
        </label>
      ))}
      <p className="field-note">
        The Crumbling Wall also respects the main Wall History switch. Gazette
        drafts feature up to 12 eligible placements from the latest 100
        activations that day. Nothing is posted or emailed automatically.
      </p>
      {config && (
        <EventEditor
          key={JSON.stringify(config.event)}
          initial={config.event}
        />
      )}
      <h3>Gazette newsroom</h3>
      <label>
        Issue date (completed UTC day)
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <button
        disabled={busy || !date}
        onClick={() => void run(() => create({ date }))}
      >
        Prepare draft
      </button>
      <p role="status">{message}</p>
      {issues?.length === 0 && (
        <p>No issues yet. Choose a completed day to prepare one.</p>
      )}
      {issues?.map((i) => (
        <IssueEditor key={i.id + ":" + i.revision} issue={i} />
      ))}
    </section>
  );
}
type EventValue = {
  enabled: boolean;
  title: string;
  description: string;
  start: number;
  end: number;
};
function EventEditor({ initial }: { initial: EventValue | null }) {
  const save = useMutation(api.community.scheduleEvent);
  const [title, setTitle] = useState(initial?.title ?? "Friday Wall Hour"),
    [description, setDescription] = useState(
      initial?.description ??
        "Meet the makers and discover what takes the wall next.",
    ),
    [start, setStart] = useState(
      initial ? new Date(initial.start).toISOString().slice(0, 16) : "",
    ),
    [end, setEnd] = useState(
      initial ? new Date(initial.end).toISOString().slice(0, 16) : "",
    ),
    [enabled, setEnabled] = useState(initial?.enabled ?? false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <details>
      <summary>Schedule a community hour</summary>
      <p>
        One scheduled event, using UTC. Normal $4.99 pricing and reward rules
        apply. This does not create a last-second prize.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await save({
              event: {
                title,
                description,
                enabled,
                start: Date.parse(start + "Z"),
                end: Date.parse(end + "Z"),
              },
            });
            setMessage("Event saved.");
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "Could not save event.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Event title
          <input
            required
            maxLength={100}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          Event description
          <textarea
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <label>
          Starts (UTC)
          <input
            required
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label>
          Ends (UTC)
          <input
            required
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <label className="check-label">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Show event publicly
        </label>
        <button disabled={busy}>Save community event</button>
        <p role="status">{message}</p>
      </form>
    </details>
  );
}
type Issue = {
  id: Id<"gazetteIssues">;
  date: string;
  headline: string;
  body: string;
  revision: number;
  status: "draft" | "published";
  entries: { publicId: string; name: string }[];
};
function IssueEditor({ issue }: { issue: Issue }) {
  const save = useMutation(api.community.review);
  const [headline, setHeadline] = useState(issue.headline),
    [body, setBody] = useState(issue.body),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function review(publish: boolean) {
    setBusy(true);
    try {
      await save({
        id: issue.id,
        headline,
        body,
        publish,
        revision: issue.revision,
      });
      setMessage("Saved.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="gazette-review">
      <summary>
        {issue.date} · {issue.status} · {issue.headline}
      </summary>
      <p>
        Review the source placements and keep playful headlines factual. Public
        issues use the latest approved text; saving as draft withdraws this
        issue.
      </p>
      <label>
        Gazette headline
        <input
          maxLength={140}
          value={headline}
          onChange={(e) => setHeadline(e.target.value)}
        />
      </label>
      <label>
        Gazette story
        <textarea
          maxLength={3000}
          rows={6}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </label>
      <p>Source placements ({issue.entries.length}):</p>
      <ul>
        {issue.entries.map((t) => (
          <li key={t.publicId}>
            <a
              href={`/takeover/${t.publicId}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.name}
            </a>
          </li>
        ))}
      </ul>
      <div className="owner-share-actions">
        <button disabled={busy} onClick={() => void review(false)}>
          Save as draft
        </button>
        <button
          disabled={busy || !issue.entries.length}
          onClick={() => void review(true)}
        >
          Approve & publish Gazette
        </button>
      </div>
      <p role="status">{message}</p>
    </details>
  );
}
