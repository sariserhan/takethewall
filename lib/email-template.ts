import { emailLogo } from "./email-logo";
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function bodyHtml(body: string) {
  return body
    .split(/(https?:\/\/[^\s<>"']+)/g)
    .map((part, index) => {
      if (index % 2) {
        const url = part.replace(/[.,;)]+$/, "");
        const suffix = part.slice(url.length);
        return `<a href="${escapeHtml(url)}" style="color:#11110f;text-decoration:underline;word-break:break-all;">${escapeHtml(url)}</a>${escapeHtml(suffix)}`;
      }
      return escapeHtml(part).replace(/\n/g, "<br>");
    })
    .join("");
}
export interface EmailPresentation {
  eyebrow?: string;
  metrics?: { label: string; value: string }[];
  cta?: { label: string; url: string };
  footnote?: string;
  unsubscribeUrl?: string;
}
function safeLink(url: string) {
  if (!/^https?:\/\//.test(url)) throw new Error("Invalid email URL");
  return escapeHtml(url);
}
export function emailTemplate(
  subject: string,
  body: string,
  presentation: EmailPresentation = {},
) {
  const title = escapeHtml(subject);
  const metrics = presentation.metrics?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed;margin:24px 0;border-collapse:collapse;">${Array.from(
        { length: Math.ceil(presentation.metrics.length / 2) },
        (_, i) =>
          `<tr>${presentation
            .metrics!.slice(i * 2, i * 2 + 2)
            .map(
              (m) =>
                `<td width="50%" valign="top" style="padding:16px 12px;border:1px solid #babbb0;"><span style="font-size:11px;text-transform:uppercase;color:#68685f;">${escapeHtml(m.label)}</span><br><strong style="font-size:30px;line-height:1.4;">${escapeHtml(m.value)}</strong></td>`,
            )
            .join("")}</tr>`,
      ).join("")}</table>`
    : "";
  const cta = presentation.cta
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;"><tr><td align="center" bgcolor="#11110f" style="padding:18px;"><a href="${safeLink(presentation.cta.url)}" style="color:#d8ff36;font-size:16px;font-weight:bold;text-decoration:none;display:block;">${escapeHtml(presentation.cta.label)} &rarr;</a></td></tr></table>`
    : "";
  const text =
    body +
    (presentation.metrics?.length
      ? "\n\n" +
        presentation.metrics.map((m) => `${m.label}: ${m.value}`).join("\n")
      : "") +
    (presentation.cta
      ? `\n\n${presentation.cta.label}: ${presentation.cta.url}`
      : "") +
    (presentation.footnote ? "\n\n" + presentation.footnote : "") +
    (presentation.unsubscribeUrl
      ? `\n\nUnsubscribe from weekly summaries: ${presentation.unsubscribeUrl}`
      : "");
  return {
    subject,
    text,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>@media only screen and (max-width:620px){.outer{padding:12px!important}.inner{padding:24px!important}.title{font-size:26px!important}.brand{font-size:19px!important}}</style></head>
<body style="margin:0;padding:0;background:#e8e8df;color:#11110f;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e8e8df;"><tr><td class="outer" align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;border:1px solid #11110f;background:#f4f3eb;table-layout:fixed;">
<tr><td class="inner" style="padding:28px 32px;background:#d8ff36;border-bottom:1px solid #11110f;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="60" style="width:60px;"><img src="cid:takethewall-logo" width="44" height="44" alt="W" style="display:block;border:0;"></td><td class="brand" style="font-size:24px;font-weight:900;letter-spacing:-1px;">TAKE THE WALL</td></tr></table>
</td></tr>
<tr><td class="inner" height="300" valign="top" style="height:300px;padding:32px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;">
<p style="margin:0 0 18px;font-size:11px;letter-spacing:2px;color:#68685f;">${escapeHtml(presentation.eyebrow ?? "ONE WALL. ONE OWNER.")}</p>
<h1 class="title" style="margin:0 0 24px;font-size:30px;line-height:1.2;font-weight:900;overflow-wrap:anywhere;">${title}</h1>
<div style="font-size:16px;line-height:1.7;overflow-wrap:anywhere;word-break:break-word;">${bodyHtml(body)}</div>
${metrics}${cta}
${presentation.footnote ? `<p style="font-size:12px;line-height:1.6;color:#68685f;">${escapeHtml(presentation.footnote)}</p>` : ""}
</td></tr>
<tr><td class="inner" style="padding:22px 32px;border-top:1px solid #babbb0;font-size:12px;line-height:1.6;color:#68685f;">
<strong style="color:#11110f;">Take The Wall</strong><br>This is a service notification from Take The Wall.<br><a href="https://www.takethewall.com" style="color:#11110f;">Visit the wall</a> &nbsp;·&nbsp; <a href="mailto:support@takethewall.com" style="color:#11110f;">Get help</a>${presentation.unsubscribeUrl ? `<br><a href="${safeLink(presentation.unsubscribeUrl)}" style="color:#68685f;">Unsubscribe from weekly summaries</a>` : ""}
</td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`,
    attachments: [
      {
        filename: "takethewall-logo.png",
        content: emailLogo,
        content_type: "image/png",
        content_id: "takethewall-logo",
      },
    ],
  };
}
