"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function PulseDot({
  active = true,
  className,
}: {
  active?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex h-2 w-2", className)}>
      {active && (
        <motion.span
          className="absolute inset-0 rounded-full bg-current"
          animate={{ scale: [1, 1.8, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          active ? "bg-current" : "bg-muted-foreground/30",
        )}
      />
    </span>
  );
}
