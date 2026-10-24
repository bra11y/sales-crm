"use client";

import { useEffect } from "react";

// Registers the share-menu service worker. It caches no pages, so nothing goes stale.
export default function RegisterSW() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
