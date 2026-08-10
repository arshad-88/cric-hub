import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";
import { internal } from "../_generated/api";

/**
 * The @convex-dev/auth runtime calls sendVerificationRequest with a Convex
 * action ctx as its second argument (see the library's signIn implementation),
 * but the public EmailConfig type only declares the first parameter. We type
 * the ctx minimally here so we can hand delivery off to the Node-runtime
 * Gmail SMTP action in emails.ts (the "From" address is the organizer's own
 * Gmail inbox — no Freebuff relay involved).
 */
type SendCtx = {
  runAction: (fn: unknown, args: unknown) => Promise<unknown>;
};

async function sendVerificationRequest(
  { identifier: email, token }: { identifier: string; token: string },
  ctx: SendCtx,
): Promise<void> {
  try {
    await ctx.runAction(internal.emails.sendOtp, {
      to: email,
      otp: token,
      appName: process.env.VLY_APP_NAME,
    });
  } catch (error) {
    // Surface a readable message instead of a raw JSON dump of the error
    // object (that garbage would show up in the sign-in form).
    const detail =
      error instanceof Error ? error.message : "unknown error";
    throw new Error(`Could not deliver the sign-in code: ${detail}`);
  }
}

export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  // This function can be asynchronous
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  // The runtime passes (params, ctx) — cast the narrower public signature away.
  sendVerificationRequest: sendVerificationRequest as never,
});
