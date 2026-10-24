import type { MetadataRoute } from "next";

// Lets the CRM install as an app on a phone or computer. On Android and Chrome, the
// share target puts "Sales CRM" in the Share menu, so a screenshot goes straight to Add a job.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Sales CRM",
    short_name: "CRM",
    description: "Find jobs, apply and track every reply.",
    start_url: "/jobs",
    scope: "/",
    display: "standalone",
    background_color: "#161616",
    theme_color: "#161616",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    share_target: {
      action: "/share-target",
      method: "post",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url", files: [{ name: "shot", accept: ["image/png", "image/jpeg", "image/webp", "image/*"] }] },
    },
  } as MetadataRoute.Manifest;
}
