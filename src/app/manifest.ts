import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RoadFix Hyderabad",
    short_name: "RoadFix",
    description: "Where Hyderabad jams, when, why, and the cheap fix for each junction.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#101316",
    theme_color: "#101316",
    lang: "en-IN",
    categories: ["navigation", "travel", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "City map", url: "/", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Mehdipatnam pilot", url: "/pilot", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
