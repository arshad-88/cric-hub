// ---------------------------------------------------------------------------
// emails.ts — outbound email delivery for the platform (Node runtime).
//
// Sends OTP / verification emails through the organizer's own Gmail account
// over SMTP (nodemailer). This replaces the previous Freebuff relay so the
// "From" address is the real Gmail inbox the user controls.
//
// Configuration (set in the project's Keys/API keys tab, NOT committed):
//   GMAIL_SMTP_USER  — sender address, defaults to hw900860@gmail.com
//   GMAIL_SMTP_PASS  — Gmail App Password for that account (required)
// ---------------------------------------------------------------------------

"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import nodemailer from "nodemailer";

const DEFAULT_SENDER = "hw900860@gmail.com";

export const sendOtp = internalAction({
  args: {
    to: v.string(),
    otp: v.string(),
    appName: v.optional(v.string()),
  },
  handler: async (_ctx, { to, otp, appName }) => {
    const user = process.env.GMAIL_SMTP_USER?.trim() || DEFAULT_SENDER;
    const pass = process.env.GMAIL_SMTP_PASS?.trim();
    if (!pass) {
      throw new Error(
        "GMAIL_SMTP_PASS is not configured. Add your Gmail App Password in the project's Keys/API keys tab.",
      );
    }

    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: { user, pass },
    });

    const name = appName?.trim() || "CrikHub";
    const expiresIn = "15 minutes";

    await transport.sendMail({
      from: `"${name}" <${user}>`,
      to,
      subject: `${name} — your sign-in code`,
      text: [
        `Your ${name} sign-in code is: ${otp}`,
        "",
        `Enter this code to continue. It expires in ${expiresIn}.`,
        "",
        "If you didn't request this code, you can safely ignore this email.",
      ].join("\n"),
      html: [
        '<div style="background:#0f172a;padding:24px;font-family:Arial,Helvetica,sans-serif">',
        '<div style="max-width:420px;margin:0 auto;background:#1e293b;border-radius:12px;padding:28px;border:1px solid #334155">',
        `<p style="margin:0 0 6px;font-size:12px;letter-spacing:2px;font-weight:700;color:#22c55e;text-transform:uppercase">${name}</p>`,
        '<p style="margin:0 0 16px;font-size:18px;font-weight:700;color:#f1f5f9">Your sign-in code</p>',
        `<p style="margin:0 0 20px;font-size:14px;color:#cbd5e1">Use the code below to continue. It expires in ${expiresIn}.</p>`,
        `<div style="text-align:center;background:#0f172a;border:1px dashed #22c55e;border-radius:8px;padding:18px;font-size:32px;letter-spacing:8px;font-weight:800;color:#22c55e">${otp}</div>`,
        '<p style="margin:24px 0 0;font-size:12px;color:#64748b">If you didn\'t request this code, you can safely ignore this email.</p>',
        "</div></div>",
      ].join(""),
    });
  },
});
