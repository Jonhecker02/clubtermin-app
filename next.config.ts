import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The chat is gone; old links and already-sent push notifications land on the announcements.
  async redirects() {
    return [{ source: "/chat", destination: "/ankuendigungen", permanent: true }];
  },
  env: {
    // Changes with every build; the persisted query cache uses it as its
    // version so a new deploy never reads data saved by an older one.
    NEXT_PUBLIC_BUILD_ID: Date.now().toString(),
  },
};

export default nextConfig;
