"use client";
import { useState } from "react";
import { MorseRadio } from "./wall-radio";
export function MorseMessageField({
  value,
  fallback,
  onChange,
}: {
  value: string;
  fallback: string;
  onChange: (value: string) => void;
}) {
  const [preview, setPreview] = useState(false);
  return (
    <div>
      <label>
        Optional Morse code message
        <input
          maxLength={120}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your secret transmission"
        />
      </label>
      <p className="field-note">
        Leave a secret transmission for visitors to discover with the Morse
        tool. This message is public. Leave blank to use your description or
        name. {value.length}/120 characters. Use A–Z, numbers, spaces, or . , ?
        ! &apos; / - ( ) : = + @
      </p>
      <button
        type="button"
        onClick={() => setPreview(!preview)}
        aria-expanded={preview}
      >
        {preview ? "Close Morse preview" : "Preview Morse"}
      </button>
      {preview && (
        <MorseRadio key={value || fallback} message={value || fallback} />
      )}
    </div>
  );
}
