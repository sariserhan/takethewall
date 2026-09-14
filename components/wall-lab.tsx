"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Dialog } from "./dialog";
import type { LabData, LabPanel } from "./wall-lab-panel";
const Panel = dynamic(() => import("./wall-lab-panel"), {
  loading: () => <p>Loading tool…</p>,
  ssr: false,
});
export function WallLab({ data }: { data: LabData | null }) {
  const [panel, setPanel] = useState<LabPanel | null>(null),
    [dark, setDark] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Read the stored browser preference after hydration.
    setDark(document.documentElement.dataset.wallTheme === "obsidian");
  }, []);
  return (
    <>
      <button
        className="wall-action"
        aria-pressed={dark}
        onClick={() => {
          const next = !dark;
          setDark(next);
          document.documentElement.dataset.wallTheme = next
            ? "obsidian"
            : "paper";
          try {
            localStorage.setItem("ttw-theme", next ? "obsidian" : "paper");
          } catch {}
        }}
      >
        <ToolIcon name="Theme" /> Theme
      </button>
      {(
        [
          "Globe",
          "Radar",
          "Snapshot",
          "Audit",
          "QR Code",
        ] as LabPanel[]
      ).map((name) => (
        <button
          className="wall-action"
          key={name}
          onClick={() => setPanel(name)}
        >
          <ToolIcon name={name} />
          {name}
        </button>
      ))}
      <Dialog
        open={panel !== null}
        onClose={() => setPanel(null)}
        title={panel ?? "Wall tools"}
        wide
      >
        {panel && <Panel key={panel} panel={panel} data={data} />}
      </Dialog>
    </>
  );
}

function ToolIcon({ name }: { name: string }) {
  const paths: Record<string, string> = {
    Theme: "M12 3a9 9 0 1 0 0 18V3Z M12 3a9 9 0 0 1 0 18",
    Retro: "M3 5h18v14H3Z M6 8h12v8H6Z M8 2l4 3 4-3",
    Globe:
      "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M3 12h18 M12 3c-6 5-6 13 0 18 6-5 6-13 0-18",
    Radar: "M12 3a9 9 0 1 0 9 9 M12 7a5 5 0 1 0 5 5 M12 12l8-8 M12 11v2",
    Snapshot: "M3 7h5l2-3h4l2 3h5v13H3Z M16 13a4 4 0 1 0-8 0 4 4 0 0 0 8 0",
    Audit:
      "M10 8l3-3a4 4 0 0 1 6 6l-3 3 M14 16l-3 3a4 4 0 0 1-6-6l3-3 M8 16l8-8",
    "QR Code": "M3 3h6v6H3Z M15 3h6v6h-6Z M3 15h6v6H3Z M15 15h3v3h3v3h-6Z",
    Shatter: "M3 3h18v18H3Z M13 3l-4 7 7 3-5 8 M3 14l6-4 M16 13l5-4",
  };
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
