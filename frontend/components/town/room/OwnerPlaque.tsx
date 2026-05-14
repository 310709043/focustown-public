"use client";

/**
 * Engraved brass nameplate on the back wall — the bedrock element of the
 * room interior, the one thing visitors will remember. Press Start 2P for
 * the name (display), VT323 for the role caption. Four stacked box-shadows
 * fake the brass + engraved-into-wood look.
 */
export function OwnerPlaque({
  emoji,
  name,
  role,
}: {
  emoji: string;
  name: string;
  role: string | null;
}) {
  return (
    <div
      className="absolute animate-plaqueFlicker text-center"
      style={{
        left: "50%",
        top: "38%",
        transform: "translate(-50%, -50%)",
        padding: "14px 22px 12px",
        background:
          "linear-gradient(180deg, rgba(34,17,42,0.95) 0%, rgba(20,9,30,0.95) 100%)",
        boxShadow: [
          "0 0 0 1px #b97f3a inset",
          "0 0 0 3px #1a0e22 inset",
          "0 1px 0 0 #1a0e22",
          "0 2px 0 0 #b97f3a",
          "0 6px 22px rgba(0,0,0,0.55)",
        ].join(", "),
        imageRendering: "pixelated",
        minWidth: 200,
      }}
    >
      <div
        className="font-japan"
        style={{ fontSize: 28, lineHeight: 1, marginBottom: 6 }}
      >
        {emoji}
      </div>
      <div
        className="font-pixel"
        style={{
          fontSize: 13,
          color: "#ffd9a8",
          letterSpacing: 1.5,
          marginBottom: 4,
          textShadow: "0 0 6px rgba(255,217,168,0.45)",
        }}
      >
        {name.toUpperCase()}
      </div>
      <div
        className="font-mono"
        style={{ fontSize: 12, color: "var(--muted)", letterSpacing: 1 }}
      >
        {role ?? "resident"}
      </div>
    </div>
  );
}
