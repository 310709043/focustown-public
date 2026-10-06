import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Read build-time pages from the existing assets binding. In particular,
// dynamicParams=false articles must find their prerendered entry at runtime.
// No R2 cache, revalidation queue or additional paid storage is needed.
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
