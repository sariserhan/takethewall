"use client";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AdminContactControls } from "./admin-contact-controls";
import { Dialog } from "./dialog";
const time = (at: number | null) =>
  at
    ? new Date(at)
        .toISOString()
        .replace("T", " ")
        .replace(/\.\d+Z$/, " UTC")
    : "—";
type Contact = {
  id: string;
  email: string;
  sources: string[];
  createdAt: number;
  suppression?: string | null;
  wallConfirmedAt?: number | null;
  milestoneConfirmedAt?: number | null;
  wall: string;
  milestone: string;
  last: { kind: string; state: string; at: number } | null;
};
type Message = {
  id: string;
  kind: string;
  subject: string;
  state: string;
  createdAt: number;
  updatedAt: number;
  sentAt: number | null;
  events: { eventId: string; type: string; occurredAt: number }[];
};
export function AdminEmails() {
  const [search, setSearch] = useState(""),
    [draft, setDraft] = useState(""),
    [cursor, setCursor] = useState<string | null>(null),
    [selected, setSelected] = useState("");
  const raw = useQuery(api.emailDirectory.list, {
    search,
    paginationOpts: { cursor, numItems: 25 },
  });
  const page = raw
    ? (JSON.parse(raw) as { rows: Contact[]; cursor: string; done: boolean })
    : null;
  return (
    <section>
      <h2>Email directory</h2>
      <p>
        Contact addresses collected through checkout, subscriptions, claims,
        support, and email delivery. Collecting an address does not subscribe it
        to updates. Existing records are indexed in batches every five minutes.
      </p>
      <form
        className="email-directory-search"
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(draft);
          setCursor(null);
        }}
      >
        <label>
          Find email (starts with)
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={254}
          />
        </label>
        <button type="submit">Search</button>
      </form>
      {!page ? (
        <p role="status">Loading email directory…</p>
      ) : (
        <>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email / source</th>
                  <th>Wall updates</th>
                  <th>Milestone alerts</th>
                  <th>Latest email</th>
                  <th>History</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.email}
                      <small>{c.sources.join(" · ")}</small>
                      {c.suppression && (
                        <small>
                          Optional emails paused ·{" "}
                          {c.suppression.replaceAll("_", " ")}
                        </small>
                      )}
                      <small>First collected {time(c.createdAt)}</small>
                    </td>
                    <td>
                      {c.wall}
                      {c.wallConfirmedAt && (
                        <small>Confirmed {time(c.wallConfirmedAt)}</small>
                      )}
                    </td>
                    <td>
                      {c.milestone}
                      {c.milestoneConfirmedAt && (
                        <small>Confirmed {time(c.milestoneConfirmedAt)}</small>
                      )}
                    </td>
                    <td>
                      {c.last ? (
                        <>
                          {c.last.kind.replaceAll("_", " ")} · {c.last.state}
                          <small>{time(c.last.at)}</small>
                        </>
                      ) : (
                        "No email recorded"
                      )}
                    </td>
                    <td>
                      <button onClick={() => setSelected(c.email)}>
                        View emails
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!page.rows.length && <p>No matching email addresses yet.</p>}
          <div className="owner-share-actions">
            <button disabled={!cursor} onClick={() => setCursor(null)}>
              First page
            </button>
            <button disabled={page.done} onClick={() => setCursor(page.cursor)}>
              Next page
            </button>
          </div>
        </>
      )}
      <Dialog
        title={selected ? `Email history · ${selected}` : "Email history"}
        open={!!selected}
        onClose={() => setSelected("")}
      >
        {selected && (
          <>
            <AdminContactControls
              key={"contact:" + selected}
              email={selected}
            />
            <EmailHistory key={selected} email={selected} />
          </>
        )}
      </Dialog>
    </section>
  );
}
function EmailHistory({ email }: { email: string }) {
  const [cursor, setCursor] = useState<string | null>(null);
  const raw = useQuery(api.emailDirectory.history, {
      email,
      paginationOpts: { cursor, numItems: 20 },
    }),
    page = raw
      ? (JSON.parse(raw) as { rows: Message[]; cursor: string; done: boolean })
      : null;
  return (
    <>
      <p>
        Accepted means Resend accepted the send. Delivered means the receiving
        mail server accepted it, not necessarily the inbox. Historical processed
        records may include skipped messages; exact older send times are
        unavailable.
      </p>
      {!page ? (
        <p role="status">Loading history…</p>
      ) : (
        <>
          {!page.rows.length && <p>No emails recorded for this address.</p>}
          {page.rows.map((m) => (
            <article className="email-history-item" key={m.id}>
              <h3>{m.subject}</h3>
              <p>
                {m.kind.replaceAll("_", " ")} · <strong>{m.state}</strong>
              </p>
              <p>
                Queued {time(m.createdAt)}
                <br />
                {m.sentAt
                  ? `Accepted ${time(m.sentAt)}`
                  : `Last updated ${time(m.updatedAt)}`}
              </p>
              {m.events.length > 0 && (
                <ol>
                  {m.events.map((e) => (
                    <li key={e.eventId}>
                      {e.type.replace("email.", "").replaceAll("_", " ")} ·{" "}
                      {time(e.occurredAt)}
                    </li>
                  ))}
                </ol>
              )}
            </article>
          ))}
          <div className="owner-share-actions">
            <button disabled={!cursor} onClick={() => setCursor(null)}>
              Newest emails
            </button>
            <button disabled={page.done} onClick={() => setCursor(page.cursor)}>
              Older emails
            </button>
          </div>
        </>
      )}
    </>
  );
}
