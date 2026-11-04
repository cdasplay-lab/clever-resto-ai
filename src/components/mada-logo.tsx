import { cn } from "@/lib/utils";

export function MadaMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      className={cn("h-9 w-9 shrink-0 text-action", className)}
      aria-hidden="true"
    >
      <path
        d="M17 2h6l2 13-5 3-5-3 2-13ZM38 17v6l-13 2-3-5 3-5 13 2ZM23 38h-6l-2-13 5-3 5 3-2 13ZM2 23v-6l13-2 3 5-3 5-13-2Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function MadaLogo({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("mada-logo inline-flex items-center gap-2.5", className)}
      dir="ltr"
      aria-label="MADA AI"
    >
      <MadaMark className={compact ? "h-7 w-7" : "h-9 w-9"} />
      <span className={cn("mada-wordmark whitespace-nowrap", compact ? "text-xl" : "text-2xl")}>
        MADA AI
      </span>
    </span>
  );
}
