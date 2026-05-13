"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { shopApi } from "@/lib/api/endpoints";
import type { ShopItem } from "@/lib/api/types.gen";
import { clsx } from "clsx";

const SECTIONS: { title: string; category: string }[] = [
  { title: "🚗 車車外觀",  category: "car" },
  { title: "🌆 場景皮膚",  category: "scene" },
  { title: "✨ 特效道具",  category: "effect" },
];

export default function ShopPage() {
  const router = useRouter();
  const [items, setItems] = useState<ShopItem[]>([]);

  useEffect(() => {
    shopApi.list().then(setItems).catch(() => {});
  }, []);

  const byCategory = (cat: string) => items.filter((i) => i.category === cat);

  return (
    <main
      className="absolute inset-0 flex flex-col overflow-hidden"
      style={{ background: "linear-gradient(135deg,#04011a,#090230,#04011a)" }}
    >
      <header className="h-[46px] bg-[rgba(3,1,17,.96)] border-b border-border flex items-center justify-between px-4">
        <div
          className="font-pixel text-[9px] tracking-widest"
          style={{ color: "var(--pink)", textShadow: "0 0 10px var(--pink)" }}
        >
          🛒 道具商店
        </div>
        <button
          onClick={() => router.push("/town")}
          className="border border-border text-muted font-japan text-[10px] px-3 py-1 rounded hover:border-coral hover:text-coral"
        >
          ✕ 關閉
        </button>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="text-[10px] text-muted mb-1">★ FOCUS+ 訂閱方案</div>
        <div className="bg-card border-[1.5px] border-accent-1 rounded-lg p-5 flex flex-col gap-2 mb-4">
          <div className="flex justify-between items-start">
            <div
              className="font-pixel text-[9px]"
              style={{ color: "var(--a2)", textShadow: "0 0 8px var(--a1)" }}
            >
              ✦ FOCUS+
            </div>
            <div className="text-[14px] text-amber font-medium">
              NT$129<span className="text-[11px] text-muted">/月</span>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5 text-[11px]">
            <li className="before:content-['✓'] before:text-teal before:mr-2">無限配對 + 看誰喜歡你</li>
            <li className="before:content-['✓'] before:text-teal before:mr-2">共同專注室 + 即時聊天</li>
            <li className="before:content-['✓'] before:text-teal before:mr-2">AI 性格分析完整報告</li>
            <li className="before:content-['✓'] before:text-teal before:mr-2">大賞區特別光環效果</li>
            <li className="before:content-['✓'] before:text-teal before:mr-2">所有場景解鎖</li>
          </ul>
          <button className="font-pixel text-[8px] py-3 rounded bg-gradient-to-br from-accent-3 to-accent-4 text-accent-2 tracking-wider hover:shadow-[0_0_20px_rgba(167,139,250,.4)]">
            立即訂閱 NT$129/月 →
          </button>
        </div>

        {SECTIONS.map(({ title, category }) => {
          const list = byCategory(category);
          if (!list.length) return null;
          return (
            <div key={category}>
              <div className="text-[10px] text-muted my-3 tracking-wide">{title}</div>
              <div className="grid grid-cols-2 gap-2 mb-1">
                {list.map((it) => (
                  <div
                    key={it.id}
                    className={clsx(
                      "bg-card border rounded-lg p-3 flex flex-col gap-1.5 cursor-pointer transition-all hover:-translate-y-0.5",
                      it.featured ? "border-pink bg-pink/5" : "border-border",
                    )}
                  >
                    <div className="text-2xl">{it.icon}</div>
                    <div className="text-[12px]">
                      {it.name}{" "}
                      {it.featured ? <span className="text-[10px] text-pink ml-1">熱門</span> : null}
                    </div>
                    <div className="text-[11px] text-muted leading-tight">{it.description}</div>
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] text-amber">
                        NT${(it.price_cents / 100).toFixed(0)}
                      </span>
                      <button className="font-pixel text-[8px] border border-accent-1 text-accent-1 px-2.5 py-1 rounded">
                        購買
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}

        {items.length === 0 ? (
          <div className="text-[11px] text-muted text-center mt-4">
            尚未建立商品（後端 seeder 待加入）
          </div>
        ) : null}
      </div>
    </main>
  );
}
