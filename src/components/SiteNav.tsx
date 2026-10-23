"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "City map", short: "Map", icon: MapIcon },
  { href: "/pilot", label: "Mehdipatnam pilot", short: "Simulation", icon: SimIcon },
  { href: "/method", label: "Method and data", short: "Method", icon: InfoIcon },
];

const isActive = (href: string, path: string | null) => (href === "/" ? path === "/" || path?.startsWith("/area") : path?.startsWith(href));

function Mark() {
  // a divided road with one median opening: the first fix RoadFix tests
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
      <rect x="1" y="3" width="20" height="16" rx="3" fill="#2d6cdf" />
      <path d="M3 9.2h6.5M12.5 9.2H19" stroke="#eceee9" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 12.8h6.5M12.5 12.8H19" stroke="#eceee9" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9.5 9.2c1.2 0 2 .8 2 1.8s-.8 1.8-2 1.8" stroke="#f0d860" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" />
      <path d="M9 4v13M15 6.5v13" />
    </svg>
  );
}

function SimIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M3 9h18M3 15h18" />
      <path d="M6 12h2M11 12h2M16 12h2" />
      <rect x="5" y="6.5" width="4" height="1" rx=".5" fill="currentColor" stroke="none" />
      <rect x="14" y="16.5" width="4" height="1" rx=".5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 7.6v.4" />
    </svg>
  );
}

export function SiteNav() {
  const path = usePathname();
  if (path?.startsWith("/report")) return null;
  return (
    <header className="dark-surface no-print sticky top-0 z-40 bg-asphalt pt-[env(safe-area-inset-top)] text-chalk">
      <nav className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4 sm:px-6" aria-label="Main">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <Mark />
          <span>
            RoadFix <span className="font-normal text-chalk-2">Hyderabad</span>
          </span>
        </Link>
        <ul className="hidden items-center gap-1 text-[15px] sm:flex">
          {LINKS.map((l) => {
            const active = isActive(l.href, path);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "block whitespace-nowrap rounded-md px-2.5 py-1.5 transition-colors duration-150",
                    active ? "bg-asphalt-3 text-chalk" : "text-chalk-2 hover:text-chalk",
                  )}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}

/** Bottom tab bar for phones, clear of the home indicator. */
export function TabBar() {
  const path = usePathname();
  if (path?.startsWith("/report")) return null;
  return (
    <nav
      aria-label="Main"
      className="dark-surface no-print fixed inset-x-0 bottom-0 z-40 bg-asphalt/95 pb-[env(safe-area-inset-bottom)] text-chalk backdrop-blur-sm sm:hidden"
    >
      <ul className="grid h-16 grid-cols-3">
        {LINKS.map((l) => {
          const active = isActive(l.href, path);
          const Icon = l.icon;
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 text-[11.5px] font-medium transition-colors duration-150 active:bg-asphalt-3",
                  active ? "text-chalk" : "text-chalk-2",
                )}
              >
                <span className={cn("transition-transform duration-150", active && "text-sign-bright")}>
                  <Icon />
                </span>
                {l.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
