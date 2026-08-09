import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldX } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

/** Gates scorer/admin routes behind the ADMIN role (RequireAuth must wrap first). */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (user?.role !== "admin") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm border border-foreground bg-white p-8 text-center">
          <ShieldX className="mx-auto size-8 text-[#E4002B]" />
          <h1 className="mt-4 text-lg font-extrabold uppercase tracking-tight">
            Scorer access required
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-foreground/60">
            This area is for league admins and ground scorers. Sign in with the
            account that holds the admin role.
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <Button asChild className="rounded-none bg-foreground uppercase text-white hover:bg-[#E4002B]">
              <Link to="/dashboard">Go to admin console</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-none uppercase">
              <Link to="/">Back to public site</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return children;
}
