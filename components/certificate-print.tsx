"use client";
export function CertificatePrint() {
  return (
    <button className="button" onClick={() => window.print()}>
      Print / Save as PDF
    </button>
  );
}
