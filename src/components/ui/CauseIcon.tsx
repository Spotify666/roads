import { KIND_LABEL, KIND_PATH, type CauseKind } from "@/lib/causes";

export function CauseIcon({ kind, size = 16, title }: { kind: CauseKind; size?: number; title?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" role={title ? "img" : undefined} aria-hidden={title ? undefined : true} aria-label={title ? KIND_LABEL[kind] : undefined}>
      <path d={KIND_PATH[kind]} />
    </svg>
  );
}
