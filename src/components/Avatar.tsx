import { initialsOf } from "@/lib/chat";

/**
 * Deterministic colour per user, so the same person keeps the same avatar
 * colour across sessions and devices without storing anything.
 */
const PALETTE = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-500",
  "bg-teal-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-fuchsia-500",
];

function colourFor(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

export function Avatar({
  name,
  seed,
  size = "md",
}: {
  name: string;
  seed: string;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
  }[size];

  return (
    <span
      aria-hidden="true"
      className={`${sizeClasses} ${colourFor(seed)} inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none`}
    >
      {initialsOf(name)}
    </span>
  );
}
