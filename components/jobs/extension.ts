// The Chrome extension marks the CRM page when it is installed (see extension/crm-bridge.js).
export const noSubscribe = () => () => {};
export const extensionVersion = () => document.documentElement.dataset.salesCrmExtension ?? "";

// Hands the job to the extension and waits for it to say the tab opened.
export function startWithExtension(jobId: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const done = (r: { ok: boolean; error?: string }) => {
      window.removeEventListener("message", listen);
      clearTimeout(timer);
      resolve(r);
    };
    const listen = (e: MessageEvent) => {
      if (e.source === window && e.data?.source === "sales-crm-extension" && e.data.type === "started" && e.data.jobId === jobId) done({ ok: e.data.ok, error: e.data.error });
    };
    const timer = setTimeout(() => done({ ok: false, error: "The extension did not answer. Reload it in chrome://extensions, then try again." }), 15_000);
    window.addEventListener("message", listen);
    window.postMessage({ source: "sales-crm", type: "start-apply", jobId }, window.location.origin);
  });
}
