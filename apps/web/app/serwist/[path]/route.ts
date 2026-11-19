import { createSerwistRoute } from "@serwist/turbopack";

// Serves the compiled service worker at /serwist/sw.js (with Service-Worker-Allowed: /).
export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } = createSerwistRoute({
  swSrc: "app/sw.ts",
  useNativeEsbuild: true,
  additionalPrecacheEntries: [{ url: "/share", revision: "1" }],
});
