"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  void error;
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="font-display text-2xl font-medium tracking-[-0.02em] text-foreground">
            Something went wrong
          </p>
          <p className="max-w-sm font-sans text-sm text-muted-foreground">
            The app hit an unexpected error. Try reloading.
          </p>
          <button
            onClick={reset}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 font-mono text-[12px] uppercase tracking-[0.14em] text-white zg-volt-btn"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
