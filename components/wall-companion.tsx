"use client";
import { WallToolIcon } from "./wall-tool-icon";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ConvexProvider, useQuery } from "convex/react";
import Image from "next/image";
import { api } from "@/convex/_generated/api";
import { publicConvexClient } from "@/lib/convex-client";
export function PopOutWall() {
  const popup = useRef<Window | null>(null);
  const [message, setMessage] = useState("");
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  useEffect(
    () => () => {
      popup.current?.close();
    },
    [],
  );
  return (
    <>
      {pipWindow && createPortal(<Companion />, pipWindow.document.body)}
      <button
        className="popout-trigger"
        onClick={async () => {
          setMessage("");
          if (popup.current && !popup.current.closed) {
            popup.current.focus();
            return;
          }
          const pip = (
            window as Window & {
              documentPictureInPicture?: {
                requestWindow: (options: {
                  width: number;
                  height: number;
                }) => Promise<Window>;
              };
            }
          ).documentPictureInPicture;
          try {
            if (pip) {
              const w = await pip.requestWindow({ width: 400, height: 440 });
              popup.current = w;
              w.document.title = "Take The Wall companion";
              w.document.body.style.margin = "0";
              for (const sheet of document.querySelectorAll(
                'link[rel="stylesheet"]',
              )) {
                const link = w.document.createElement("link");
                link.rel = "stylesheet";
                link.href = (sheet as HTMLLinkElement).href;
                w.document.head.append(link);
              }
              setPipWindow(w);
              w.addEventListener("pagehide", () => setPipWindow(null), {
                once: true,
              });
            } else {
              const w = window.open(
                "/companion",
                "ttw-companion",
                "popup,width=400,height=440",
              );
              if (!w) throw Error();
              w.opener = null;
              popup.current = w;
            }
          } catch {
            setMessage(
              "Could not open the mini-window. Use the companion link instead.",
            );
          }
        }}
      >
        <WallToolIcon name="popout" /> Pop out wall
      </button>
      {message && (
        <p role="status">
          {message}{" "}
          <a href="/companion" target="_blank" rel="noopener noreferrer">
            Open companion
          </a>
        </p>
      )}
    </>
  );
}
export function Companion() {
  const [client] = useState(publicConvexClient);
  return client ? (
    <ConvexProvider client={client}>
      <LiveCompanion />
    </ConvexProvider>
  ) : (
    <p>Live wall unavailable.</p>
  );
}
function LiveCompanion() {
  const data = useQuery(api.wall.current);
  const owner = data?.owner;
  return (
    <main className="wall-companion">
      <p className="eyebrow">TAKE THE WALL · LIVE COMPANION</p>
      {owner ? (
        <>
          <h1>{owner.displayName || owner.domain}</h1>
          {owner.logoUrl && (
            <Image
              src={owner.logoUrl}
              width={100}
              height={100}
              alt=""
              unoptimized
            />
          )}
          <p>{owner.description}</p>
          <p>
            Takeover{" "}
            {owner.takeoverNumber !== null ? `#${owner.takeoverNumber}` : ""}
          </p>
        </>
      ) : (
        <p>Connecting to the wall…</p>
      )}
      <a href="/" target="_blank" rel="noopener noreferrer">
        Open the full wall →
      </a>
    </main>
  );
}
