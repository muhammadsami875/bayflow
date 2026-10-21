import clsx from "clsx";

/** Wrench-in-a-bay mark drawn as SVG so it scales and themes cleanly. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={clsx("h-8 w-8", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="rgb(var(--brand))" />
      <path
        d="M7 22V12.5C7 11.7 7.7 11 8.5 11H23.5C24.3 11 25 11.7 25 12.5V22"
        fill="none"
        stroke="#fff"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M12 22v-5h8v5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="16" cy="20" r="0.9" fill="#fff" />
    </svg>
  );
}

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2.5", className)}>
      <LogoMark />
      <span className={clsx("text-lg font-bold tracking-tight", light ? "text-white" : "text-ink")}>BayFlow</span>
    </span>
  );
}
