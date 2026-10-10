import { withAui } from "@assistant-ui/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Next's dev badge out of the bottom-left, where the sidebar toggle floats.
  devIndicators: { position: "bottom-right" },
};

export default withAui(nextConfig);
