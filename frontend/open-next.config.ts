import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// These routes do not use ISR; no R2 cache or queue is required.
export default defineCloudflareConfig();
