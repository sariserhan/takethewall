"use client";
import { MorseRadio } from "./wall-radio";
import { PaperBrick } from "./paper-brick";
import { WallShatter } from "./wall-shatter";
import type { CreativePanel, CreativeData } from "./wall-creative-tools";
export default function CreativePanelContent({
  panel,
  data,
}: {
  panel: CreativePanel;
  data: CreativeData | null;
}) {
  if (panel === "Morse")
    return <MorseRadio key={`${data?.id}:${data?.morseMessage ?? data?.message}`} message={data?.morseMessage || data?.message || data?.name || ""} />;
  if (panel === "Origami") return <PaperBrick data={data} />;
  if (panel === "Shatter")
    return <WallShatter name={data?.name ?? "THE WALL"} />;
  return null;
}
