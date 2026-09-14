import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg는 Node 전용 모듈입니다. 번들에 넣지 않고 런타임에 직접 require하게 둡니다.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
