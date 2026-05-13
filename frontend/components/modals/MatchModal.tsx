"use client";

import { useRouter } from "next/navigation";
import { useMatchStore } from "@/lib/state/matchStore";

export function MatchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const current = useMatchStore((s) => s.current);
  const acceptMatch = useMatchStore((s) => s.accept);
  const skipMatch = useMatchStore((s) => s.skip);

  if (!open || !current) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border2 rounded-lg p-5 max-w-sm w-full relative">
        <button
          onClick={onClose}
          className="absolute top-2.5 right-3 text-muted hover:text-text"
        >
          ✕
        </button>
        <h2
          className="font-pixel text-[9px] mb-3.5 leading-loose text-center"
          style={{ color: "var(--a2)", textShadow: "0 0 8px var(--a1)" }}
        >
          ✦ 今晚的配對推薦
        </h2>
        <div className="text-4xl text-center mb-1.5">💞</div>
        <div className="text-[15px] text-center mb-0.5 text-text">配對 #{current.id.slice(0, 6)}</div>
        <div className="flex items-center gap-2 mb-3 justify-center">
          <div className="flex-1 max-w-[130px] h-1 bg-dim rounded-sm overflow-hidden">
            <div
              className="h-full bg-gradient-to-r"
              style={{
                width: `${current.compatibility}%`,
                background: "linear-gradient(90deg,var(--a3),var(--teal))",
              }}
            />
          </div>
          <div className="text-[11px] text-teal font-medium">{current.compatibility}%</div>
        </div>
        <div
          className="text-[11px] bg-accent-1/5 border border-border rounded p-3 mb-3 leading-relaxed font-body"
          style={{ color: "var(--a2)" }}
        >
          {current.reason}
        </div>
        <div className="flex gap-2 justify-center">
          <button
            className="font-pixel text-[8px] px-3.5 py-2 rounded border border-accent-1 text-accent-1 bg-accent-1/10"
            onClick={async () => {
              const m = await acceptMatch();
              onClose();
              if (m) router.push(`/focus/${m.id}`);
            }}
          >
            ✦ 一起專注
          </button>
          <button
            className="font-pixel text-[8px] px-3.5 py-2 rounded border border-dim text-muted hover:border-muted hover:text-text"
            onClick={() => void skipMatch()}
          >
            下一個 →
          </button>
        </div>
      </div>
    </div>
  );
}
