import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import { MemoryQueue } from "@opennextjs/cloudflare/overrides/queue/memory-queue";

const config = defineCloudflareConfig({
    // Use in-memory queue for ISR revalidation — no external queue service needed.
    // This is optimal for the free Cloudflare Workers tier.
    queue: new MemoryQueue(),
});

export default {
    ...config,
    buildCommand: "next build",
};
