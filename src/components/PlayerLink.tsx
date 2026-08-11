import { Link } from "react-router";
import { cn } from "@/lib/utils";

/**
 * Clickable player name → profile page. Falls back to a plain span when no id
 * is available. stopPropagation keeps row-level click handlers (e.g. opening
 * a match) from also firing when the name itself is tapped.
 */
export function PlayerLink({
  id,
  name,
  className,
  children,
}: {
  id?: string;
  name?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const text = children ?? name ?? "?";
  if (!id) {
    return <span className={className}>{text}</span>;
  }
  return (
    <Link
      to={`/players/${id}`}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "truncate transition-colors hover:text-[#22c55e] hover:underline underline-offset-2",
        className,
      )}
      title={name ?? "Open player profile"}
    >
      {text}
    </Link>
  );
}
