// Runs only on the CRM's own pages. It tells the CRM the extension is installed,
// and passes "apply to this job" from the CRM's Apply button to the helper.
// Only the job id crosses over; the helper looks up the job's link itself.

document.documentElement.dataset.salesCrmExtension = chrome.runtime.getManifest().version;

window.addEventListener("message", (event) => {
  if (event.source !== window || event.origin !== location.origin) return;
  const data = event.data;
  if (!data || data.source !== "sales-crm" || data.type !== "start-apply") return;
  chrome.runtime.sendMessage({ type: "start", jobId: String(data.jobId || "") }, (reply) => {
    const error = chrome.runtime.lastError ? "The extension did not answer. Reload it in chrome://extensions." : reply && !reply.ok ? reply.error : "";
    window.postMessage({ source: "sales-crm-extension", type: "started", jobId: data.jobId, ok: !error, error }, location.origin);
  });
});
