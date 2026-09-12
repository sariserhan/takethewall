"use client";
import {
  ConvexBetterAuthProvider,
  type AuthClient,
} from "@convex-dev/better-auth/react";
import {
  ConvexReactClient,
  Authenticated,
  Unauthenticated,
  AuthLoading,
} from "convex/react";
import { useState } from "react";
import { LoadingSkeleton } from "./loading-skeleton";
import { authClient } from "@/lib/auth-client";
// The component 0.12.5 provider type widens plugin session inference to never;
// the concrete client retains its verified Better Auth session methods.
export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!),
  );
  return (
    <ConvexBetterAuthProvider
      client={client}
      authClient={authClient as unknown as AuthClient}
    >
      <AuthLoading>
        <LoadingSkeleton label="Verifying administrator session" />
      </AuthLoading>
      <Unauthenticated>
        <AdminSignIn />
      </Unauthenticated>
      <Authenticated>
        <button onClick={() => void authClient.signOut()}>Sign out</button>
        {children}
      </Authenticated>
    </ConvexBetterAuthProvider>
  );
}
function AdminSignIn() {
  const [email, setEmail] = useState(""),
    [otp, setOtp] = useState(""),
    [sent, setSent] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="document-page">
      <h1>ADMIN SIGN IN</h1>
      <p>
        Only authorized administrators can sign in. Public wall purchases do not
        require an account.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            if (!sent) {
              const r = await authClient.emailOtp.sendVerificationOtp({
                email,
                type: "sign-in",
              });
              if (r.error)
                throw new Error("Unable to send a verification code");
              setSent(true);
              setError("If this address is authorized, a code is on its way.");
            } else {
              const r = await authClient.signIn.emailOtp({ email, otp });
              if (r.error) throw new Error("Code invalid or expired");
              setError("");
            }
          } catch (e) {
            setError(e instanceof Error ? e.message : "Sign-in failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          Administrator email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setSent(false);
            }}
          />
        </label>
        {sent && (
          <label>
            Verification code
            <input
              required
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoComplete="one-time-code"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />
          </label>
        )}
        <button disabled={busy}>
          {sent ? "Verify administrator" : "Email sign-in code"}
        </button>
        {sent && (
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setOtp("");
            }}
          >
            Request another code
          </button>
        )}
        <p role="status">{error}</p>
      </form>
    </section>
  );
}
