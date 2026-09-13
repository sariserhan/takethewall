"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { HistoryLink } from "./history-link";
import { Dialog } from "./dialog";
import { parseTakeCommand } from "@/lib/terminal-command";
type Snapshot = {
  name: string;
  number: number | null;
  impressions: number;
  visitors: number;
  clicks: number;
};
export function HackerTerminal({
  snapshot,
  connected,
  paused,
  onPrepare,
}: {
  snapshot: Snapshot | null;
  connected: boolean;
  paused: boolean;
  onPrepare: () => void;
}) {
  const [open, setOpen] = useState(false),
    [command, setCommand] = useState(""),
    [lines, setLines] = useState<string[]>([
      "TAKE THE WALL // PUBLIC TERMINAL",
      "Type help for commands. No command charges a payment.",
    ]),
    [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const add = (line: string) => setLines((old) => [...old.slice(-29), line]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.documentElement.dataset.wallFrozen === "on") return;
      const target = e.target as HTMLElement;
      if (target.closest('input,textarea,select,[contenteditable="true"]'))
        return;
      if (document.querySelector("dialog[open]") && !open) return;
      if (
        ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") ||
        e.key === "~"
      ) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);
  function submit() {
    const cmd = command.trim();
    if (!cmd) return;
    setError("");
    setCommand("");
    add("> " + cmd);
    if (cmd === "clear") {
      setLines([]);
      return;
    }
    if (cmd === "help") {
      add(
        'help | status | stats | history | verify | clear | exit | take --title "My SaaS" --url "https://example.com"',
      );
      return;
    }
    if (cmd === "exit") {
      setOpen(false);
      return;
    }
    if (cmd === "history") {
      add(
        "Open Wall History using the link below. Visibility is controlled by the administrator.",
      );
      return;
    }
    if (cmd === "verify") {
      add(
        "Use Reward Rules below to open a milestone and its audit details. This terminal does not claim that a hash is Bitcoin-confirmed.",
      );
      return;
    }
    if (cmd === "status" || cmd === "stats") {
      add(
        snapshot ? JSON.stringify(snapshot) : "Waiting for public wall data.",
      );
      return;
    }
    if (cmd.startsWith("take ")) {
      try {
        if (paused) throw new Error("New checkouts are paused.");
        const draft = parseTakeCommand(cmd);
        sessionStorage.setItem(
          "ttw-draft",
          JSON.stringify({
            ...draft,
            contentType: draft.websiteUrl ? "link" : "personal",
            category: draft.websiteUrl ? "website" : "personal",
            description: "",
            buyerEmail: "",
            weeklyDigestEnabled: false,
            uploadKey: "",
            logoUrl: "",
            requestKey: crypto.randomUUID(),
          }),
        );
        setOpen(false);
        onPrepare();
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not prepare checkout.",
        );
      }
      return;
    }
    setError("Unknown command. Type help.");
  }
  return (
    <>
      <button className="terminal-trigger" onClick={() => setOpen(true)}>
        Terminal <kbd>Ctrl K</kbd>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="WALL TERMINAL">
        <section className="hacker-terminal">
          <div className="terminal-live">
            <span>{connected ? "CONNECTED" : "RECONNECTING"}</span>
            <p>
              {snapshot
                ? `#${snapshot.number ?? "—"} ${snapshot.name}`
                : "Waiting for the wall…"}
            </p>
            <p>
              {snapshot
                ? `${snapshot.impressions} impressions · ${snapshot.visitors} unique visitors · ${snapshot.clicks} clicks`
                : ""}
            </p>
          </div>
          <pre aria-label="Terminal output">{lines.join("\n")}</pre>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label htmlFor="wall-command">Command</label>
            <div className="terminal-command">
              <span aria-hidden="true">&gt;</span>
              <input
                id="wall-command"
                ref={input}
                autoComplete="off"
                spellCheck={false}
                maxLength={600}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
              />
              <button>Run</button>
            </div>
          </form>
          <p role="alert">{error}</p>
          <p>
            take prepares a new draft. Review the content and explicitly confirm
            payment in checkout. $4.99 plus applicable tax.
          </p>
          <nav>
            <HistoryLink>Wall History</HistoryLink>
            <Link href="/rewards">Reward Rules & milestone proofs</Link>
          </nav>
        </section>
      </Dialog>
    </>
  );
}
