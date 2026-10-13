import React from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/src/lib/utils";
export const ConfettiBurst = ({ large = false }: { large?: boolean }) => {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
  <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
    {Array.from({ length: large ? 34 : 18 }, (_, index) => (
      <motion.span
        key={index}
        initial={{ opacity: 0, x: "50%", y: "50%", scale: 0.3, rotate: 0 }}
        animate={{
          opacity: [0, 1, 0],
          x: `${50 + Math.cos(index) * (large ? 46 : 34)}%`,
          y: `${50 + Math.sin(index * 1.7) * (large ? 42 : 30)}%`,
          scale: [0.3, 1, 0.7],
          rotate: 220 + index * 16,
        }}
        transition={{ duration: 1.2, delay: index * 0.015 }}
        className={cn(
          "absolute h-2 w-2 rounded-sm",
          index % 4 === 0
            ? "bg-[var(--noviq-accent)]"
            : index % 4 === 1
              ? "bg-amber-400"
              : index % 4 === 2
                ? "bg-sky-400"
                : "bg-rose-400",
        )}
      />
    ))}
  </div>
  );
};
