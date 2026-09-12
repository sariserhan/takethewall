import type { EmailSender } from "./email-routing";
import { emailTemplate, type EmailPresentation } from "./email-template";
export interface TransactionalEmailProvider {
  send(message: {
    sender: EmailSender;
    to: string;
    subject: string;
    body: string;
    key: string;
    presentation?: EmailPresentation;
    oneClickUnsubscribeUrl?: string;
  }): Promise<string | undefined>;
}
export const transactionalEmail: TransactionalEmailProvider = {
  async send(message) {
    if (!process.env.RESEND_API_KEY)
      throw new Error("Email configuration unavailable");
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.key,
      },
      body: JSON.stringify({
        ...message.sender,
        to: [message.to],
        ...(message.oneClickUnsubscribeUrl
          ? {
              headers: {
                "List-Unsubscribe": `<${message.oneClickUnsubscribeUrl}>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
              },
            }
          : {}),
        ...emailTemplate(message.subject, message.body, message.presentation),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`Email HTTP ${r.status}`);
    const result = await r.json().catch(() => null);
    return typeof result?.id === "string" ? result.id : undefined;
  },
};
