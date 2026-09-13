export type WallSnapshot = {
  name: string;
  logoUrl: string | null;
  activatedAt: number;
  visitors: number;
  number: number | null;
  includesDemo: boolean;
};
export async function createWallSnapshot(s: WallSnapshot): Promise<Blob> {
  const at = Date.now();
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const c = canvas.getContext("2d");
  if (!c) throw Error("Image generation is unavailable.");
  c.fillStyle = "#080a06";
  c.fillRect(0, 0, 1200, 630);
  c.strokeStyle = "#d8ff36";
  c.lineWidth = 2;
  c.strokeRect(24, 24, 1152, 582);
  c.fillStyle = "#d8ff36";
  c.font = "bold 24px sans-serif";
  c.fillText("TAKE THE WALL · LIVE SNAPSHOT", 55, 76);
  let logo: HTMLImageElement | null = null;
  if (s.logoUrl) {
    logo = await new Promise<HTMLImageElement | null>((resolve) => {
      const i = new Image();
      i.crossOrigin = "anonymous";
      const timer = setTimeout(() => resolve(null), 3000);
      i.onload = () => {
        clearTimeout(timer);
        resolve(i);
      };
      i.onerror = () => {
        clearTimeout(timer);
        resolve(null);
      };
      i.src = s.logoUrl!;
    });
  }
  if (logo) {
    const scale = Math.min(180 / logo.width, 180 / logo.height);
    c.drawImage(logo, 55, 120, logo.width * scale, logo.height * scale);
  }
  const x = logo ? 270 : 55,
    max = 1145 - x;
  let size = 64;
  c.font = `bold ${size}px sans-serif`;
  while (c.measureText(s.name).width > max && size > 24) {
    size--;
    c.font = `bold ${size}px sans-serif`;
  }
  const label = s.name.length > 90 ? s.name.slice(0, 87) + "…" : s.name;
  c.fillStyle = "#f4f3eb";
  c.fillText(label, x, 200, max);
  c.font = "24px sans-serif";
  c.fillText(
    s.number === null ? "Current wall owner" : `TAKEOVER #${s.number}`,
    x,
    255,
  );
  const seconds = Math.max(0, Math.floor((at - s.activatedAt) / 1000));
  const clock = [
    Math.floor(seconds / 3600),
    Math.floor(seconds / 60) % 60,
    seconds % 60,
  ]
    .map((n) => String(n).padStart(2, "0"))
    .join(":");
  c.fillStyle = "#d8ff36";
  c.font = "bold 54px monospace";
  c.fillText(clock, 55, 400);
  c.fillText(s.visitors.toLocaleString("en-US"), 650, 400);
  c.font = "18px sans-serif";
  c.fillStyle = "#f4f3eb";
  c.fillText("REIGN · HH:MM:SS", 55, 442);
  c.fillText(
    "UNIQUE VISITORS" + (s.includesDemo ? " · INCLUDES DEMO" : ""),
    650,
    442,
  );
  c.font = "18px monospace";
  c.fillText(
    new Date(at).toISOString().replace("T", " ").slice(0, 19) + " UTC",
    55,
    530,
  );
  c.fillText("takethewall.com", 55, 565);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(Error("Could not create snapshot."))),
      "image/png",
    ),
  );
}
