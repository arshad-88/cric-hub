import { cn } from "@/lib/utils";
import type { BallKind } from "@/lib/format";
import type { ReactNode } from "react";

// ---- typographic atoms -----------------------------------------------------

export function MicroLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("micro-label text-muted-foreground", className)}>
      {children}
    </span>
  );
}

/** Numbered section heading, e.g. "02 — LIVE MATCH". */
export function SectionHeading({
  index,
  title,
  className,
}: {
  index: string;
  title: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline gap-4", className)}>
      <span className="text-[#22c55e] led-green text-sm font-extrabold score-nums">
        {index}
      </span>
      <h2 className="text-2xl font-extrabold uppercase tracking-tight text-foreground sm:text-3xl">
        {title}
      </h2>
      <span className="flex-1 self-center border-t border-border" aria-hidden />
    </div>
  );
}

export function Rule({ className }: { className?: string }) {
  return <div className={cn("border-t border-border", className)} aria-hidden />;
}

// ---- status pill -----------------------------------------------------------

export function StatusPill({
  status,
  className,
}: {
  status: "UPCOMING" | "LIVE" | "COMPLETED";
  className?: string;
}) {
  if (status === "LIVE") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 bg-[#ef4444] px-2 py-0.5 micro-label text-white glow-red",
          className,
        )}
      >
        <span className="live-dot relative flex size-1.5">
          <span className="relative inline-flex size-1.5 rounded-full bg-white" />
        </span>
        LIVE
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex micro-label px-2 py-0.5",
        status === "UPCOMING"
          ? "border border-border bg-card text-muted-foreground"
          : "bg-[#22c55e] text-[#052e16]",
        className,
      )}
    >
      {status === "UPCOMING" ? "UPCOMING" : "COMPLETED"}
    </span>
  );
}

// ---- team mark -------------------------------------------------------------

export function TeamMark({
  shortCode,
  color,
  size = "md",
  className,
}: {
  shortCode: string;
  color: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "size-5 text-[9px]",
    md: "size-8 text-xs",
    lg: "size-12 text-base",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-extrabold tracking-wide text-white panel-glow",
        sizes[size],
        className,
      )}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {shortCode}
    </span>
  );
}

// ---- ball chip timeline (broadcast colors) ---------------------------------
// Green = 4s & 6s · Red = wickets · Gold = wides/extras · Cyan = no-balls

const ballKindStyles: Record<BallKind, string> = {
  dot: "border border-border bg-card text-slate-400",
  runs: "bg-slate-200 text-slate-900",
  boundary: "bg-[#22c55e] text-[#052e16] glow-green",
  wicket: "bg-[#ef4444] text-white glow-red",
  wide: "bg-[#facc15] text-[#422006] glow-gold",
  bye: "border border-[#facc15]/70 bg-card text-[#facc15]",
  extra: "border border-[#22d3ee] bg-[#22d3ee]/10 text-[#22d3ee]",
};

export function BallChip({
  symbol,
  kind,
  size = "md",
  className,
}: {
  symbol: string;
  kind: BallKind;
  size?: "sm" | "md";
  className?: string;
}) {
  const sizes = { sm: "size-6 text-[10px]", md: "size-8 text-xs" } as const;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center font-bold score-nums",
        sizes[size],
        ballKindStyles[kind],
        className,
      )}
      title={symbol}
    >
      {symbol}
    </span>
  );
}

// ---- simple bordered panel -------------------------------------------------

export function BorderedPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border border-border bg-card panel-glow", className)}>
      {children}
    </div>
  );
}
