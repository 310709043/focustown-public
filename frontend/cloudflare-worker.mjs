import worker from "./.open-next/worker.js";

// Redirect before OpenNext handles images or Next.js routes.
export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === "lowbatterytown.com") {
      url.protocol = "https:";
      url.hostname = "www.lowbatterytown.com";
      url.port = "";
      return Response.redirect(url.toString(), 301);
    }
    return worker.fetch(request, env, ctx);
  },
};
