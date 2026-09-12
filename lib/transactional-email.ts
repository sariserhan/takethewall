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
  }): Promise<void>;
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
        ...emailTemplate(message.subject, message.body, message.presentation),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`Email HTTP ${r.status}`);
  },
};
