"use client";

import { useTranslations } from "next-intl";

import { findCharacter } from "@/lib/data/characters";

interface Props {
  /** Current viewer's character key (from authStore.user). */
  meKey: string | null | undefined;
  /** Partner's character key — null while loading or unknown. */
  partnerKey: string | null | undefined;
}

/**
 * Thin strip pinned above the focus-room header showing both partners
 * "sitting opposite each other at a small cafe table". Style is
 * deliberately minimal (~40px tall) so it never competes with the
 * timer or notes panel below.
 *
 * Renders nothing when no partner is known — the caller is responsible
 * for skipping it in solo sessions.
 */
export function PartnerPairingHeader({ meKey, partnerKey }: Props) {
  const t = useTranslations("focus.pairingHeader");
  const me = findCharacter(meKey);
  const partner = findCharacter(partnerKey);

  if (!partner) return null;

  return (
    <div
      data-testid="partner-pairing-header"
      className="flex items-center justify-center gap-3 border-b border-border relative z-10"
      style={{
        height: 40,
        background: "rgba(2,0,12,0.88)",
        backdropFilter: "blur(6px)",
      }}
    >
      <Seat
        emoji={me?.emoji ?? "🧑"}
        name={me?.name ?? t("you")}
        bodyColor={me?.bodyColor ?? "#1a0e2a"}
        align="right"
      />
      <Table />
      <Seat
        emoji={partner.emoji}
        name={partner.name}
        bodyColor={partner.bodyColor}
        align="left"
      />
    </div>
  );
}

function Seat({
  emoji,
  name,
  bodyColor,
  align,
}: {
  emoji: string;
  name: string;
  bodyColor: string;
  align: "left" | "right";
}) {
  // The seat with align="left" faces right (towards the table); align="right"
  // faces left. We flip the avatar container with scaleX so both characters
  // appear to face one another across the table.
  const flip = align === "right" ? "scaleX(-1)" : undefined;
  return (
    <div className="flex items-center gap-1.5">
      {align === "right" ? (
        <span style={{ fontSize: 10, color: "var(--muted)" }}>{name}</span>
      ) : null}
      <span
        aria-hidden
        className="inline-flex items-center justify-center rounded"
        style={{
          width: 26,
          height: 26,
          fontSize: 16,
          lineHeight: 1,
          background: bodyColor,
          boxShadow: "0 0 10px rgba(167,139,250,0.35)",
          transform: flip,
        }}
      >
        {emoji}
      </span>
      {align === "left" ? (
        <span style={{ fontSize: 10, color: "var(--muted)" }}>{name}</span>
      ) : null}
    </div>
  );
}

function Table() {
  return (
    <div className="flex flex-col items-center" style={{ gap: 1 }}>
      <span style={{ fontSize: 12, lineHeight: 1 }}>☕</span>
      <span
        aria-hidden
        style={{
          width: 22,
          height: 4,
          background: "linear-gradient(180deg, #5b3a1f, #2b1a0b)",
          borderRadius: 2,
          boxShadow: "0 1px 0 rgba(0,0,0,0.4)",
        }}
      />
    </div>
  );
}
