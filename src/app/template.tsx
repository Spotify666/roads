"use client";

import { MotionConfig, motion } from "motion/react";

// Each page eases in on navigation; motion follows the visitor's reduced-motion setting.
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}>
        {children}
      </motion.div>
    </MotionConfig>
  );
}
