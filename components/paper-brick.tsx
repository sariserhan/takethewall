"use client";
/* eslint-disable @next/next/no-img-element -- Self-contained generated printable SVG preview. */
import { useEffect, useRef, useState } from "react";
import type { WallSnapshot } from "@/lib/wall-snapshot";
import { paperBrickSvg } from "@/lib/paper-brick";
export function PaperBrick({ data }: { data: (WallSnapshot & { websiteUrl?: string; message?: string }) | null }) {
  const [printUrl, setPrintUrl] = useState("");
  const [svg, setSvg] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [paper, setPaper] = useState("A4");
  const generated = useRef<{ svg: string; html: string } | null>(null),
    [preview, setPreview] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      controller.current?.abort();
      if (generated.current) {
        URL.revokeObjectURL(generated.current.svg);
        URL.revokeObjectURL(generated.current.html);
      }
    },
    [],
  );
  async function generate() {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    controller.current = new AbortController();
    try {
      const qr = await import("qrcode").then((q) =>
        q.toDataURL(new URL("/", location.origin).href, {
          width: 300,
          margin: 4,
          errorCorrectionLevel: "M",
        }),
      );
      let art: string | null = null;
      if (data.logoUrl) {
        const response = await fetch(data.logoUrl, {
          signal: AbortSignal.any([
            controller.current.signal,
            AbortSignal.timeout(5000),
          ]),
        });
        if (!response.ok)
          throw Error("Could not load the artwork. Please try again.");
        const blob = await response.blob();
        if (
          blob.size > 3_000_000 ||
          !["image/png", "image/jpeg", "image/webp"].includes(blob.type)
        )
          throw Error("This artwork cannot be embedded in the paper template.");
        art = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(Error("Could not read artwork."));
          reader.readAsDataURL(blob);
        });
      }
      if (controller.current.signal.aborted) return;
      const result = paperBrickSvg({
        name: data.name,
        detail: data.websiteUrl || data.message || "",
        number: data.number,
        qr,
        art,
      });
      if (generated.current) {
        URL.revokeObjectURL(generated.current.svg);
        URL.revokeObjectURL(generated.current.html);
      }
      const url = URL.createObjectURL(
        new Blob([result], { type: "image/svg+xml" }),
      );
      const html = URL.createObjectURL(
        new Blob(
          [
            `<!doctype html><html><head><title>Take The Wall — Paper Brick</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>@page{size:${paper};margin:10mm}body{margin:0;background:white;color:black;font-family:Arial}svg{display:block;width:190mm;height:235mm}button{margin:16px;padding:12px} @media print{button{display:none}}</style></head><body><button onclick="window.print()">Print / Save as PDF · ${paper}</button>${result}</body></html>`,
          ],
          { type: "text/html" },
        ),
      );
      generated.current = { svg: url, html };
      setPrintUrl(html);
      setSvg(result);
      setPreview(url);
    } catch (e) {
      if (!controller.current?.signal.aborted)
        setError(
          e instanceof Error ? e.message : "Could not build the paper brick.",
        );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="paper-brick">
      <p>
        Make a desk-sized keepsake with the owner’s artwork, takeover number,
        and a QR to the live wall. Fold into a rectangular brick.
      </p>
      <label>
        Paper size
        <select
          disabled={busy}
          value={paper}
          onChange={(e) => {
            setPaper(e.target.value);
            setSvg("");
            setPreview("");
          }}
        >
          <option>A4</option>
          <option>Letter</option>
        </select>
      </label>
      <button
        className="wall-action"
        onClick={() => void generate()}
        disabled={!data || busy}
      >
        {busy ? "Building template…" : "Generate paper brick"}
      </button>
      {error && <p role="alert">{error}</p>}
      {svg && printUrl && (
        <>
          <div className="creative-actions">
            <a href={printUrl} target="_blank" rel="noopener noreferrer">
              Print / Save as PDF · {paper}
            </a>
            <a
              href={preview}
              download={`take-the-wall-${data?.number ?? "house"}-brick.svg`}
            >
              Download fold template
            </a>
          </div>
          <img
            src={preview}
            alt="Printable paper brick: six faces with fold lines and glue tabs"
          />
          <p>
            Print at actual size. Check the ruler before cutting. Use your
            browser’s Save as PDF option for a PDF copy.
          </p>
        </>
      )}
    </section>
  );
}
