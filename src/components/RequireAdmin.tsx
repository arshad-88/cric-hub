import { api } from "@/convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, ShieldX } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

/** Gates scorer/admin routes behind the ADMIN role (RequireAuth must wrap first). */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isLoading, user } = useAuth();
  const hasAnyAdmin = useQuery(api.admin.hasAnyAdmin);
  const grantAdmin = useMutation(api.admin.grantAdmin);

  if (isLoading || hasAnyAdmin === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (user?.role !== "admin") {
    const firstRun = !hasAnyAdmin;
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm border border-border bg-card p-8 text-center panel-glow">
          <ShieldX className="mx-auto size-8 text-[#ef4444]" />
          <h1 className="mt-4 text-lg font-extrabold uppercase tracking-tight text-white">
            {firstRun ? "Bootstrap the organizer role" : "Admin access required"}
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            {firstRun
              ? "No organizer exists yet. As the first signed-in user you can claim the admin role — you will be able to create tournaments, manage teams and score matches live."
              : "The organizer console is locked. Only authenticated admins and ground scorers can create tournaments, manage teams or enter scores."}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            {firstRun ? (
              <Button
                className="rounded-none bg-[#22c55e] text-[10px] font-black uppercase tracking-widest text-[#052e16] hover:bg-[#facc15] hover:text-[#422006]"
                onClick={async () => {
                  try {
                    await grantAdmin();
                    toast.success("You are now the platform organizer.");
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : "Could not claim the role.",
                    );
                  }
                }}
              >
                <ShieldCheck className="size-4" /> Claim admin role
              </Button>
            ) : (
              <Button asChild className="rounded-none bg-[#22c55e] text-[10px] font-black uppercase tracking-widest text-[#052e16] hover:bg-[#facc15] hover:text-[#422006]">
                <Link to="/admin">Go to organizer console</Link>
              </Button>
            )}
            <Button asChild variant="outline" className="rounded-none border-border text-[10px] font-bold uppercase tracking-widest text-slate-300">
              <Link to="/">Back to public site</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return children;
}
