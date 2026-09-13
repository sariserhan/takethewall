const alphabet: Record<string, string> = {
  A: ".-",
  B: "-...",
  C: "-.-.",
  D: "-..",
  E: ".",
  F: "..-.",
  G: "--.",
  H: "....",
  I: "..",
  J: ".---",
  K: "-.-",
  L: ".-..",
  M: "--",
  N: "-.",
  O: "---",
  P: ".--.",
  Q: "--.-",
  R: ".-.",
  S: "...",
  T: "-",
  U: "..-",
  V: "...-",
  W: ".--",
  X: "-..-",
  Y: "-.--",
  Z: "--..",
  "0": "-----",
  "1": ".----",
  "2": "..---",
  "3": "...--",
  "4": "....-",
  "5": ".....",
  "6": "-....",
  "7": "--...",
  "8": "---..",
  "9": "----.",
  ".": ".-.-.-",
  ",": "--..--",
  "?": "..--..",
  "!": "-.-.--",
  "'": ".----.",
  "/": "-..-.",
  "-": "-....-",
  "(": "-.--.",
  ")": "-.--.-",
  ":": "---...",
  "=": "-...-",
  "+": ".-.-.",
  "@": ".--.-.",
};
export function encodeMorse(text: string) {
  const words = text
    .slice(0, 160)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .split(/\s+/)
    .map((w) => [...w].map((c) => alphabet[c]).filter(Boolean))
    .filter((w) => w.length);
  let time = 0;
  const tones: { start: number; end: number }[] = [];
  words.forEach((word, wi) => {
    if (wi) time += 7;
    word.forEach((letter, li) => {
      if (li) time += 3;
      [...letter].forEach((symbol, si) => {
        if (si) time += 1;
        const start = time;
        time += symbol === "." ? 1 : 3;
        tones.push({ start, end: time });
      });
    });
  });
  return {
    display: words.map((w) => w.join(" ")).join(" / "),
    tones,
    units: time,
  };
}

export function validateMorseMessage(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (
    typeof value !== "string" ||
    value.length > 120 ||
    [...value].some((c) => c !== " " && !alphabet[c.toUpperCase()])
  )
    throw new Error(
      "Morse message: use up to 120 characters, with A–Z, numbers, spaces, or . , ? ! ' / - ( ) : = + @",
    );
  return value.trim();
}
