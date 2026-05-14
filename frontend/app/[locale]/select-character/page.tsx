"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { clsx } from "clsx";

import { useRouter } from "@/i18n/routing";
import { useAuthStore } from "@/lib/state/authStore";
import { userApi } from "@/lib/api/endpoints";
import { CHARACTERS } from "@/lib/data/characters";
import { Logo } from "@/components/scene/Logo";

function useTransientToast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 2500);
    return () => clearTimeout(t);
  }, [msg]);
  return { msg, show: setMsg };
}

export default function SelectCharacterPage() {
  const router = useRouter();
  const { user, hydrate } = useAuthStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { msg, show } = useTransientToast();
  const t = useTranslations("characters.selectPage");
  const tRoles = useTranslations("characters.roles");

  // Profile fields: display_name persists via /users/me; age + interests are
  // local-only (no backend columns yet) — they exist so the V2 UI matches the
  // approved design, and will plug into a profile schema upgrade later.
  const [displayName, setDisplayName] = useState("");
  const [age, setAge] = useState<number>(25);
  const [specialty, setSpecialty] = useState("");
  const [interests, setInterests] = useState("");

  useEffect(() => {
    if (!user) void hydrate();
  }, [user, hydrate]);

  useEffect(() => {
    if (user?.display_name) setDisplayName(user.display_name);
    if (user?.role_label) setSpecialty(user.role_label);
  }, [user]);

  const onConfirm = async () => {
    if (!selected) {
      show(t("toastPickFirst"));
      return;
    }
    if (selected === "other") {
      show(t("toastComingSoon"));
      return;
    }
    setSaving(true);
    try {
      const ch = CHARACTERS.find((c) => c.key === selected);
      await userApi.updateMe({
        character_key: selected,
        display_name: displayName.trim() || undefined,
        role_label: specialty.trim() || ch?.role,
      });
      await hydrate();
      router.push("/town");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main
      className="absolute inset-0 flex flex-col px-4 py-4 md:px-6 md:py-5 gap-4 overflow-y-auto"
      style={{
        background:
          "linear-gradient(155deg,#060120 0%,#0d0435 55%,#060120 100%)",
      }}
    >
      <div className="flex items-center gap-3 self-center">
        <Logo scale={1.6} />
      </div>
      <div
        className="text-center"
        style={{ fontSize: 14, color: "var(--muted)", letterSpacing: 2 }}
      >
        {t("subtitle")}
      </div>

      {/* ═══ PROFILE FORM (上半) ═══ */}
      <section
        className="self-center w-full max-w-3xl bg-card border border-border2 rounded-lg p-4 md:p-5 grid grid-cols-1 md:grid-cols-2 gap-3"
        style={{ boxShadow: "0 0 28px rgba(124,58,237,0.18)" }}
      >
        <Field label={t("fieldDisplayName")}>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t("displayNamePlaceholder")}
            className="w-full bg-[rgba(12,5,35,0.9)] border border-border rounded-md px-3 py-2 outline-none focus:border-accent-1 font-japan"
            style={{ fontSize: 14 }}
          />
        </Field>
        <Field label={t("fieldAge")}>
          <div className="flex items-center gap-3 bg-[rgba(12,5,35,0.9)] border border-border rounded-md px-3 py-2.5">
            <input
              type="range"
              min={13}
              max={80}
              step={1}
              value={age}
              onChange={(e) => setAge(Number(e.target.value))}
              aria-label={t("ageAria")}
              className="age-slider flex-1"
            />
            <span
              className="font-pixel tabular-nums"
              style={{
                fontSize: 16,
                minWidth: 32,
                textAlign: "right",
                color: "var(--a2)",
                textShadow: "0 0 8px var(--a1), 0 0 16px var(--a3)",
                letterSpacing: 1,
              }}
            >
              {age}
            </span>
          </div>
        </Field>
        <Field label={t("fieldSpecialty")}>
          <input
            value={specialty}
            onChange={(e) => setSpecialty(e.target.value)}
            placeholder={t("specialtyPlaceholder")}
            className="w-full bg-[rgba(12,5,35,0.9)] border border-border rounded-md px-3 py-2 outline-none focus:border-accent-1 font-japan"
            style={{ fontSize: 14 }}
          />
        </Field>
        <Field label={t("fieldInterests")}>
          <input
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder={t("interestsPlaceholder")}
            className="w-full bg-[rgba(12,5,35,0.9)] border border-border rounded-md px-3 py-2 outline-none focus:border-accent-1 font-japan"
            style={{ fontSize: 14 }}
          />
        </Field>
      </section>

      {/* ═══ CHARACTER GRID (下半) ═══ */}
      <section className="self-center w-full max-w-3xl grid grid-cols-3 xs:grid-cols-4 md:grid-cols-6 gap-2">
        {CHARACTERS.map((c, i) => (
          <CharacterCard
            key={c.key}
            ckey={c.key}
            emoji={c.emoji}
            role={tRoles(c.key)}
            selected={selected === c.key}
            onSelect={() => setSelected(c.key)}
            gifDelay={(i * 0.07) % 0.6}
          />
        ))}
        <CharacterCard
          ckey="other"
          emoji="❓"
          role={tRoles("other")}
          selected={selected === "other"}
          onSelect={() => {
            setSelected("other");
            show(t("toastComingSoon"));
          }}
          locked
        />
      </section>

      <button
        disabled={!selected || saving}
        onClick={onConfirm}
        className="pixel-btn self-center touch:min-h-[52px] w-full max-w-xs"
        style={{
          fontSize: 12,
          padding: "14px 28px",
          letterSpacing: 3,
          marginTop: 4,
          marginBottom: 16,
        }}
      >
        {saving ? t("savingCta") : t("confirmCta")}
      </button>

      {msg ? (
        <div
          className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-5 py-2 rounded-full bg-card border border-accent-1"
          style={{
            fontSize: 12,
            color: "var(--a2)",
            boxShadow: "0 0 18px rgba(167,139,250,0.4)",
          }}
        >
          {msg}
        </div>
      ) : null}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span
        style={{
          fontSize: 11,
          color: "var(--muted)",
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      {children}
    </label>
  );
}

function CharacterCard({
  ckey,
  emoji,
  role,
  selected,
  onSelect,
  locked = false,
  gifDelay = 0,
}: {
  ckey: string;
  emoji: string;
  role: string;
  selected: boolean;
  onSelect: () => void;
  locked?: boolean;
  gifDelay?: number;
}) {
  return (
    <button
      onClick={onSelect}
      title={role}
      className={clsx(
        "relative rounded-lg flex flex-col items-center justify-end cursor-pointer transition-all pixel-edge",
        "bg-glass border-2 hover:-translate-y-0.5 active:scale-95",
        "h-[100px] xs:h-[96px] md:h-[92px]",
        selected
          ? "border-accent-2 bg-accent-1/15 shadow-[0_0_18px_rgba(167,139,250,0.4)]"
          : "border-border hover:border-accent-1 active:border-accent-1",
        locked && "opacity-70 saturate-50",
      )}
      style={{
        padding: "6px 4px 8px",
      }}
    >
      <div className="flex-1 w-full" />
      <span
        className="animate-gifBounce"
        style={
          {
            fontSize: 32,
            marginBottom: 2,
            ["--gif-dur" as string]: `${1.4 + (ckey.length % 4) * 0.18}s`,
            ["--gif-delay" as string]: `${gifDelay}s`,
          } as React.CSSProperties
        }
      >
        {emoji}
      </span>
      <div
        className="font-japan text-[11px] md:text-[9px]"
        style={{
          color: selected ? "var(--a2)" : "var(--muted)",
          lineHeight: 1.2,
          textAlign: "center",
        }}
      >
        {role}
      </div>
      {selected ? (
        <span
          className="absolute top-1 right-1.5 font-pixel"
          style={{ fontSize: 9, color: "var(--a2)" }}
        >
          ✓
        </span>
      ) : null}
      {locked ? (
        <span
          className="absolute top-1 left-1.5"
          style={{ fontSize: 11, color: "var(--muted)" }}
        >
          🔒
        </span>
      ) : null}
    </button>
  );
}
