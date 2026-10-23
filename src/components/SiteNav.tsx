"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/", label: "City map" },
  { href: "/pilot", label: "Mehdipatnam pilot" },
  { href: "/method", label: "Method and data" },
];

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

export function SiteNav() {
  const path = usePathname();
  if (path?.startsWith("/report")) return null;
  return (
    <header className="dark-surface no-print sticky top-0 z-40 bg-asphalt text-chalk">
      <nav className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4 sm:px-6" aria-label="Main">
        <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
          <Mark />
          <span>
            RoadFix <span className="font-normal text-chalk-2">Hyderabad</span>
          </span>
        </Link>
        <ul className="-mx-2 flex min-w-0 items-center gap-1 overflow-x-auto text-[15px]">
          {LINKS.map((l) => {
            const active = l.href === "/" ? path === "/" : path?.startsWith(l.href);
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
