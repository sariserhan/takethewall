const paths = {
  preview:
    "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  hold: "M9 3h6 M12 3v3 M19 6l2 2 M19 14a7 7 0 1 1-14 0 7 7 0 0 1 14 0 M12 10v4l2 2",
  pulse: "M2 12h5l3-8 4 16 3-8h5",
  magnet: "M5 3v10a7 7 0 0 0 14 0V3h-4v10a3 3 0 0 1-6 0V3H5Z M5 7h4 M15 7h4",
  rave: "M12 2v3 M4 5l2 2 M20 5l-2 2 M12 6a8 8 0 1 0 0 16 8 8 0 0 0 0-16 M4 14h16 M6 9h12 M6 19h12 M12 6c-4 4-4 12 0 16 4-4 4-12 0-16",
  sound: "M3 9h4l5-4v14l-5-4H3V9Z M16 8a6 6 0 0 1 0 8 M19 5a10 10 0 0 1 0 14",
  muted: "M3 9h4l5-4v14l-5-4H3V9Z M16 9l6 6 M22 9l-6 6",
  terminal: "M3 4h18v16H3Z M6 8l4 4-4 4 M13 16h5",
  popout: "M13 3h8v8 M21 3l-9 9 M9 3H3v18h18v-6",
  fullscreen: "M9 3H3v6 M15 3h6v6 M21 15v6h-6 M9 21H3v-6",
  collapse: "M3 9h6V3 M15 3v6h6 M21 15h-6v6 M9 21v-6H3",
  share: "M12 16V3 M7 8l5-5 5 5 M5 13H3v8h18v-8h-2",
} as const;
export function WallToolIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg
      className="wall-tool-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
