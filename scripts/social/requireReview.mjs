#!/usr/bin/env node
// Refuse to publish unless the "social" GitHub environment makes a person
// approve each run. GitHub creates a missing environment without any rules,
// so without this check a push could post straight to Instagram and Threads.
const repo = process.env.GITHUB_REPOSITORY;
const name = process.env.SOCIAL_ENVIRONMENT ?? "social";
const res = await fetch(`https://api.github.com/repos/${repo}/environments/${name}`, {
  headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json" },
});
const env = await res.json().catch(() => ({}));
const reviewed = (env.protection_rules ?? []).some((r) => r.type === "required_reviewers" && r.reviewers?.length);
if (!res.ok || !reviewed) {
  console.error(
    `The "${name}" environment has no required reviewers (HTTP ${res.status}). ` +
      "Add yourself under Settings → Environments → social → Required reviewers before publishing.",
  );
  process.exit(1);
}
console.log(`"${name}" environment requires approval: ok`);
