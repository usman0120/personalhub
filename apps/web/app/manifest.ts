import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest & { share_target: unknown } {
  return {
    name: "PersonalHub",
    short_name: "Hub",
    description: "Capture links, notes, ideas and screenshots in two taps.",
    id: "/",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    icons: [
      { src: "/icons/192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    share_target: {
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [{ name: "files", accept: ["image/png", "image/jpeg", "image/webp", "image/gif"] }],
      },
    },
    shortcuts: [
      { name: "Quick capture", url: "/?capture=1" },
      { name: "Inbox", url: "/inbox" },
    ],
  };
}
