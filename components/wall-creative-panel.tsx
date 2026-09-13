"use client";
import { MorseRadio, Theremin } from "./wall-radio";
import { ThermalTrail } from "./wall-discover";
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
    return <MorseRadio message={data?.message || data?.name || ""} />;
  if (panel === "Theremin") return <Theremin />;
  if (panel === "Thermal") return <ThermalTrail />;
  if (panel === "Origami") return <PaperBrick data={data} />;
  if (panel === "Shatter")
    return <WallShatter name={data?.name ?? "THE WALL"} />;
  return null;
}
