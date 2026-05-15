"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";

import type { RoomItem } from "@/lib/api/types.gen";

/**
 * Phase 5 — single placed decoration inside a room.
 *
 * SRP: this component owns only the drag math (pointer events → percentage
 * delta inside the parent box). State mutations and API calls live one
 * level up in DecorationCanvas; this just calls back with the final (x, y)
 * percentages.
 *
 * Native pointer events handle mouse, touch, and pen with one code path;
 * setPointerCapture keeps move/up events flowing even if the cursor
 * leaves the element mid-drag.
 */

type Props = {
  item: RoomItem;
  icon: string;
  editable: boolean;
  pending: boolean;
  onMove: (x: number, y: number) => void;
  onRemove: () => void;
};

type DragState = {
  startClientX: number;
  startClientY: number;
  baseX: number;
  baseY: number;
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));

export function DecorationItem({
  item,
  icon,
  editable,
  pending,
  onMove,
  onRemove,
}: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [previewXY, setPreviewXY] = useState<{ x: number; y: number } | null>(
    null,
  );
  const t = useTranslations("town.room.decoration");

  function deltaPct(e: { clientX: number; clientY: number }) {
    if (!drag || !elRef.current) return null;
    const parent = elRef.current.parentElement;
    if (!parent) return null;
    const box = parent.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return null;
    const dxPct = ((e.clientX - drag.startClientX) / box.width) * 100;
    const dyPct = ((e.clientY - drag.startClientY) / box.height) * 100;
    return {
      x: clamp(drag.baseX + dxPct, 0, 100),
      y: clamp(drag.baseY + dyPct, 0, 100),
    };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!editable) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      startClientX: e.clientX,
      startClientY: e.clientY,
      baseX: item.x,
      baseY: item.y,
    });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const next = deltaPct(e);
    if (next) setPreviewXY(next);
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const next = deltaPct(e);
    setDrag(null);
    setPreviewXY(null);
    if (!next) return;
    const rx = Math.round(next.x);
    const ry = Math.round(next.y);
    if (rx === item.x && ry === item.y) return;
    onMove(rx, ry);
  }

  const renderX = previewXY?.x ?? item.x;
  const renderY = previewXY?.y ?? item.y;

  return (
    <div
      ref={elRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        setDrag(null);
        setPreviewXY(null);
      }}
      style={{
        position: "absolute",
        left: `${renderX}%`,
        top: `${renderY}%`,
        transform: "translate(-50%, -50%)",
        zIndex: item.z_index + 1,
        cursor: editable ? (drag ? "grabbing" : "grab") : "default",
        userSelect: "none",
        touchAction: editable ? "none" : "auto",
        opacity: pending ? 0.55 : 1,
        transition: drag ? "none" : "opacity 0.15s",
        fontSize: 32,
        filter: editable
          ? "drop-shadow(0 0 6px rgba(252,211,77,0.4))"
          : "drop-shadow(0 0 4px rgba(0,0,0,0.6))",
        imageRendering: "pixelated",
        lineHeight: 1,
      }}
      aria-label={editable ? t("dragAria") : t("iconAria")}
      role={editable ? "button" : "img"}
    >
      <span>{icon}</span>
      {editable && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label={t("removeAria")}
          className="font-mono"
          style={{
            position: "absolute",
            top: -10,
            right: -10,
            width: 18,
            height: 18,
            borderRadius: 9,
            border: "1px solid var(--border2)",
            background: "rgba(2,0,12,0.88)",
            color: "var(--coral)",
            fontSize: 11,
            lineHeight: "16px",
            cursor: "pointer",
            padding: 0,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
