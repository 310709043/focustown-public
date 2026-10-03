/**
 * lbt message bundles — the UI looks copy up by id at runtime, so a missing
 * key only shows up as a blank or raw key in one locale. These checks catch
 * that at test time.
 */
import { describe, expect, test } from "vitest";

import en from "@/messages/en/lbt.json";
import zhTW from "@/messages/zh-TW/lbt.json";
import {
  ENERGY_ID,
  NICKNAME_MAX,
  PREFERENCES,
  REPLY_IDS,
  REPORT_REASONS,
  TOPIC_IDS,
} from "@/lib/lbt/constants";

type Tree = { [key: string]: string | Tree };

const bundles: Array<[string, Tree]> = [
  ["zh-TW", zhTW as Tree],
  ["en", en as Tree],
];

function leafKeys(tree: Tree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string" ? [`${prefix}${key}`] : leafKeys(value, `${prefix}${key}.`),
  );
}

function lookup(tree: Tree, path: string): string | Tree | undefined {
  return path
    .split(".")
    .reduce<string | Tree | undefined>(
      (node, part) => (node && typeof node !== "string" ? node[part] : undefined),
      tree,
    );
}

test("both locales define exactly the same keys", () => {
  expect(leafKeys(en as Tree).sort()).toEqual(leafKeys(zhTW as Tree).sort());
});

describe.each(bundles)("%s", (_locale, bundle) => {
  test("no message is empty", () => {
    const empty = leafKeys(bundle).filter((key) => lookup(bundle, key) === "");

    expect(empty).toEqual([]);
  });

  test("the default nickname fits the nickname limit", () => {
    const value = lookup(bundle, "home.nickname.default") as string;

    expect(Array.from(value).length).toBeLessThanOrEqual(NICKNAME_MAX);
  });

  test("every battery level has all its copy", () => {
    const missing = Object.values(ENERGY_ID).flatMap((id) =>
      ["name", "hint", "title", "description", "pace"]
        .map((field) => `energy.${id}.${field}`)
        .filter((key) => typeof lookup(bundle, key) !== "string"),
    );

    expect(missing).toEqual([]);
  });

  test("every preference has a label and demo openers", () => {
    const missing = PREFERENCES.flatMap((id) =>
      [`preference.${id}`, `partner.opener.${id}.normal`, `partner.opener.${id}.low`].filter(
        (key) => typeof lookup(bundle, key) !== "string",
      ),
    );

    expect(missing).toEqual([]);
  });

  test("every end reason, report reason and notice code has copy", () => {
    const keys = [
      ...["left", "partner_left", "timeout", "partner_disconnected", "reported", "unknown"].map(
        (r) => `end.reason.${r}`,
      ),
      ...REPORT_REASONS.map((r) => `modal.report.reasons.${r}`),
      ...[
        "closed",
        "age_required",
        "slow_down",
        "time_up",
        "too_late",
        "empty_message",
        "already_in_conversation",
        "no_conversation",
        "nickname_required",
        "invalid_energy",
        "invalid_preference",
        "wait_interrupted",
        "report_failed",
        "generic",
      ].map((c) => `notice.${c}`),
    ];

    expect(keys.filter((key) => typeof lookup(bundle, key) !== "string")).toEqual([]);
  });

  test("the crisis line appears in the report dialog and chat aside", () => {
    const texts = [lookup(bundle, "modal.report.help"), lookup(bundle, "chat.aside.help")];

    expect(texts.every((text) => typeof text === "string" && text.includes("1925"))).toBe(true);
  });

  test("every scripted topic and reply has text", () => {
    const missing = [
      ...TOPIC_IDS.map((id) => `topics.${id}`),
      ...REPLY_IDS.map((id) => `replies.${id}`),
    ].filter((key) => typeof lookup(bundle, key) !== "string");

    expect(missing).toEqual([]);
  });

  test("partner openers greet the visitor and name the partner", () => {
    const openers = PREFERENCES.flatMap((id) => [
      lookup(bundle, `partner.opener.${id}.normal`) as string,
      lookup(bundle, `partner.opener.${id}.low`) as string,
    ]);

    expect(
      openers.every((text) => text.includes("{nickname}") && text.includes("{partner}")),
    ).toBe(true);
  });
});
