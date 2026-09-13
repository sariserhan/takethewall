"use client";
import dynamic from "next/dynamic";
import {
  setInteractionMode,
  useInteractionMode,
} from "./wall-interaction-mode";
import { setBlacklight, useBlacklight } from "./wall-blacklight";
import { useEffect, useState } from "react";
import { Dialog } from "./dialog";
import { WallFreeze } from "./wall-freeze";
import type { WallSnapshot } from "@/lib/wall-snapshot";
const Panel = dynamic(() => import("./wall-creative-panel"), {
  ssr: false,
  loading: () => <p>Opening experiment…</p>,
});
export type CreativePanel =
  | "Atmosphere"
  | "Decade Warp"
  | "Thermal"
  | "Morse"
  | "Blacklight"
  | "Theremin"
  | "Origami"
  | "Shatter";
export type CreativeData = WallSnapshot & {
  id: string;
  message: string;
  morseMessage?: string;
};
export function WallCreativeTools({ data }: { data: CreativeData | null }) {
  const blacklight = useBlacklight();
  const interaction = useInteractionMode();
  const [panel, setPanel] = useState<CreativePanel | null>(null),
    [sky, setSky] = useState("clear"),
    [era, setEra] = useState("present"),
    [retro, setRetro] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.wallEra = era;
    document.documentElement.dataset.wallRetro = retro ? "on" : "off";
    return () => {
      delete document.documentElement.dataset.wallEra;
      delete document.documentElement.dataset.wallRetro;
    };
  }, [era, retro]);
  return (
    <>
      {(
        [
          "Atmosphere",
          "Decade Warp",
          "Thermal",
          "Morse",
          "Blacklight",
          "Theremin",
          "Origami",
          "Shatter",
        ] as CreativePanel[]
      ).map((name) => (
        <button
          className="wall-action"
          key={name}
          aria-pressed={
            name === "Blacklight"
              ? blacklight
              : name === "Thermal"
                ? interaction === "thermal"
                : name === "Theremin"
                  ? interaction === "theremin"
                  : undefined
          }
          onClick={() => {
            if (name === "Blacklight") setBlacklight(!blacklight);
            else if (name === "Thermal" || name === "Theremin") {
              const mode = name === "Thermal" ? "thermal" : "theremin";
              setInteractionMode(interaction === mode ? "off" : mode);
            } else setPanel(name);
          }}
        >
          <CreativeIcon name={name} />
          {name}
        </button>
      ))}
      <button
        className="wall-action"
        aria-pressed={retro}
        onClick={() => {
          setRetro(!retro);
          setEra("present");
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path d="M3 5h18v14H3Z M6 8h12v8H6Z M8 2l4 3 4-3" />
        </svg>
        Retro
      </button>
      <WallFreeze name={data?.name} />
      {sky !== "clear" && (
        <div className={`wall-atmosphere atmosphere-${sky}`} aria-hidden="true">
          {Array.from({ length: sky === "fog" ? 3 : 28 }, (_, i) => (
            <i
              key={i}
              style={{
                left: `${(i * 37) % 101}%`,
                animationDelay: `-${i * 0.37}s`,
                animationDuration: `${sky === "snow" ? 7 + (i % 5) : sky === "fog" ? 20 : 0.7 + (i % 4) * 0.15}s`,
              }}
            />
          ))}
        </div>
      )}
      <Dialog
        open={panel !== null}
        onClose={() => setPanel(null)}
        title={panel ?? "Experiments"}
        wide
      >
        {panel === "Atmosphere" ? (
          <section>
            <p>
              Choose a local visual atmosphere. This is not a live weather
              report or the owner’s location.
            </p>
            <div className="creative-actions">
              {["clear", "rain", "snow", "fog"].map((value) => (
                <button
                  key={value}
                  aria-pressed={sky === value}
                  onClick={() => setSky(value)}
                >
                  {value === "clear"
                    ? "Clear / off"
                    : value[0].toUpperCase() + value.slice(1)}
                </button>
              ))}
            </div>
          </section>
        ) : panel === "Decade Warp" ? (
          <section>
            <p>
              Travel through web aesthetics. Your purchases and the current
              owner remain the same.
            </p>
            <div className="creative-actions">
              {[
                ["present", "Present day"],
                ["1984", "1984 · Monochrome"],
                ["1996", "1996 · Early web"],
                ["2077", "2077 · Neon future"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={era === value}
                  onClick={() => {
                    setEra(value);
                    setRetro(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <p>
              For CRT scanlines and the recording badge, use the separate Retro
              button in Playground. Selecting an era turns Retro off.
            </p>
            <p>Motion effects respect your reduced-motion preference.</p>
          </section>
        ) : (
          panel && (
            <Panel
              key={`${panel}:${data?.id ?? "empty"}`}
              panel={panel}
              data={data}
            />
          )
        )}
      </Dialog>
    </>
  );
}
function CreativeIcon({ name }: { name: CreativePanel }) {
  const paths: Record<CreativePanel, string> = {
    Atmosphere:
      "M6 16a5 5 0 1 1 2-9 6 6 0 1 1 10 9H6 M7 19l-1 3 M12 19l-1 3 M17 19l-1 3",
    "Decade Warp": "M12 3a9 9 0 1 0 9 9 M12 7v5l4 2 M17 3h5v5 M22 3l-6 6",
    Thermal: "M12 2c2 6 7 7 7 12a7 7 0 0 1-14 0c0-3 2-5 4-7 0 4 3 4 3-5Z",
    Morse: "M3 7h18v14H3Z M6 4l12-2 M7 11h10 M7 16h1 M12 16h5",
    Blacklight: "M7 3h10v6l-3 4v8h-4v-8L7 9V3Z M7 7h10",
    Theremin: "M3 5h18v15H3Z M7 5v15 M12 5v15 M17 5v15 M5 5v8 M10 5v8 M15 5v8",
    Origami:
      "M12 2l10 6v9l-10 5L2 17V8L12 2Z M2 8l10 5 10-5 M12 13v9 M7 5l10 6",
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
