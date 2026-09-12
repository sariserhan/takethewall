import { emailTemplate } from "./email-template";
export interface TransactionalEmailProvider {
  send(message: {
    to: string;
    subject: string;
    body: string;
    key: string;
  }): Promise<void>;
}
export const transactionalEmail: TransactionalEmailProvider = {
  async send(message) {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM)
      throw new Error("Email configuration unavailable");
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": message.key,
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to: [message.to],
        ...emailTemplate(message.subject, message.body),
        reply_to: process.env.SUPPORT_EMAIL ?? "support@takethewall.com",
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error(`Email HTTP ${r.status}`);
  },
};
