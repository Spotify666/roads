import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://roadfix-hyderabad.vercel.app"),
  title: {
    default: "RoadFix Hyderabad: where the city jams, and the cheap fix for each",
    template: "%s · RoadFix Hyderabad",
  },
  description:
    "Live and typical congestion at 41 Hyderabad junctions, the bottleneck behind each, and low-cost fixes tested in a traffic simulation. Built on TomTom traffic data, OpenStreetMap and published reports.",
  openGraph: {
    title: "RoadFix Hyderabad",
    description: "Where Hyderabad jams, when, why, and the cheap fix for each junction.",
    locale: "en_IN",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#101316",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" className={plex.variable}>
      <body className="font-sans antialiased">
        <SiteNav />
        {children}
      </body>
    </html>
  );
}
