export function validatePrivateDocument(bytes: Uint8Array, type: string) {
  if (!bytes.length || bytes.length > 10 * 1024 * 1024)
    throw new Error("Document must be 1 byte–10 MB");
  const prefix = new TextDecoder().decode(bytes.slice(0, 12));
  const valid =
    type === "application/pdf"
      ? prefix.startsWith("%PDF-")
      : type === "image/png"
        ? bytes[0] === 137 && prefix.slice(1, 4) === "PNG"
        : type === "image/jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : type === "image/webp"
            ? prefix.startsWith("RIFF") && prefix.slice(8, 12) === "WEBP"
            : false;
  if (!valid) throw new Error("Use a PDF, PNG, JPEG, or WEBP document");
}
