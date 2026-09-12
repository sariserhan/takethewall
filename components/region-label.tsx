import Image from "next/image";
import { flagCodes } from "@/lib/flag-codes";
export function RegionLabel({ code }: { code: string }) {
  const normalized = code.trim().toLowerCase();
  const country = normalized === "uk" ? "gb" : normalized;
  const supported = flagCodes.has(country);
  const label = supported
    ? country.toUpperCase()
    : normalized === "other"
      ? "Other"
      : "Unknown";
  return (
    <span className="region-label">
      {supported ? (
        <Image
          className="region-flag"
          src={`/flags/${country}.svg`}
          width={20}
          height={15}
          alt=""
          aria-hidden="true"
          unoptimized
        />
      ) : (
        <svg
          className="region-globe"
          aria-hidden="true"
          width="20"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="12" cy="12" r="9" />
          <ellipse cx="12" cy="12" rx="4" ry="9" />
          <path d="M3 12h18" />
        </svg>
      )}
      <span>{label}</span>
    </span>
  );
}
