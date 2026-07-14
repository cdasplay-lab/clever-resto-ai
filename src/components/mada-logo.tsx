import { cn } from "@/lib/utils";

export function MadaMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-[1.35rem] bg-primary text-primary-foreground shadow-[0_14px_35px_-18px_oklch(0.35_0.09_155/0.8)]",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" className="h-[68%] w-[68%]" fill="none">
        <path d="M14 40h36" stroke="currentColor" strokeWidth="3.3" strokeLinecap="round" />
        <path d="M19 38a13 13 0 0 1 26 0" stroke="currentColor" strokeWidth="3.3" />
        <path d="M32 19v-3" stroke="currentColor" strokeWidth="3.3" strokeLinecap="round" />
        <path d="M28.5 15h7" stroke="currentColor" strokeWidth="3.3" strokeLinecap="round" />
        <path d="M17 44h29" stroke="currentColor" strokeWidth="3.3" strokeLinecap="round" />
        <path d="M47 43c4-1 7-4 8-8-4 0-7 2-9 5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export function MadaLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <MadaMark className={compact ? "h-11 w-11" : "h-16 w-16"} />
      <div className="leading-none">
        <div className={cn("font-serif text-primary", compact ? "text-[1.7rem]" : "text-[2.55rem]")}>Mada</div>
        {!compact && <div className="mt-1 text-[0.55rem] font-medium tracking-[0.24em] text-mada-gold">RESTAURANT PLATFORM</div>}
      </div>
    </div>
  );
}
