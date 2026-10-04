/** Shared with the Cloudflare CSP build so the permitted bytes match the script. */
export function analyticsInitScript(id) {
  return `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', ${JSON.stringify(id).replace(/</g, "\\u003c")}, {
  page_path: window.location.pathname,
});`;
}
