// The toolbar popup: connect once with a code from Profile. After that, the CRM's
// Apply button starts the helper, or "Help on this page" starts it here.

const $ = (id) => document.getElementById(id);

function say(text) {
  $("error").textContent = "";
  $("status").textContent = text;
}
function fail(text) {
  $("status").textContent = "";
  $("error").textContent = text;
}

function show(view) {
  $("connect").hidden = view !== "connect";
  $("ready").hidden = view !== "ready";
  $("disconnect").hidden = view !== "ready";
}

$("connect-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const server = $("server").value.trim().replace(/\/$/, "");
  const code = $("code").value.trim();
  if (!/^https:\/\/|^http:\/\/localhost/.test(server)) return fail("The CRM address must start with https://");
  if (!/^scx_/.test(code)) {
    $("code").setAttribute("aria-invalid", "true");
    $("code").focus();
    return fail("That isn't a connection code. It starts with scx_. Make one in Profile.");
  }
  try {
    const res = await fetch(`${server}/api/ext/kit?url=`, { headers: { authorization: `Bearer ${code}` } });
    if (res.status === 401) {
      $("code").setAttribute("aria-invalid", "true");
      $("code").focus();
      return fail("The CRM did not accept that code. Make a new one in Profile.");
    }
  } catch {
    return fail("The CRM could not be reached. Check the address.");
  }
  $("code").removeAttribute("aria-invalid");
  await chrome.storage.local.set({ settings: { server, code } });
  $("code").value = "";
  say("Connected. Press Apply with the extension on any job in the CRM.");
  init();
});

$("fill").addEventListener("click", async () => {
  if ($("fill").getAttribute("aria-disabled") === "true") return;
  $("fill").setAttribute("aria-disabled", "true");
  say("Starting the helper…");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const reply = await chrome.runtime.sendMessage({ type: "popup-fill", tabId: tab.id });
  $("fill").setAttribute("aria-disabled", "false");
  if (reply && reply.ok) window.close();
  else fail(reply?.error || "The helper did not start.");
});

$("write").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const reply = await chrome.runtime.sendMessage({ type: "write-check", tabId: tab.id });
  if (reply && reply.ok) window.close();
  else fail(reply?.error?.includes("Cannot access") ? "Chrome does not let extensions check this page. Try it on a job site or email." : reply?.error || "The writing check did not start.");
});

$("disconnect").addEventListener("click", async () => {
  await chrome.storage.local.remove("settings");
  say("Disconnected.");
  init();
});

async function init() {
  const { settings } = await chrome.storage.local.get("settings");
  $("open-crm").href = `${settings?.server || "https://sales-crm-virid-ten.vercel.app"}/jobs`;
  show(settings ? "ready" : "connect");
}

init();
