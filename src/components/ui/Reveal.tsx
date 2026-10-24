"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { animate, motion, useInView, useMotionValue, useTransform } from "motion/react";

/** Fades and lifts its content in the first time it scrolls into view. */
export function Reveal({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** A number that counts up to its value when it first comes into view, and eases between later values. */
export function CountUp({ value, decimals = 0, prefix = "", suffix = "" }: { value: number; decimals?: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) => `${prefix}${v.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`);
  useEffect(() => {
    if (!seen) return;
    const reduce = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const c = animate(mv, value, reduce ? { duration: 0 } : { duration: 0.9, ease: [0.22, 1, 0.36, 1] });
    return () => c.stop();
  }, [seen, value, mv]);
  return (
    <motion.span ref={ref} className="num">
      {text}
    </motion.span>
  );
}
