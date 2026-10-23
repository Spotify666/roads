// One stroke icon set for the Lab's tools and measurements: 24px grid, 1.8 stroke, round caps.
import type { ReactNode } from "react";

function Icon({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

type P = { size?: number };

export const UturnIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M7 20V9a5 5 0 0 1 10 0v6" />
    <path d="m13.5 12 3.5 3.5 3.5-3.5" />
  </Icon>
);
export const PocketIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M3 12h18" strokeDasharray="2 2.5" />
    <rect x="8" y="9" width="8" height="6" rx="1.2" />
  </Icon>
);
export const OneWayIcon = ({ size }: P) => (
  <Icon size={size}>
    <rect x="2.5" y="7" width="19" height="10" rx="2" />
    <path d="M6.5 12h10m-3-3 3 3-3 3" />
  </Icon>
);
export const BusLaneIcon = ({ size }: P) => (
  <Icon size={size}>
    <rect x="5" y="3.5" width="14" height="14" rx="2.5" />
    <path d="M5 11h14M8.5 20.5v-3M15.5 20.5v-3" />
    <circle cx="8.5" cy="14.2" r=".6" fill="currentColor" />
    <circle cx="15.5" cy="14.2" r=".6" fill="currentColor" />
  </Icon>
);
export const LanesIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M4 3v18M20 3v18" />
    <path d="M9.3 3v3M9.3 10.5v3M9.3 18v3M14.7 3v3M14.7 10.5v3M14.7 18v3" />
  </Icon>
);
export const BayIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M3 18h4l2-4h6l2 4h4" />
    <rect x="9" y="6" width="6" height="8" rx="1.2" />
  </Icon>
);
export const AutoIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M5 16V9.5C5 7 7 5 9.5 5H14l5 6v5" />
    <path d="M5 16h14M14 5v6h5" />
    <circle cx="8" cy="17.5" r="1.8" />
    <circle cx="17" cy="17.5" r="1.8" />
  </Icon>
);
export const KerbIcon = ({ size }: P) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M10 16V8h2.6a2.4 2.4 0 0 1 0 4.8H10M6 6l12 12" />
  </Icon>
);
export const ShieldIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6l-7-3Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Icon>
);
export const SignalIcon = ({ size }: P) => (
  <Icon size={size}>
    <rect x="8" y="2.5" width="8" height="16" rx="2.5" />
    <circle cx="12" cy="6.5" r="1.3" />
    <circle cx="12" cy="10.5" r="1.3" />
    <circle cx="12" cy="14.5" r="1.3" fill="currentColor" />
    <path d="M12 18.5v3" />
  </Icon>
);
export const TrafficIcon = ({ size }: P) => (
  <Icon size={size}>
    <rect x="3" y="10" width="7" height="5" rx="1.2" />
    <rect x="14" y="10" width="7" height="5" rx="1.2" />
    <path d="M3 19h18M3 6h18" />
  </Icon>
);
export const ClockIcon = ({ size }: P) => (
  <Icon size={size}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Icon>
);
export const CrawlIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M4 17a8 8 0 1 1 16 0" />
    <path d="m12 17-4-4.5" />
  </Icon>
);
export const FuelIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h6A1.5 1.5 0 0 1 14 5.5V20M3.5 20h12M5 10h9" />
    <path d="M14 8h2a2 2 0 0 1 2 2v6.5a1.5 1.5 0 0 0 3 0V9l-2.5-2.5" />
  </Icon>
);
export const RouteIcon = ({ size }: P) => (
  <Icon size={size}>
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="6" r="2" />
    <path d="M8 18h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16" />
  </Icon>
);
export const WrongIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M12 3.5 2.5 20h19L12 3.5Z" />
    <path d="M12 10v4.5M12 17.3v.2" />
  </Icon>
);
export const FlowIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M3 8h13m-3-3 3 3-3 3M21 16H8m3-3-3 3 3 3" />
  </Icon>
);
export const DivertIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M4 20V13a5 5 0 0 1 5-5h8" />
    <path d="m14 4.5 3.5 3.5L14 11.5" />
  </Icon>
);
export const QueueIcon = ({ size }: P) => (
  <Icon size={size}>
    <rect x="2.5" y="9.5" width="5" height="5" rx="1" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    <rect x="16.5" y="9.5" width="5" height="5" rx="1" />
  </Icon>
);
export const PlayIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4 2.5v11l9.5-5.5z" fill="currentColor" />
  </svg>
);
export const PauseIcon = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <rect x="3" y="2.5" width="3.6" height="11" rx="1" fill="currentColor" />
    <rect x="9.4" y="2.5" width="3.6" height="11" rx="1" fill="currentColor" />
  </svg>
);
export const ResetIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M4 12a8 8 0 1 0 2.4-5.7" />
    <path d="M4 4v4h4" />
  </Icon>
);
export const BeakerIcon = ({ size }: P) => (
  <Icon size={size}>
    <path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3" />
    <path d="M7 15h10" />
  </Icon>
);
