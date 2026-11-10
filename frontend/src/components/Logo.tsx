import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-9 items-center justify-center rounded-xl bg-brand shadow-lift",
        className,
      )}
    >
      <svg
        viewBox="0 0 32 32"
        className="size-[60%] text-primary-foreground"
        fill="none"
        aria-hidden
      >
        <path
          d="M16 4c-5.5 0-9.5 4-9.5 9 0 3 1.4 5.3 3.4 6.8V25a2 2 0 0 0 2 2h8.2a2 2 0 0 0 2-2v-5.2c2-1.5 3.4-3.8 3.4-6.8 0-5-4-9-9.5-9Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M12 14.5c1.2-2 2.6-3 4-3s2.8 1 4 3M16 11.5V21"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="16" cy="8.2" r="1.3" fill="currentColor" />
      </svg>
    </span>
  );
}

export function Logo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      {showText && <span className="text-lg font-bold tracking-tight">Guru Mind</span>}
    </span>
  );
}
