import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-display text-2xl font-medium tracking-[-0.02em] text-foreground">
        404 · Page not found
      </p>
      <p className="max-w-sm font-sans text-sm text-muted-foreground">
        That page does not exist or has moved.
      </p>
      <Link
        href="/"
        className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.14em] text-white zg-volt-btn"
      >
        Back to home
      </Link>
    </div>
  );
}
