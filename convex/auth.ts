import { emailSender } from "../lib/email-routing";
import { emailTemplate } from "../lib/email-template";
import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { betterAuth } from "better-auth/minimal";
import { emailOTP } from "better-auth/plugins";
import { components } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import authConfig from "./auth.config";
export const authComponent = createClient<DataModel>(components.betterAuth);
const allowed = (email: string) =>
  (process.env.ADMIN_EMAILS ?? "")
    .toLowerCase()
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .includes(email.toLowerCase());
export const createAuth = (ctx: GenericCtx<DataModel>) =>
  betterAuth({
    baseURL: process.env.SITE_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: authComponent.adapter(ctx),
    emailAndPassword: { enabled: false },
    session: { expiresIn: 12 * 3600, updateAge: 3600 },
    rateLimit: { enabled: true, window: 60, max: 20, storage: "database" },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!allowed(user.email)) return false;
            return { data: user };
          },
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: "hashed",
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== "sign-in" || !allowed(email)) return;
          if (!process.env.RESEND_API_KEY)
            throw new Error("Admin email delivery is not configured");
          const r = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              ...emailSender("account"),
              to: [email],
              ...emailTemplate(
                "Your administrator sign-in code",
                `Your administrator verification code is ${otp}.\n\nIt expires in ten minutes. Do not share it.`,
              ),
            }),
            signal: AbortSignal.timeout(10000),
          });
          if (!r.ok) throw new Error("Admin email delivery failed");
        },
      }),
      convex({
        authConfig,
        jwt: {
          definePayload: ({ user }) => ({
            email: user.email,
            email_verified: user.emailVerified,
          }),
        },
      }),
    ],
  });
