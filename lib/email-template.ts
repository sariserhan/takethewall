import { emailLogo } from "./email-logo";
const escapeHtml = (value: string) =>
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
export function emailTemplate(subject: string, body: string) {
  const title = escapeHtml(subject);
  return {
    subject,
    text: body,
    html: `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>@media only screen and (max-width:620px){.outer{padding:12px!important}.inner{padding:24px!important}.title{font-size:26px!important}.brand{font-size:19px!important}}</style></head>
<body style="margin:0;padding:0;background:#e8e8df;color:#11110f;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#e8e8df;"><tr><td class="outer" align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="600"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;border:1px solid #11110f;background:#f4f3eb;table-layout:fixed;">
<tr><td class="inner" style="padding:28px 32px;background:#d8ff36;border-bottom:1px solid #11110f;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td width="60" style="width:60px;"><img src="cid:takethewall-logo" width="44" height="44" alt="W" style="display:block;border:0;"></td><td class="brand" style="font-size:24px;font-weight:900;letter-spacing:-1px;">TAKE THE WALL</td></tr></table>
</td></tr>
<tr><td class="inner" height="300" valign="top" style="height:300px;padding:32px;vertical-align:top;overflow-wrap:anywhere;word-break:break-word;">
<p style="margin:0 0 18px;font-size:11px;letter-spacing:2px;color:#68685f;">ONE WALL. ONE OWNER.</p>
<h1 class="title" style="margin:0 0 24px;font-size:30px;line-height:1.2;font-weight:900;overflow-wrap:anywhere;">${title}</h1>
<div style="font-size:16px;line-height:1.7;overflow-wrap:anywhere;word-break:break-word;">${bodyHtml(body)}</div>
</td></tr>
<tr><td class="inner" style="padding:22px 32px;border-top:1px solid #babbb0;font-size:12px;line-height:1.6;color:#68685f;">
<strong style="color:#11110f;">Take The Wall</strong><br>This is a service notification from Take The Wall.<br><a href="https://www.takethewall.com" style="color:#11110f;">Visit the wall</a> &nbsp;·&nbsp; <a href="mailto:support@takethewall.com" style="color:#11110f;">Get help</a>
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
