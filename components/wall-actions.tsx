"use client";
import { WallToolIcon } from "./wall-tool-icon";
import { useEffect, useState } from "react";
export function WallActions({ name }: { name?: string }) {
  const [fullscreen, setFullscreen] = useState(false);
  const [message, setMessage] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  useEffect(() => {
    const update = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, []);
  return (
    <>
      <button
        className="wall-action"
        aria-pressed={fullscreen}
        onClick={async () => {
          setMessage("");
          try {
            if (document.fullscreenElement) await document.exitFullscreen();
            else if (document.documentElement.requestFullscreen)
              await document.documentElement.requestFullscreen();
            else setMessage("Fullscreen is unavailable in this browser.");
          } catch {
            setMessage("Could not open fullscreen. Please try again.");
          }
        }}
      >
        <WallToolIcon name={fullscreen ? "collapse" : "fullscreen"} />
        {fullscreen ? "Exit fullscreen" : "Fullscreen"}
      </button>
      <button
        className="wall-action"
        onClick={async () => {
          setMessage("");
          setShareUrl("");
          // Share the public homepage only; never include private return tokens.
          const url = new URL("/", window.location.origin).href;
          try {
            if (navigator.share)
              await navigator.share({
                title: "Take The Wall",
                text: name
                  ? `${name} is on the wall. Who takes it next?`
                  : "One wall. One owner. Take The Wall.",
                url,
              });
            else {
              await navigator.clipboard.writeText(url);
              setMessage("Wall link copied.");
            }
          } catch (e) {
            if (e instanceof Error && e.name === "AbortError") return;
            setShareUrl(url);
            setMessage("Copy this wall link to share:");
          }
        }}
      >
        <WallToolIcon name="share" /> Share wall
      </button>
      {message && (
        <p className="wall-action-status" role="status">
          {message} {shareUrl && <a href={shareUrl}>{shareUrl}</a>}
        </p>
      )}
    </>
  );
}
