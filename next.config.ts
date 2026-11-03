import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // study guide uploads go through server actions/route handlers; keep room for a few photos or a PDF
    serverActions: { bodySizeLimit: "5mb" },
  },
};

export default nextConfig;
