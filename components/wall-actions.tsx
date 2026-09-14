"use client";
import { WallToolIcon } from "./wall-tool-icon";
import { useEffect, useState } from "react";
export function WallActions() {
  const [fullscreen, setFullscreen] = useState(false);
  const [message, setMessage] = useState("");
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
      {message && (
        <p className="wall-action-status" role="status">
          {message}
        </p>
      )}
    </>
  );
}
