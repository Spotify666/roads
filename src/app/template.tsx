"use client";

import { useEffect } from "react";
import { MotionConfig, motion } from "motion/react";

// The first page arrives fully drawn from the server; it is never hidden waiting for JavaScript.
let firstPage = true;

// Pages after that fade in quickly on navigation; motion follows the visitor's reduced-motion setting.
export default function Template({ children }: { children: React.ReactNode }) {
  const animate = !firstPage;
  useEffect(() => {
    firstPage = false;
  }, []);
  return (
    <MotionConfig reducedMotion="user">
      <motion.div initial={animate ? { opacity: 0 } : false} animate={{ opacity: 1 }} transition={{ duration: 0.18, ease: "easeOut" }}>
        {children}
      </motion.div>
    </MotionConfig>
  );
}
