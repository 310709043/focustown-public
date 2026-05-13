"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/state/authStore";
import { userApi } from "@/lib/api/endpoints";
import { CHARACTERS } from "@/lib/data/characters";
import { clsx } from "clsx";

export default function SelectCharacterPage() {
  const router = useRouter();
  const { user, hydrate } = useAuthStore();
  const [selected, setSelected] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) void hydrate();
  }, [user, hydrate]);

  const onConfirm = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const ch = CHARACTERS.find((c) => c.key === selected);
      await userApi.updateMe({
        character_key: selected,
        role_label: ch?.role,
      });
      await hydrate();
      router.push("/town");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main
      className="absolute inset-0 flex flex-col items-center px-4 py-4 gap-2.5 overflow-y-auto"
      style={{
        background:
          "linear-gradient(155deg,#060120 0%,#0d0435 55%,#060120 100%)",
      }}
    >
      <div
        className="font-pixel text-[10px] tracking-widest mt-2"
        style={{ color: "var(--a2)", textShadow: "0 0 10px var(--a1)" }}
      >
        選擇你的角色
      </div>
      <div className="text-[11px] text-muted -mt-1">30 種職業身份 · 找到最像你的那一個</div>
      <div className="grid grid-cols-5 gap-1.5 max-w-[600px] w-full">
        {CHARACTERS.map((c) => (
          <button
            key={c.key}
            onClick={() => setSelected(c.key)}
            className={clsx(
              "relative p-2 rounded-lg text-center cursor-pointer transition-all bg-glass border",
              selected === c.key
                ? "border-accent-2 bg-accent-1/15 shadow-[0_0_16px_rgba(167,139,250,.3)]"
                : "border-border hover:border-accent-1 hover:-translate-y-0.5",
            )}
          >
            <span className="text-xl block mb-0.5">{c.emoji}</span>
            <div className="text-[10px]">{c.name}</div>
            <div className="text-[8px] text-muted leading-tight">{c.role}</div>
            {selected === c.key ? (
              <span className="absolute top-0.5 right-1 text-[9px] text-accent-2">✓</span>
            ) : null}
          </button>
        ))}
      </div>
      <button
        disabled={!selected || saving}
        onClick={onConfirm}
        className="font-pixel text-[8px] tracking-widest border-2 border-accent-1 text-accent-1 px-6 py-2.5 rounded mt-2 disabled:opacity-30 hover:border-accent-2"
      >
        {saving ? "儲存中..." : "進入小鎮 ▶"}
      </button>
    </main>
  );
}
