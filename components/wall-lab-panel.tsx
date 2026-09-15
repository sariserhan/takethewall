"use client";
/* eslint-disable @next/next/no-img-element -- Generated local QR and snapshot images. */
import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { WallSnapshot } from "@/lib/wall-snapshot";
import { createWallSnapshot } from "@/lib/wall-snapshot";
import { WallRadar } from "./wall-radar";
import { WallGlobe } from "./wall-globe";
export type LabPanel =
  "Globe" | "Radar" | "Takeover Radar" | "Snapshot" | "Audit" | "QR Code";
export type LabData = WallSnapshot & {
  id: Id<"takeovers">;
  contentType: string;
  regions: { regionCode: string; impressions: number }[];
};
export default function WallLabPanel({
  panel,
  data,
}: {
  panel: LabPanel;
  data: LabData | null;
}) {
  if (panel === "QR Code") return <Qr />;
  if (panel === "Audit")
    return (
      <>
        <h3>Content & technical details</h3>
        {data && <Inspect key={data.id} data={data} />}
        <Audit />
      </>
    );
  if (panel === "Radar") return <WallRadar />;
  if (panel === "Takeover Radar") return <WallRadar scope="takeover" />;
  if (panel === "Globe") return <WallGlobe />;
  if (!data) return <p>Waiting for the current wall…</p>;
  if (panel === "Snapshot") return <Snapshot data={data} />;
  return null;
}
function Qr() {
  const [src, setSrc] = useState(""),
    [url, setUrl] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const target = new URL("/?take=1", location.origin).href;
    import("qrcode")
      .then((q) =>
        q.toDataURL(target, {
          width: 360,
          margin: 4,
          errorCorrectionLevel: "M",
          color: { dark: "#000000", light: "#ffffff" },
        }),
      )
      .then((src) => {
        if (alive) {
          setSrc(src);
          setUrl(target);
        }
      })
      .catch(() => {
        if (alive) setError("Could not generate the QR code.");
      });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <section className="qr-panel">
      {src ? (
        <img
          src={src}
          width="360"
          height="360"
          alt="Scan to open takeover checkout"
        />
      ) : (
        <p>{error || "Creating QR code…"}</p>
      )}
      <p>
        Scan with your phone to open checkout. Review your content and confirm
        payment on your phone. Apple Pay and Google Pay appear when supported.
      </p>
      {url && <a href={url}>Open checkout here</a>}
      {url && /^(localhost|127\.0\.0\.1)$/.test(new URL(url).hostname) && (
        <p className="field-note">
          A localhost address only works on this computer. Use the public site
          for phone handoff.
        </p>
      )}
    </section>
  );
}
function Snapshot({ data }: { data: LabData }) {
  const [blob, setBlob] = useState<Blob | null>(null),
    [url, setUrl] = useState(""),
    [status, setStatus] = useState("Creating snapshot…");
  useEffect(() => {
    let active = true,
      objectUrl = "";
    createWallSnapshot(data)
      .then((b) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(b);
        setBlob(b);
        setUrl(objectUrl);
        setStatus(
          "Snapshot captured. Statistics reflect the latest available analytics.",
        );
      })
      .catch(() => {
        if (active)
          setStatus("Could not create this snapshot. Please reopen to retry.");
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // Freeze the card when the panel opens, rather than regenerating on analytics updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <section className="snapshot-panel">
      {url && (
        <>
          <img
            src={url}
            width="1200"
            height="630"
            alt="Shareable snapshot of the current wall"
          />
          <a
            className="button"
            download="take-the-wall-snapshot.png"
            href={url}
          >
            Download PNG
          </a>{" "}
          <button
            onClick={async () => {
              try {
                if (
                  !blob ||
                  !navigator.clipboard?.write ||
                  !window.ClipboardItem
                )
                  throw Error();
                await navigator.clipboard.write([
                  new ClipboardItem({ "image/png": blob }),
                ]);
                setStatus("Image copied.");
              } catch {
                setStatus(
                  "Image copying is unavailable. Use Download PNG instead.",
                );
              }
            }}
          >
            Copy image
          </button>
        </>
      )}
      <p role="status">{status}</p>
    </section>
  );
}
function Audit() {
  const current = useQuery(api.auditTrail.current, {}),
    checkpoints = useQuery(api.auditTrail.checkpoints, {});
  const [after, setAfter] = useState(0);
  const page = useQuery(api.auditTrail.entries, { after }),
    verified = useQuery(api.auditTrail.verify, { after });
  return (
    <section className="audit-panel">
      <p>
        SHA-256 records make changes detectable when compared with trusted
        copies. They do not make a database tamper-proof.
      </p>
      <dl>
        <dt>Current owner’s audit hash</dt>
        <dd>
          {current === undefined
            ? "Loading…"
            : (current?.hash ?? "No audit hash for this placement")}
        </dd>
        <dt>Previous audit hash</dt>
        <dd>{current?.previousHash || "No previous hash available"}</dd>
      </dl>
      <h3>Timestamp checkpoints</h3>
      {!checkpoints ? (
        <p>Loading checkpoints…</p>
      ) : !checkpoints.length ? (
        <p>No timestamp receipt published yet.</p>
      ) : (
        checkpoints.slice(0, 5).map((c) => (
          <p key={c.toNumber}>
            Records {c.fromNumber}–{c.toNumber}: {c.state}{" "}
            {c.proofUrl && (
              <a href={c.proofUrl} target="_blank" rel="noopener noreferrer">
                Download timestamp receipt
              </a>
            )}
          </p>
        ))
      )}
      <p>
        Only a confirmed checkpoint establishes Bitcoin anchoring for its
        covered records.
      </p>
      <h3>Chain records</h3>
      <p>
        {verified
          ? verified.valid
            ? "This page’s stored hashes and links pass server verification."
            : verified.reason
          : "Checking…"}
      </p>
      {page?.numberingOffset ? (
        <p>
          Public numbers include an offset of {page.numberingOffset}; audit
          records use their original sequence.
        </p>
      ) : null}
      <div className="audit-records">
        {page?.entries.map((e) => (
          <details key={e.publicTakeoverId}>
            <summary>
              Record #{e.takeoverNumber} ·{" "}
              {new Date(e.activatedAt).toISOString()}
            </summary>
            <pre>{JSON.stringify(e, null, 2)}</pre>
          </details>
        ))}
      </div>
      {page?.entries.length === 0 && <p>No audit records yet.</p>}
      {after > 0 && (
        <button onClick={() => setAfter(0)}>Back to first records</button>
      )}
      {page?.next && (
        <button onClick={() => setAfter(page.next!)}>Next 100 records</button>
      )}
    </section>
  );
}
function Inspect({ data }: { data: LabData }) {
  const proof = useQuery(api.auditTrail.current, {}),
    [size, setSize] = useState("No image");
  useEffect(() => {
    let active = true;
    if (!data.logoUrl) return;
    const i = new Image();
    i.onload = () => {
      if (active) setSize(`${i.naturalWidth} × ${i.naturalHeight} pixels`);
    };
    i.onerror = () => {
      if (active) setSize("Image dimensions unavailable");
    };
    i.src = data.logoUrl;
    return () => {
      active = false;
    };
  }, [data.logoUrl]);
  return (
    <section className="inspect-panel">
      <p>
        Public metadata for the current wall. No private storage identifiers,
        payment data, or visitor addresses.
      </p>
      <dl>
        <dt>Content</dt>
        <dd>
          {data.name} · {data.contentType}
        </dd>
        <dt>Image dimensions</dt>
        <dd>{size}</dd>
        <dt>Activated at</dt>
        <dd>{new Date(data.activatedAt).toISOString()}</dd>
        <dt>Public ID</dt>
        <dd>{proof?.publicId ?? "Unavailable"}</dd>
      </dl>
      <p>
        Compression ratios, edge latency, and DNS verification are not measured
        here.
      </p>
    </section>
  );
}
