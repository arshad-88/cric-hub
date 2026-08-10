import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

interface AuthProps {
  redirectAfterAuth?: string;
}

function resolveRedirectAfterAuth(
  returnTo: string | null,
  fallback = "/dashboard",
) {
  if (returnTo?.startsWith("/") && !returnTo.startsWith("//")) {
    return returnTo;
  }
  return fallback;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const sendCode = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      setError("Enter a valid email address (your Gmail works best).");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await signIn("email-otp", { email: trimmed });
      setStep("code");
    } catch (err) {
      console.error("OTP send error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not send the code. Please try again.",
      );
      setIsLoading(false);
    }
  };

  const verify = async () => {
    if (code.trim().length < 4) {
      setError("Enter the 6-digit code we emailed you.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await signIn("email-otp", {
        email: email.trim().toLowerCase(),
        code: code.trim(),
      });
      // useAuth's effect navigates to the redirect target once authenticated
    } catch (err) {
      console.error("OTP verify error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "That code did not work — check it and try again.",
      );
      setIsLoading(false);
    }
  };

  const resend = () => {
    setCode("");
    setStep("email");
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* broadcast header strip */}
      <div className="h-0.5 bg-gradient-to-r from-[#22c55e] via-[#facc15] to-[#22d3ee]" aria-hidden />
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center bg-gradient-to-br from-[#22c55e] to-[#16a34a] text-lg font-black text-[#052e16] led-green">
            C
          </span>
          <span className="text-xl font-black uppercase leading-none tracking-tight text-white">
            Cric<span className="text-[#22c55e] led-green">Pulse</span>
          </span>
        </Link>
        <Link
          to="/"
          className="micro-label text-slate-400 transition-colors hover:text-white"
        >
          Back to scores
        </Link>
      </div>

      <main className="flex flex-1 items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <div className="border border-border bg-card p-8 panel-glow">
            <div className="flex items-center gap-2">
              <span className="live-dot relative flex size-2">
                <span className="relative inline-flex size-2 rounded-full bg-[#ef4444]" />
              </span>
              <span className="micro-label text-[#22c55e]">
                {step === "email" ? "Email sign-in" : "Verify your inbox"}
              </span>
            </div>

            {step === "email" ? (
              <>
                <h1 className="mt-4 text-2xl font-black uppercase tracking-tight text-white">
                  Sign in with your Gmail
                </h1>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  Enter your email and we'll send a 6-digit code to that inbox.
                  No password to remember — the code is your key.
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendCode();
                  }}
                  className="mt-6 space-y-4"
                >
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                      Email address
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 size-4 text-slate-500" />
                      <Input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        placeholder="you@gmail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={isLoading}
                        className="h-12 rounded-none border-border bg-[#0b1524] pl-10 text-base text-white placeholder:text-slate-600 focus-visible:border-[#22c55e] focus-visible:ring-[#22c55e]/30"
                        required
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="border border-[#ef4444]/50 bg-[#ef4444]/10 px-3 py-2 text-xs font-bold text-[#ef4444]">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="h-12 w-full rounded-none bg-[#22c55e] text-xs font-black uppercase tracking-widest text-[#052e16] transition-colors hover:bg-[#facc15] hover:text-[#422006]"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" /> Sending code…
                      </>
                    ) : (
                      <>
                        Send code <ArrowRight className="ml-2 size-4" />
                      </>
                    )}
                  </Button>
                </form>
              </>
            ) : (
              <>
                <h1 className="mt-4 text-2xl font-black uppercase tracking-tight text-white">
                  Enter the 6-digit code
                </h1>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">
                  We sent it to{" "}
                  <span className="font-bold text-[#22c55e]">{email.trim()}</span>.
                  It expires in 15 minutes.
                </p>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    verify();
                  }}
                  className="mt-6 space-y-4"
                >
                  <div className="space-y-1.5">
                    <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                      One-time code
                    </Label>
                    <div className="relative">
                      <LockKeyhole className="absolute left-3 top-3 size-4 text-slate-500" />
                      <Input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="123456"
                        maxLength={8}
                        value={code}
                        onChange={(e) =>
                          setCode(e.target.value.replace(/\D/g, ""))
                        }
                        disabled={isLoading}
                        className="h-12 rounded-none border-border bg-[#0b1524] pl-10 text-center font-mono text-2xl tracking-[0.4em] text-white placeholder:text-slate-600 focus-visible:border-[#22c55e] focus-visible:ring-[#22c55e]/30"
                        required
                      />
                    </div>
                  </div>

                  {error && (
                    <p className="border border-[#ef4444]/50 bg-[#ef4444]/10 px-3 py-2 text-xs font-bold text-[#ef4444]">
                      {error}
                    </p>
                  )}

                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="h-12 w-full rounded-none bg-[#22c55e] text-xs font-black uppercase tracking-widest text-[#052e16] transition-colors hover:bg-[#facc15] hover:text-[#422006]"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" /> Verifying…
                      </>
                    ) : (
                      <>
                        Sign in <ArrowRight className="ml-2 size-4" />
                      </>
                    )}
                  </Button>

                  <button
                    type="button"
                    onClick={resend}
                    className="flex w-full items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 hover:text-[#22d3ee]"
                  >
                    <ArrowLeft className="size-3" /> Use a different email
                  </button>
                </form>
              </>
            )}
          </div>

          <p className="mt-4 text-center text-[10px] font-bold uppercase tracking-widest text-slate-600">
            Viewing scores never needs an account — this is only for creating
            tournaments, scoring matches and joining auctions.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function AuthPage(props: AuthProps) {
  return (
    <Suspense>
      <Auth {...props} />
    </Suspense>
  );
}
