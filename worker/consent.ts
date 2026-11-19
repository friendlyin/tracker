import type { ConsentDescription } from "@cloudflare/workers-oauth-provider";

// The page where a person allows an MCP client (Claude) to use their Tracker data. Server-rendered
// and self-contained: it is shown during the OAuth flow, outside the PWA. Everything the client
// supplied (name, domain, redirect) is escaped, since a self-registered client chooses it.

export const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const STYLE = `
:root{--paper:#fafaf8;--surface:#f0f0ed;--ink:#141414;--ink-2:#5c5c58;--warn:#d4521c;--on-ink:#fafaf8;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--paper:#111111;--surface:#1c1c1b;--ink:#ededea;--ink-2:#a3a39e;--warn:#f07a45;--on-ink:#111111;color-scheme:dark}}
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:flex;flex-direction:column;justify-content:space-between;gap:32px;padding:max(env(safe-area-inset-top),24px) 16px max(env(safe-area-inset-bottom),16px);background:var(--paper);color:var(--ink);font:17px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main,form{width:100%;max-width:420px;margin:0 auto}
h1{margin:0 0 12px;font-size:22px;font-weight:600}
p{margin:0 0 8px;color:var(--ink-2);font-size:15px}
strong{color:var(--ink);font-weight:600}
.warn{color:var(--warn)}
button{display:block;width:100%;height:56px;border:0;border-radius:6px;font:inherit;font-weight:600;margin-top:8px;touch-action:manipulation}
.allow{background:var(--ink);color:var(--on-ink)}
.deny{background:var(--surface);color:var(--ink)}
button:active{opacity:.6}
`;

/** `details` from `describeConsent()`, `handle` from `beginConsent()`, `email` of the signed-in user. */
export function consentPage(details: ConsentDescription, handle: string, email: string): string {
  const name = escapeHtml(details.clientName);
  const from = details.clientDomain
    ? `<p>Published by <strong>${escapeHtml(details.clientDomain)}</strong>.</p>`
    : "<p>This app registered itself; its name is not verified.</p>";
  const local = details.redirectIsLoopback
    ? '<p class="warn">Access goes to an app on this computer. Allow only if you just started connecting from it.</p>'
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Allow ${name}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>Allow ${name} to use your Tracker data?</h1>
${from}
<p>Access goes to <strong>${escapeHtml(details.redirectHost)}</strong>.</p>
${local}
<p>${escapeHtml(email)}</p>
</main>
<form method="post">
<input type="hidden" name="handle" value="${escapeHtml(handle)}">
<button class="allow" name="decision" value="allow">Allow</button>
<button class="deny" name="decision" value="deny">Deny</button>
</form>
</body>
</html>`;
}
