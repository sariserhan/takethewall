"use client";
import { useState } from "react";

export function FounderLaunchKit() {
  const [channel, setChannel] = useState("personal");
  const [project, setProject] = useState("");
  const [message, setMessage] = useState("");
  const params = new URLSearchParams({
    utm_source: channel,
    utm_medium: channel === "personal" ? "outreach" : "social",
    utm_campaign: "founder_pilot",
    utm_content: "invitation",
  });
  const link = `https://takethewall.com/?${params}`;
  const draft = `I built Take The Wall: one public wall, one owner at a time. You can design your own placement with images, text, and links for $4.99 plus applicable tax. It stays until the next takeover replaces it. There’s no guaranteed audience or minimum duration.\n\n${project.trim() ? `Would you try it with ${project.trim()}?` : "Would you try it with your project?"} I’m inviting a few founders to help shape the experience, and I’d love to hear what’s clear or confusing.\n\n${link}`;
  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage(`${label} copied. Review and personalize it before sending.`);
    } catch {
      setMessage("Select the text below and copy it manually.");
    }
  }
  return (
    <details className="founder-launch-kit" open>
      <summary>Start a small founder launch</summary>
      <p>Invite 3–5 relevant creators first. Collect feedback, fix the biggest obstacle, then invite the next group.</p>
      <div className="founder-launch-fields">
        <label>Channel
          <select aria-label="Channel" value={channel} onChange={e => { setChannel(e.target.value); setMessage(""); }}>
            <option value="personal">Personal invitation</option>
            <option value="x">X</option>
            <option value="linkedin">LinkedIn</option>
          </select>
        </label>
        <label>Project name (optional)
          <input value={project} maxLength={100} onChange={e => { setProject(e.target.value); setMessage(""); }} placeholder="Their project" />
        </label>
      </div>
      <label>Trackable homepage link
        <input readOnly value={link} onFocus={e => e.target.select()} />
      </label>
      <label>Invitation draft
        <textarea readOnly rows={8} value={draft} onFocus={e => e.target.select()} />
      </label>
      <div className="owner-share-actions">
        <button type="button" onClick={() => void copy(link, "Link")}>Copy launch link</button>
        <button type="button" onClick={() => void copy(draft, "Invitation")}>Copy invitation</button>
        <a className="button" href="/launch/founder-pilot-results.csv" download>Download results sheet</a>
      </div>
      <p role="status">{message}</p>
      <ol>
        <li>Personalize the opening with something you actually tried in their project.</li>
        <li>Ask: “What did you think you were buying? Where did you hesitate?”</li>
        <li>Check Admin → Funnel for visits, checkouts created, and paid activations. Review owner responses here in Growth.</li>
      </ol>
      <p className="field-note">These are drafts; nothing is sent automatically. Channel links identify traffic in analytics. The funnel measures site-wide activity, not purchases attributed to an individual invitation. Keep recipient contact details in your private outreach records.</p>
    </details>
  );
}
