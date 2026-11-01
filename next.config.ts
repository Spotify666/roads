import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // the Lab used to take its spot as a query; each spot now has its own static page
      { source: "/pilot", has: [{ type: "query", key: "spot", value: "(?<spot>[a-z0-9-]+)" }], destination: "/pilot/:spot", permanent: false },
    ];
  },
};

export default nextConfig;
