"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Dialog } from "./dialog";
import { publicCopy, legalVersion } from "@/lib/public-copy";
import { ContactForm } from "./contact-form";
import { PrizeGuide } from "./prize-explainer";
import { RewardRules } from "./milestones";
const titles: Record<string, string> = {
  "how-it-works": "How it works",
  "how-prizes-work": "How prizes work",
  about: "About",
  support: "Support",
  contact: "Contact",
  rewards: "Reward Rules",
  numbers: "About the numbers",
  terms: "Terms",
  privacy: "Privacy",
  "content-policy": "Content policy",
  disclaimer: "Disclaimer",
  disclosure: "Disclosure",
};
export function InfoOverlay() {
  const [page, setPage] = useState<string | null>(null);
  const [version, setVersion] = useState<string | undefined>();
  useEffect(() => {
    function sync() {
      const params = new URLSearchParams(window.location.search),
        key = params.get("info");
      setPage(key && titles[key] ? key : null);
      setVersion(params.get("version") ?? undefined);
    }
    function click(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = (event.target as Element).closest?.("a");
      if (!link) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const key =
        url.pathname === "/"
          ? url.searchParams.get("info")
          : url.pathname.slice(1);
      if (!key || !titles[key]) return;
      event.preventDefault();
      const current = new URL(window.location.href);
      current.searchParams.set("info", key);
      if (url.searchParams.has("version"))
        current.searchParams.set("version", url.searchParams.get("version")!);
      else current.searchParams.delete("version");
      window.history.pushState(null, "", current.pathname + current.search);
      sync();
    }
    sync();
    document.addEventListener("click", click, true);
    window.addEventListener("popstate", sync);
    return () => {
      document.removeEventListener("click", click, true);
      window.removeEventListener("popstate", sync);
    };
  }, []);
  function close() {
    const url = new URL(window.location.href);
    url.searchParams.delete("info");
    url.searchParams.delete("version");
    window.history.replaceState(null, "", url.pathname + url.search);
    setPage(null);
  }
  const copy = page
    ? publicCopy[page === "content-policy" ? "terms" : page]
    : null;
  return (
    <Dialog
      open={!!page}
      title={page ? titles[page] : "Information"}
      onClose={close}
    >
      <div className="info-copy">
        {page === "how-prizes-work" ? (
          <PrizeGuide />
        ) : page === "how-it-works" ? (
          <>
            <p>
              One wall. One owner. Your moment starts with a $3.99 purchase.
            </p>
            <ol className="how-it-works">
              <li>
                <h3>Choose what goes on the wall</h3>
                <p>
                  Share a website, app, social profile, yourself, or a short
                  message. Add an image if you want—every placement works
                  without one.
                </p>
              </li>
              <li>
                <h3>Preview it, then pay $3.99</h3>
                <p>
                  No account needed. Pay through Stripe Checkout. Opening
                  Checkout does not reserve a takeover number.
                </p>
              </li>
              <li>
                <h3>Take the whole wall</h3>
                <p>
                  Your verified payment activates your placement. It stays until
                  the next successful purchase replaces it. There is no
                  guaranteed duration, traffic, or clicks.
                </p>
              </li>
              <li>
                <h3>Follow your place in history</h3>
                <p>
                  Paid activations and counted admin-issued placements get a
                  number. Milestone rewards, where available, require
                  eligibility review and confirmed payout.{" "}
                  <Link href="/?info=rewards">Read the Reward Rules</Link>.
                </p>
              </li>
            </ol>
          </>
        ) : page === "numbers" ? (
          <>
            <p>
              Estimated browsers, not verified people. Daily counts reset at
              midnight UTC. Clearing storage can create another visitor. Bot
              filtering is best effort.
            </p>
            <p>
              Clicks can exceed impressions; CTR is not capped. Paid activations
              and explicitly counted admin-issued placements count as takeovers.
              Admin-issued entries record $0 collected. House placements and
              moderation restorations do not receive a paid number.
            </p>
            <p>
              Live counters come from Convex. VisitorPing provides separate
              aggregate reports; its totals are not added to the live counters.
              Custom-event reports include server-relayed events, using our
              traffic checks rather than VisitorPing’s server bot classification.
            </p>
          </>
        ) : page === "contact" ? (
          <>
            <p>Ask a question, report content, or get help with a purchase.</p>
            <ContactForm />
          </>
        ) : page === "rewards" ? (
          <RewardRules version={version} />
        ) : copy ? (
          <>
            <p>{copy.intro}</p>
            {["terms", "privacy", "disclaimer", "disclosure"].includes(
              page!,
            ) && <p className="eyebrow">VERSION {legalVersion}</p>}
            {copy.sections
              .filter(
                (s) =>
                  page !== "content-policy" || s.title.startsWith("Content"),
              )
              .map((s) => (
                <section key={s.title}>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                </section>
              ))}
            {page === "support" && (
              <Link href="/?info=contact">Contact support →</Link>
            )}
          </>
        ) : null}
      </div>
    </Dialog>
  );
}
