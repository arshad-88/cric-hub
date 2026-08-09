import { cn } from "@/lib/utils";
import type { BallKind } from "@/lib/vpl";
import type { ReactNode } from "react";

// ---- Swiss typographic atoms ----------------------------------------------

export function MicroLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("micro-label text-foreground", className)}>
      {children}
    </span>
  );
}

/** Numbered Swiss section heading, e.g. "02 — FIXTURES". */
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
      <span className="text-[#E4002B] font-bold text-sm score-nums">{index}</span>
      <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight uppercase">
        {title}
      </h2>
      <span className="flex-1 rule-t self-center" aria-hidden />
    </div>
  );
}

export function Rule({ className }: { className?: string }) {
  return <div className={cn("border-t border-foreground", className)} aria-hidden />;
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
          "inline-flex items-center gap-1.5 bg-[#E4002B] text-white micro-label px-2 py-0.5",
          className,
        )}
      >
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping bg-white opacity-75" />
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
          ? "border border-foreground bg-white text-foreground"
          : "bg-foreground text-white",
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
        "inline-flex shrink-0 items-center justify-center font-extrabold tracking-wide text-white",
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

// ---- recent-ball chip ------------------------------------------------------

const ballKindStyles: Record<BallKind, string> = {
  dot: "border border-foreground bg-white text-foreground",
  runs: "bg-foreground text-white",
  boundary: "bg-[#002FA7] text-white",
  wicket: "bg-[#E4002B] text-white",
  wide: "border-b-2 border-foreground bg-white text-foreground",
  bye: "border border-foreground/50 bg-white text-foreground",
  extra: "border-2 border-[#002FA7] bg-white text-[#002FA7]",
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

// ---- simple bordered block -------------------------------------------------

export function BorderedPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border border-foreground bg-white", className)}>
      {children}
    </div>
  );
}
