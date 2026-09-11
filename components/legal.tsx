"use client";
import Link from "next/link";
import { Dialog } from "./dialog";
import { publicCopy } from "@/lib/public-copy";
export type LegalPage = "Terms" | "Privacy" | "Content policy";
export function Legal({
  page,
  onClose,
}: {
  page: LegalPage | null;
  onClose: () => void;
}) {
  const key = page === "Privacy" ? "privacy" : "terms";
  const copy = publicCopy[key];
  const sections =
    page === "Content policy"
      ? copy.sections.filter((s) => s.title.startsWith("Content"))
      : copy.sections;
  return (
    <Dialog open={!!page} title={page ?? "Legal"} onClose={onClose}>
      <div className="legal-copy">
        {sections.map((s) => (
          <section key={s.title}>
            <h3>{s.title}</h3>
            <p>{s.body}</p>
          </section>
        ))}
        <Link href={`/${key}`}>Read the full {key} page</Link>
      </div>
    </Dialog>
  );
}
