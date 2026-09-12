"use client";
import { AdminGrowth } from "./admin-growth";
import { AdminEmails } from "./admin-emails";
import { AdminDelivery } from "./admin-delivery";
import { AdminFunnel } from "./admin-funnel";
import { AdminNotifications } from "./admin-notifications";
import { AdminDemoStats } from "./admin-demo-stats";
import { AdminHealth } from "./admin-health";
import Link from "next/link";
import { LoadingSkeleton } from "./loading-skeleton";
import { AdminPublish } from "./admin-publish";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
const sections = [
  "overview",
  "growth",
  "funnel",
  "delivery",
  "emails",
  "publish",
  "demo stats",
  "takeovers",
  "milestones",
  "claims",
  "messages",
  "support",
  "audit",
  "settings",
];
export function AdminDashboard() {
  const [section, setSection] = useState("overview");
  const identity = useQuery(api.admin.identity);
  const overview = useQuery(
    api.admin.overview,
    section === "overview" ? {} : "skip",
  );
  const [before, setBefore] = useState<string | undefined>();
  const raw = useQuery(
    api.admin.list,
    ![
      "overview",
      "growth",
      "emails",
      "delivery",
      "funnel",
      "settings",
      "publish",
      "demo stats",
    ].includes(section)
      ? { section, cursor: before }
      : "skip",
  );
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const moderate = useMutation(api.admin.moderate);
  if (identity === undefined)
    return <LoadingSkeleton label="Checking administrator access" />;
  const page = raw ? JSON.parse(raw) : null;
  const stats = overview ? JSON.parse(overview) : null;
  return (
    <>
      <header>
        <Link href="/">TAKE THE WALL</Link>
        <h1>ADMIN / {section.toUpperCase()}</h1>
      </header>
      <nav className="admin-nav" aria-label="Admin sections">
        {sections.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={s === section}
            onClick={() => {
              if (s === section) return;
              setBefore(undefined);
              setSelected("");
              setError("");
              setSection(s);
            }}
          >
            {s.replaceAll("_", " ")}
          </button>
        ))}
      </nav>
      {error && <p role="alert">{error}</p>}
      {((section === "overview" && overview === undefined) ||
        (![
          "overview",
          "growth",
          "emails",
          "delivery",
          "funnel",
          "settings",
          "publish",
          "demo stats",
        ].includes(section) &&
          raw === undefined)) && (
        <LoadingSkeleton label={`Loading ${section}`} />
      )}
      {section === "overview" && <AdminHealth />}
      {section === "growth" && <AdminGrowth />}
      {stats && (
        <>
          {!!stats.site?.numberingOffset && (
            <p>
              Public numbering offset: {stats.site.numberingOffset}. Actual
              recorded takeovers: {stats.site.recordedTakeovers}. Audit sequence
              numbers remain unchanged.
            </p>
          )}
          <div className="admin-cards">
            {Object.entries({
              "Counted takeovers": stats.site?.totalTakeovers ?? 0,
              "Visitors today": stats.today?.visitors ?? 0,
              "Gross revenue today":
                "$" + ((stats.today?.revenueCents ?? 0) / 100).toFixed(2),
              "Clicks today": stats.today?.clicks ?? 0,
              "Open recent claims": stats.recentOpenClaims,
              "Unread conversations": stats.unreadConversations,
              "Open support": stats.openSupport,
              "Failed emails": stats.failedEmails,
            }).map(([label, value]) => (
              <article key={label}>
                <span>{label}</span>
                <strong>{String(value)}</strong>
              </article>
            ))}
          </div>
          <p>Operational queue counts cover up to 100 records per queue.</p>
          <h2>Milestones</h2>
          {stats.milestones.map(
            (m: { number: number; status: string; candidate: number }) => (
              <p key={m.number}>
                #{m.number} · {m.status} · candidate #{m.candidate}
              </p>
            ),
          )}
        </>
      )}
      {section === "emails" && <AdminEmails />}
      {section === "delivery" && <AdminDelivery />}
      {section === "funnel" && <AdminFunnel />}
      {section === "publish" && <AdminPublish />}
      {section === "demo stats" && <AdminDemoStats />}
      {section === "settings" && (
        <>
          <AdminNotifications />
          <Settings />
        </>
      )}
      {page && (
        <>
          <div className="admin-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Record</th>
                  <th>Status / action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((row: Record<string, unknown>) => (
                  <tr key={String(row._id)}>
                    <td>
                      {String(
                        row.displayName ??
                          row.domain ??
                          row.topic ??
                          row.action ??
                          "#" +
                            (row.takeoverNumber ?? row.milestoneNumber ?? ""),
                      )}
                      <small>
                        {row.takeoverNumber
                          ? `Takeover #${row.takeoverNumber}`
                          : ""}
                      </small>
                    </td>
                    <td>
                      {String(row.status ?? row.createdAt ?? "")}
                      {row.unread ? <strong> · UNREAD</strong> : null}
                      {row.milestone ? (
                        <small>Milestone #{String(row.milestone)}</small>
                      ) : null}
                      {row.lastMessage ? (
                        <p>{String(row.lastMessage)}</p>
                      ) : null}
                      {row.updatedAt ? (
                        <small>
                          {new Date(Number(row.updatedAt)).toLocaleString()}
                        </small>
                      ) : null}
                    </td>
                    <td>
                      {["claims", "messages", "support"].includes(section) ? (
                        <button onClick={() => setSelected(String(row._id))}>
                          Open
                        </button>
                      ) : (
                        <details>
                          <summary>Inspect</summary>
                          <pre>{JSON.stringify(row, null, 2)}</pre>
                          {section === "takeovers" &&
                            row.status === "active" && (
                              <button
                                onClick={async () => {
                                  const reason = prompt(
                                    "Reason for removing the current content",
                                  );
                                  if (
                                    !reason ||
                                    !confirm(
                                      "Remove this live content and restore a safe placement?",
                                    )
                                  )
                                    return;
                                  try {
                                    await moderate({
                                      takeoverId: row._id as Id<"takeovers">,
                                      reason,
                                      confirmed: true,
                                      removeLive: true,
                                    });
                                  } catch (e) {
                                    setError(
                                      e instanceof Error
                                        ? e.message
                                        : "Removal failed",
                                    );
                                  }
                                }}
                              >
                                Remove live content
                              </button>
                            )}
                          {section === "takeovers" &&
                            typeof row.paymentReference === "string" && (
                              <a
                                href={`https://dashboard.stripe.com/search?query=${encodeURIComponent(row.paymentReference)}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Review payment / refund in Stripe
                              </a>
                            )}
                          {["takeovers", "milestones"].includes(section) && (
                            <button
                              onClick={async () => {
                                const reason = prompt(
                                  "Reason for disabling the outbound link",
                                );
                                if (
                                  !reason ||
                                  !confirm(
                                    "Disable this destination? The historical record stays intact.",
                                  )
                                )
                                  return;
                                try {
                                  await moderate({
                                    ...(section === "takeovers"
                                      ? {
                                          takeoverId:
                                            row._id as Id<"takeovers">,
                                        }
                                      : {
                                          rewardId:
                                            row._id as Id<"milestoneRewards">,
                                        }),
                                    reason,
                                    confirmed: true,
                                  });
                                } catch (e) {
                                  setError(
                                    e instanceof Error
                                      ? e.message
                                      : "Action failed",
                                  );
                                }
                              }}
                            >
                              Disable outbound link
                            </button>
                          )}
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {page.rows.length === 0 && <p>No records yet.</p>}
          <button
            onClick={() => setBefore(undefined)}
            disabled={before === undefined}
          >
            Newest
          </button>
          {page.next && (
            <button onClick={() => setBefore(page.next)}>
              Older records →
            </button>
          )}
        </>
      )}
      {selected && ["claims", "messages"].includes(section) && (
        <ClaimDetail
          key={selected}
          id={selected as Id<"rewardClaims">}
          close={() => setSelected("")}
        />
      )}
      {selected && section === "support" && (
        <TicketDetail
          id={selected as Id<"supportTickets">}
          close={() => setSelected("")}
        />
      )}
    </>
  );
}
function ClaimDetail({
  id,
  close,
}: {
  id: Id<"rewardClaims">;
  close: () => void;
}) {
  const raw = useQuery(api.admin.claim, { id }),
    action = useMutation(api.admin.claimAction),
    send = useMutation(api.admin.message),
    read = useMutation(api.admin.read),
    manageDocument = useMutation(api.documents.manage);
  const [body, setBody] = useState(""),
    [note, setNote] = useState(""),
    [deadline, setDeadline] = useState(""),
    [reference, setReference] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    void read({ claimId: id });
  }, [id, read, raw]);
  if (!raw) return <p>Loading claim…</p>;
  const { claim, reward, messages, documents, history } = JSON.parse(raw);
  async function run(
    name:
      | "request_information"
      | "approve"
      | "ineligible"
      | "extend"
      | "sent"
      | "confirm"
      | "resend"
      | "request_document",
  ) {
    if (
      ["approve", "ineligible", "sent", "confirm"].includes(name) &&
      !confirm(`Confirm ${name} for takeover #${claim.takeoverNumber}?`)
    )
      return;
    try {
      await action({
        claimId: id,
        action: name,
        expectedStatus: claim.status,
        body: note,
        ...(deadline ? { deadlineAt: new Date(deadline).getTime() } : {}),
        reference,
        confirmed: true,
      });
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    }
  }
  return (
    <section className="admin-detail">
      <button onClick={close}>Close claim ×</button>
      <h2>
        Takeover #{claim.takeoverNumber} · ${reward.rewardUsd}
      </h2>
      <p>
        {claim.status} · deadline {new Date(claim.deadlineAt).toUTCString()}
      </p>
      <dl>
        {[
          "email",
          "legalName",
          "country",
          "region",
          "dob",
          "declaration",
          "requiredInformation",
          "privateReason",
        ].map((k) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{claim[k] || "—"}</dd>
          </div>
        ))}
      </dl>
      <p>
        Payout: {reward.payoutStatus ?? "pending"} ·{" "}
        {reward.payoutReference ?? "No reference"}
      </p>
      <label>
        Reason / information request
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={5000}
        />
      </label>
      <label>
        Extended deadline (local time)
        <input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
      </label>
      <label>
        Wire reference (no account details)
        <input
          maxLength={200}
          value={reference}
          onChange={(e) => setReference(e.target.value)}
        />
      </label>
      <div className="admin-actions">
        {(
          [
            "request_information",
            "approve",
            "ineligible",
            "extend",
            "sent",
            "confirm",
            "resend",
            "request_document",
          ] as const
        ).map((a) => (
          <button key={a} onClick={() => void run(a)}>
            {
              {
                request_information: "Request information",
                approve: "Approve claim",
                ineligible: "Mark ineligible",
                extend: "Extend deadline",
                sent: "Mark wire sent",
                confirm: "Confirm payout",
                resend: "Resend claim link",
                request_document: "Request private document",
              }[a]
            }
          </button>
        ))}
      </div>
      {error && <p role="alert">{error}</p>}
      <h3>Requested documents</h3>
      {documents.map(
        (d: {
          id: string;
          request: string;
          uploaded: boolean;
          deletedAt?: number;
        }) => (
          <p key={d.id}>
            {d.request} ·{" "}
            {d.uploaded ? (
              <a
                href={`/api/documents?id=${d.id}`}
                target="_blank"
                rel="noreferrer"
              >
                Download privately
              </a>
            ) : d.deletedAt ? (
              "Deleted"
            ) : (
              "Waiting"
            )}
            {!d.deletedAt && (
              <>
                <button
                  onClick={async () => {
                    const reason = prompt(
                      "Reason for permanently deleting this private document",
                    );
                    if (
                      !reason ||
                      !confirm("Permanently delete this document?")
                    )
                      return;
                    try {
                      await manageDocument({
                        id: d.id as Id<"claimDocuments">,
                        reason,
                        confirmed: true,
                      });
                    } catch {
                      setError("Document deletion failed");
                    }
                  }}
                >
                  Delete document
                </button>
                <button
                  onClick={async () => {
                    const reason = prompt("Documented retention requirement"),
                      date = reason
                        ? prompt("New deletion date (YYYY-MM-DD)")
                        : null;
                    if (!reason || !date) return;
                    try {
                      await manageDocument({
                        id: d.id as Id<"claimDocuments">,
                        reason,
                        confirmed: true,
                        deleteAt: new Date(date).getTime(),
                      });
                    } catch {
                      setError("Retention update failed");
                    }
                  }}
                >
                  Change retention
                </button>
              </>
            )}
          </p>
        ),
      )}
      <h3>Messages with winner</h3>
      <div className="messages">
        {messages.map(
          (m: {
            _id: string;
            sender: string;
            body: string;
            createdAt: number;
          }) => (
            <article key={m._id}>
              <strong>{m.sender}</strong>
              <small>{new Date(m.createdAt).toLocaleString()}</small>
              <p>{m.body}</p>
            </article>
          ),
        )}
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await send({ claimId: id, body });
            setBody("");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Message failed");
          }
        }}
      >
        <label>
          Reply
          <textarea
            required
            maxLength={5000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <button>Send reply</button>
      </form>
      <details>
        <summary>Claim audit history</summary>
        <pre>{JSON.stringify(history, null, 2)}</pre>
      </details>
    </section>
  );
}
function TicketDetail({
  id,
  close,
}: {
  id: Id<"supportTickets">;
  close: () => void;
}) {
  const raw = useQuery(api.admin.ticket, { id });
  const act = useMutation(api.admin.supportAction);
  const moderateReport = useMutation(api.admin.moderate);
  const [moderationReason, setModerationReason] = useState("");
  const [reply, setReply] = useState(""),
    [error, setError] = useState("");
  if (!raw) return null;
  const { ticket, messages } = JSON.parse(raw);
  return (
    <section className="admin-detail">
      <button onClick={close}>Close ticket ×</button>
      <h2>{ticket.topic}</h2>
      <p>
        {ticket.name} · {ticket.email}
      </p>
      <p>{ticket.message}</p>
      {ticket.takeoverId && (
        <section className="reported-placement">
          <h3>Reported placement</h3>
          <pre>{ticket.reportedContent}</pre>
          <p>Takeover record: {ticket.takeoverId}</p>
          <label>
            Moderation reason
            <input
              maxLength={1000}
              value={moderationReason}
              onChange={(e) => setModerationReason(e.target.value)}
            />
          </label>
          <div className="admin-actions">
            {[false, true].map((removeLive) => (
              <button
                key={String(removeLive)}
                disabled={!moderationReason.trim()}
                onClick={async () => {
                  if (
                    !confirm(
                      removeLive
                        ? "Remove this reported placement if it is still live?"
                        : "Disable the reported placement’s outbound link?",
                    )
                  )
                    return;
                  try {
                    await moderateReport({
                      takeoverId: ticket.takeoverId,
                      reason: moderationReason,
                      removeLive,
                      confirmed: true,
                    });
                    setError("Moderation applied.");
                  } catch (e) {
                    setError(
                      e instanceof Error
                        ? e.message
                        : "Could not moderate this placement.",
                    );
                  }
                }}
              >
                {removeLive ? "Remove if still live" : "Disable outbound link"}
              </button>
            ))}
          </div>
        </section>
      )}
      <select
        aria-label="Ticket status"
        value={ticket.status}
        onChange={async (e) => {
          try {
            await act({
              id,
              status: e.target.value as
                "open" | "in_progress" | "resolved" | "spam",
            });
          } catch {
            setError("Status update failed");
          }
        }}
      >
        {["open", "in_progress", "resolved", "spam"].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
      {messages.map((m: { _id: string; body: string }) => (
        <p key={m._id}>{m.body}</p>
      ))}
      {ticket.email ? (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await act({ id, reply });
              setReply("");
            } catch {
              setError("Reply failed");
            }
          }}
        >
          <label>
            Email reply
            <textarea
              required
              maxLength={10000}
              value={reply}
              onChange={(e) => setReply(e.target.value)}
            />
          </label>
          <button>Send support email</button>
        </form>
      ) : (
        <p>
          No reply email was provided. You can still review and moderate this
          report.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
function Settings() {
  const value = useQuery(api.admin.getSettings);
  const save = useMutation(api.admin.saveSettings);
  const [draft, setDraft] = useState(""),
    [error, setError] = useState("");
  return (
    <section>
      <h2>Future configuration</h2>
      <p>
        Reached milestones and published rules cannot be overwritten. Provider
        secrets remain in deployment environment settings.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          try {
            await save({ value: JSON.parse(draft || JSON.stringify(value)) });
            setError("Saved");
          } catch (e) {
            setError(e instanceof Error ? e.message : "Invalid settings");
          }
        }}
      >
        <label>
          Configuration JSON
          <textarea
            rows={28}
            value={draft || JSON.stringify(value, null, 2) || ""}
            onChange={(e) => setDraft(e.target.value)}
          />
        </label>
        <button>Save future configuration</button>
      </form>
      <p role="status">{error}</p>
    </section>
  );
}
