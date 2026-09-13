"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { duration } from "@/lib/validation";
export function CrumblingWall() {
  const c = useQuery(api.community.controls, {});
  const historyVisible = useQuery(api.growth.visibility, {});
  const [limit, setLimit] = useState(10);
  if (!c?.crumblingEnabled || historyVisible !== true) return null;
  return (
    <section className="crumbling-wall" aria-labelledby="crumbling-title">
      <p className="eyebrow">THE POSTERS BELOW THE POSTER</p>
      <h2 id="crumbling-title">THE CRUMBLING WALL</h2>
      <p>Off the live wall. Still part of the story.</p>
      <HistoryLayer limit={limit} onMore={setLimit} />
      <Link href="/history">Explore the archive →</Link>
    </section>
  );
}
function HistoryLayer({
  limit,
  onMore,
}: {
  limit: number;
  onMore: (next: number) => void;
}) {
  const data = useQuery(api.community.history, { limit });
  if (!data) return null;
  return (
    <>
      <div className="crumbling-grid">
        {data.entries.map((t, i) => (
          <article className={`old-poster poster-${i % 3}`} key={t.publicId}>
            <span className="poster-stamp">PAST OWNER</span>
            {t.image && (
              <Image src={t.image} width={80} height={80} alt="" unoptimized />
            )}
            <h3>
              <Link href={`/takeover/${t.publicId}`}>{t.name}</Link>
            </h3>
            <p>{t.description}</p>
            <small>
              {new Date(t.since).toISOString().slice(0, 10)} ·{" "}
              {t.until !== null
                ? duration(t.until - t.since) + " on the wall"
                : "Recorded placement"}
            </small>
          </article>
        ))}
      </div>
      {!data.entries.length && <p>No past placements to show yet.</p>}
      {onMore && data.next !== null && (
        <button onClick={() => onMore(data.next!)}>Load older posters</button>
      )}
    </>
  );
}
export function Gazette() {
  const issue = useQuery(api.community.gazette, {});
  if (!issue) return null;
  return (
    <section
      className="wall-gazette"
      id="gazette"
      aria-labelledby="gazette-title"
    >
      <p className="eyebrow">THE TAKE THE WALL GAZETTE · {issue.date} UTC</p>
      <h2 id="gazette-title">{issue.headline}</h2>
      <p className="gazette-story">{issue.body}</p>
      <div className="gazette-columns">
        {issue.entries.map((t) => (
          <article key={t.publicId}>
            <h3>
              <Link href={`/takeover/${t.publicId}`}>{t.name}</Link>
            </h3>
            <p>{t.description}</p>
            <small>
              {new Date(t.since).toISOString().slice(11, 16)} UTC ·{" "}
              {t.until !== null
                ? duration(t.until - t.since) + " reign"
                : "On the wall"}
            </small>
          </article>
        ))}
      </div>
      <p className="field-note">
        An editor-reviewed selection of public placements. Reign durations
        update as placements finish.
      </p>
    </section>
  );
}
export function CommunityEvent() {
  const c = useQuery(api.community.controls, {});
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const e = c?.event;
  if (!e?.enabled || now === null || now >= e.end) return null;
  const live = now >= e.start;
  return (
    <section className="community-event" aria-label="Community hour">
      <p className="eyebrow">
        {live ? "COMMUNITY HOUR · LIVE" : "NEXT COMMUNITY HOUR"}
      </p>
      <h2>{e.title}</h2>
      <p>{e.description}</p>
      <p>
        {new Date(e.start).toISOString().slice(0, 16).replace("T", " ")} UTC
      </p>
      <strong>
        {live ? "Ends in" : "Starts in"}{" "}
        {duration((live ? e.end : e.start) - now)}
      </strong>
      <p className="field-note">
        Takeovers remain $4.99 plus applicable tax. Standard reward rules apply.
      </p>
    </section>
  );
}
