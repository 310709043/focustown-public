"use client";

import { useEffect, useMemo, useState } from "react";
import { NPCS } from "@/lib/data/npcs";
import { findCharacter } from "@/lib/data/characters";
import { STATUSES, statusByCode, type Status } from "@/lib/data/statuses";

type PedState = {
  x: number;       // 0..100 (% left)
  status: Status;
  walkPhase: number; // staggers leg animation
};

const POSITIONS = [4, 13, 22, 32, 42, 52, 62, 72, 82, 91];

export function Pedestrians() {
  const [states, setStates] = useState<PedState[]>(() =>
    NPCS.map((n, i) => ({
      x: POSITIONS[i % POSITIONS.length],
      status: statusByCode(n.initialStatus),
      walkPhase: (i * 0.13) % 0.5,
    })),
  );

  // Cycle each NPC's x position every 4-6s and status every 12-20s, but
  // randomized per NPC so they don't all jump together.
  useEffect(() => {
    const positionTimers = NPCS.map((_n, i) =>
      setInterval(
        () =>
          setStates((prev) => {
            const next = [...prev];
            next[i] = {
              ...next[i],
              x: POSITIONS[Math.floor(Math.random() * POSITIONS.length)],
            };
            return next;
          }),
        (3.5 + Math.random() * 2.5) * 1000,
      ),
    );
    const statusTimers = NPCS.map((_n, i) =>
      setInterval(
        () =>
          setStates((prev) => {
            const next = [...prev];
            next[i] = {
              ...next[i],
              status: STATUSES[Math.floor(Math.random() * STATUSES.length)],
            };
            return next;
          }),
        (10 + Math.random() * 10) * 1000,
      ),
    );
    return () => {
      positionTimers.forEach((t) => clearInterval(t));
      statusTimers.forEach((t) => clearInterval(t));
    };
  }, []);

  const npcs = useMemo(
    () =>
      NPCS.map((n) => ({
        ...n,
        character: findCharacter(n.characterKey),
      })),
    [],
  );

  return (
    <div className="absolute inset-0 z-[6] pointer-events-none" aria-hidden>
      {npcs.map((n, i) => {
        const ch = n.character;
        if (!ch) return null;
        const s = states[i];
        return (
          <div
            key={n.characterKey}
            className="absolute"
            style={{
              left: `${s.x}%`,
              bottom: 104,
              transition: "left 3.5s ease-in-out",
            }}
          >
            {/* status bubble */}
            <div
              key={s.status.code} /* re-mount triggers pop animation */
              className="animate-statusPop"
              style={{
                position: "absolute",
                bottom: 32,
                left: "50%",
                transform: "translateX(-50%)",
                background: "rgba(3,1,17,0.92)",
                border: `1px solid ${s.status.color}`,
                color: s.status.color,
                fontSize: 9,
                padding: "1.5px 6px",
                borderRadius: 99,
                whiteSpace: "nowrap",
                boxShadow: `0 0 10px ${s.status.color}55`,
                textShadow: `0 0 4px ${s.status.color}`,
              }}
            >
              {s.status.emoji} {s.status.label}
            </div>

            {/* name plate */}
            <div
              style={{
                fontSize: 7,
                color: "var(--a2)",
                textAlign: "center",
                textShadow: "0 0 4px var(--a3)",
                marginBottom: 1,
                whiteSpace: "nowrap",
              }}
            >
              {ch.name}
            </div>

            {/* head */}
            <div
              className="animate-pedWalk"
              style={{
                width: 10,
                height: 10,
                margin: "0 auto",
                background: ch.bodyColor,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 8,
                borderRadius: 1,
              }}
            >
              {ch.emoji}
            </div>
            {/* body */}
            <div
              style={{
                width: 10,
                height: 9,
                margin: "0 auto",
                background: ch.bodyColor,
                filter: "brightness(0.8)",
              }}
            />
            {/* legs */}
            <div
              className="flex w-[10px] mx-auto animate-legs"
              style={
                {
                  gap: 1,
                  ["--ld" as string]: `${s.walkPhase}s`,
                } as React.CSSProperties
              }
            >
              <div
                className="flex-1 h-1.5"
                style={{ background: ch.roofColor }}
              />
              <div
                className="flex-1 h-1.5"
                style={{ background: ch.roofColor }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
