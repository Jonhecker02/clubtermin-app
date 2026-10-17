import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    // Changes with every build; the persisted query cache uses it as its
    // version so a new deploy never reads data saved by an older one.
    NEXT_PUBLIC_BUILD_ID: Date.now().toString(),
  },
};

export default nextConfig;
