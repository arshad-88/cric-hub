import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { ArrowRight, Loader2, Phone, User } from "lucide-react";
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

function Auth({ redirectAfterAuth }: AuthProps = {}) {
  const { isLoading: authLoading, isAuthenticated, signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = resolveRedirectAfterAuth(
    searchParams.get("returnTo"),
    redirectAfterAuth,
  );

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate(redirect);
    }
  }, [authLoading, isAuthenticated, navigate, redirect]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      setError("Enter a valid 10-digit phone number.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      // No OTP, no password — the number is the account.
      await signIn("phone", {
        phone: digits,
        ...(name.trim() ? { name: name.trim() } : {}),
      });
    } catch (err) {
      console.error("Phone sign-in error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Could not sign in. Please try again.",
      );
      setIsLoading(false);
    }
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
              <span className="micro-label text-[#22c55e]">Phone sign-in</span>
            </div>

            <h1 className="mt-4 text-2xl font-black uppercase tracking-tight text-white">
              Enter your number
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-400">
              Your mobile number is your login. No OTP, no password — if the
              number is new we create your profile instantly, and organizers
              can pull your name straight from it.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                  Phone number
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 size-4 text-slate-500" />
                  <Input
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="98765 43210"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    disabled={isLoading}
                    className="h-12 rounded-none border-border bg-[#0b1524] pl-10 text-base text-white placeholder:text-slate-600 focus-visible:border-[#22c55e] focus-visible:ring-[#22c55e]/30"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                  Your name <span className="normal-case text-slate-600">(optional, used on rosters)</span>
                </Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 size-4 text-slate-500" />
                  <Input
                    placeholder="Ravi Kumar"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={isLoading}
                    className="h-12 rounded-none border-border bg-[#0b1524] pl-10 text-sm text-white placeholder:text-slate-600 focus-visible:border-[#22c55e] focus-visible:ring-[#22c55e]/30"
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
                    <Loader2 className="mr-2 size-4 animate-spin" /> Signing in…
                  </>
                ) : (
                  <>
                    Continue <ArrowRight className="ml-2 size-4" />
                  </>
                )}
              </Button>
            </form>
          </div>

          <p className="mt-4 text-center text-[10px] font-bold uppercase tracking-widest text-slate-600">
            Viewing scores never needs an account — this is only for creating
            tournaments and scoring matches.
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
