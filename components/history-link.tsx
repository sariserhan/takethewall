"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
export function HistoryLink({
  children = "Wall history",
}: {
  children?: React.ReactNode;
}) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void fetch("/api/history/visibility", { cache: "no-store" })
        .then((r) => {
          if (!r.ok) throw Error();
          return r.json();
        })
        .then((data) => {
          if (active) setEnabled(data.enabled === true);
        })
        .catch(() => {
          if (active) setEnabled(false);
        });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return enabled ? <Link href="/history">{children}</Link> : null;
}
