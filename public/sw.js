// Sales CRM service worker. It does one job: catch things shared to the app from the
// phone's Share menu and hand them to the Add a job page. It caches no pages, so you
// never see stale or signed-out data.

const SHARE = "share-inbox";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "POST" || url.origin !== self.location.origin || url.pathname !== "/share-target") return;
  event.respondWith(
    (async () => {
      const form = await event.request.formData();
      const cache = await caches.open(SHARE);
      const shot = form.get("shot");
      if (shot && typeof shot !== "string" && shot.size) await cache.put("/shared/shot", new Response(shot, { headers: { "content-type": shot.type } }));
      const note = { title: String(form.get("title") || ""), text: String(form.get("text") || ""), url: String(form.get("url") || "") };
      await cache.put("/shared/note", new Response(JSON.stringify(note), { headers: { "content-type": "application/json" } }));
      return Response.redirect("/jobs/add?shared=1", 303);
    })(),
  );
});
