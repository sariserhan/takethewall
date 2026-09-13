const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export function paperBrickSvg({
  name,
  number,
  qr,
  art,
}: {
  name: string;
  number: number | null;
  qr: string;
  art: string | null;
}) {
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(qr))
    throw Error("Invalid QR image.");
  if (
    art &&
    !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(art)
  )
    throw Error("Invalid artwork.");
  const title = escape(name.slice(0, 60));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="190mm" height="235mm" viewBox="0 0 210 260">
 <rect width="210" height="260" fill="white"/>
 <g font-family="Arial,sans-serif" fill="#111"><text x="20" y="20" font-size="9" font-weight="bold">TAKE THE WALL</text><text x="20" y="30" font-size="4.5">YOUR PAPER BRICK · ${number === null ? "HOUSE PLACEMENT" : "TAKEOVER #" + number}</text><text x="20" y="42" font-size="4">${title}</text>
 <text x="20" y="55" font-size="3.5">Print at 100% / actual size on A4 or Letter. No scaling.</text>
 <text x="20" y="61" font-size="3.5">Cut the solid outline. Fold dashed lines inward. Glue the tabs.</text></g>
 <g fill="#f3f3ef" stroke="#111" stroke-width=".35">
 <path d="M20 95H34V81L40 75V69H100V75L106 81V95H180L187 102V123L180 130H106V144L100 150V156H40V150L34 144V130H20Z"/>
 </g>
 <g fill="white"><rect x="20" y="95" width="160" height="35"/><rect x="40" y="75" width="60" height="20"/><rect x="40" y="130" width="60" height="20"/></g>
 ${art ? `<image href="${art}" x="41" y="96" width="58" height="26" preserveAspectRatio="xMidYMid meet"/>` : `<text x="70" y="110" text-anchor="middle" font-family="Arial" font-size="5" font-weight="bold">TAKE THE WALL</text>`}
 <g font-family="Arial,sans-serif" fill="#111"><text x="70" y="127" text-anchor="middle" font-size="2.6">${escape(name.length > 36 ? name.slice(0, 32) + "…" : name)}</text><text x="70" y="85" text-anchor="middle" font-size="4">${number === null ? "THE WALL" : "#" + number}</text><text x="70" y="143" text-anchor="middle" font-size="3.5">ONE WALL. YOUR MOMENT.</text><text x="125" y="106" font-size="3">TAKE</text><text x="125" y="112" font-size="3">THE WALL</text><text x="125" y="123" font-size="2.5">Scan for live wall</text></g>
 <image href="${qr}" x="148" y="98" width="29" height="29"/>
 <g fill="none" stroke="#555" stroke-width=".3" stroke-dasharray="2 1"><path d="M40 95V130M100 95V130M120 95V130M180 95V130M40 95H100M40 130H100M40 75H100M40 150H100M40 75V95M100 75V95M40 130V150M100 130V150"/></g>
 <g font-family="Arial,sans-serif" fill="#555" font-size="2.2"><text x="65" y="73">GLUE</text><text x="65" y="154">GLUE</text><text x="181" y="116" transform="rotate(90 181 116)">GLUE</text></g>
 <g font-family="Arial,sans-serif" fill="#111" font-size="3.7"><text x="20" y="180">1. Cut out the net, keeping all seven glue tabs.</text><text x="20" y="189">2. Score dashed edges with a ruler before folding.</text><text x="20" y="198">3. Wrap the four side faces; glue the end seam.</text><text x="20" y="207">4. Tuck and glue the top and bottom tabs inside.</text><text x="20" y="222">A keepsake of this takeover. The QR opens the live homepage.</text></g>
 <path d="M20 239H70M20 237V241M70 237V241" stroke="#111" stroke-width=".35"/><text x="20" y="248" font-family="Arial" font-size="3">Scale check: this line should measure 45.2 mm.</text></svg>`;
}
