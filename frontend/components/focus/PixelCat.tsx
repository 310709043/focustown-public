"use client";

import type { CatMood } from "@/lib/hooks/useCatMood";
import type { FaceData } from "@/lib/hooks/useFaceDirection";

interface PixelCatProps {
  mood: CatMood;
  size?: number;
  /** Live face pose — drives pupil tracking, head tilt, proximity reactions. */
  faceData?: FaceData | null;
}

/**
 * Pure-CSS animated pixel cat that changes expression per mood.
 *
 * Palette inherits from the app's CSS custom properties so it always
 * matches the current theme (Era B warm-peach + dusty-rose + slate).
 *
 * Mood expressions:
 *   idle/watching — neutral, blinking
 *   happy        — curved eyes (^_^), blush marks, tail wag
 *   suspicious   — squint eyes, one ear down
 *   angry        — sharp eyes, eyebrows, puffed body, tail stiff
 *   sleeping     — closed eyes (- -), zzZ, slow breathing
 */
export function PixelCat({ mood, size = 80, faceData }: PixelCatProps) {
  const s = size / 80; // scale factor relative to base 80px
  const px = (n: number) => `${n * s}px`;

  // Mirror the user's head tilt at 40% magnitude so the cat mimics them subtly.
  const tiltDeg = faceData ? faceData.tiltDeg * 0.4 : 0;

  const moodClass =
    mood === "happy" ? "cat-bounce"
    : mood === "idle" || mood === "watching" ? "cat-breathe"
    : "";

  // Tilt lives in an outer wrapper so CSS keyframe animations on the
  // inner div never overwrite the rotate transform.
  return (
    <div
      aria-hidden
      style={{
        transform: `rotate(${tiltDeg}deg)`,
        transition: "transform 0.12s ease",
      }}
    >
    <div
      className={moodClass}
      style={{
        width: px(80),
        height: px(80),
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Tail */}
      <div
        className={mood === "happy" ? "cat-tail-wag" : mood === "angry" ? "cat-tail-stiff" : "cat-tail-idle"}
        style={{
          position: "absolute",
          bottom: px(10),
          right: px(6),
          width: px(12),
          height: px(20),
          borderRadius: `0 ${px(8)} ${px(8)} 0`,
          border: `${px(2.5)} solid var(--a3)`,
          borderLeft: "none",
          transformOrigin: "bottom left",
        }}
      />

      {/* Body */}
      <div
        style={{
          position: "absolute",
          bottom: px(4),
          width: px(34),
          height: px(24),
          borderRadius: `${px(10)} ${px(10)} ${px(6)} ${px(6)}`,
          background: "var(--a3)",
          opacity: 0.35,
          transition: "transform 0.3s",
          transform: mood === "angry" ? `scale(1.12)` : "scale(1)",
        }}
      />

      {/* Head */}
      <div
        style={{
          position: "relative",
          width: px(42),
          height: px(38),
          borderRadius: `${px(14)} ${px(14)} ${px(12)} ${px(12)}`,
          background: `rgba(201,138,163,0.12)`,
          border: `${px(2.5)} solid var(--a3)`,
          boxShadow: `0 0 ${px(12)} rgba(201,138,163,0.2)`,
          marginBottom: px(8),
          transition: "border-color 0.3s",
          borderColor: mood === "angry" ? "var(--red)" : mood === "suspicious" ? "var(--yellow)" : "var(--a3)",
        }}
      >
        {/* Left ear */}
        <div
          style={{
            position: "absolute",
            top: px(-10),
            left: px(3),
            width: 0,
            height: 0,
            borderLeft: `${px(6)} solid transparent`,
            borderRight: `${px(6)} solid transparent`,
            borderBottom: `${px(11)} solid ${mood === "angry" ? "var(--red)" : "var(--a3)"}`,
            transition: "transform 0.3s, border-bottom-color 0.3s",
            transform: mood === "suspicious" ? "rotate(-15deg)" : "rotate(0)",
          }}
        />
        {/* Right ear */}
        <div
          style={{
            position: "absolute",
            top: px(-10),
            right: px(3),
            width: 0,
            height: 0,
            borderLeft: `${px(6)} solid transparent`,
            borderRight: `${px(6)} solid transparent`,
            borderBottom: `${px(11)} solid ${mood === "angry" ? "var(--red)" : "var(--a3)"}`,
            transition: "border-bottom-color 0.3s",
          }}
        />
        {/* Inner ear accents */}
        <div
          style={{
            position: "absolute",
            top: px(-5),
            left: px(6),
            width: 0,
            height: 0,
            borderLeft: `${px(3)} solid transparent`,
            borderRight: `${px(3)} solid transparent`,
            borderBottom: `${px(6)} solid ${mood === "angry" ? "var(--red-soft)" : "rgba(233,167,110,0.3)"}`,
            transition: "transform 0.3s",
            transform: mood === "suspicious" ? "rotate(-15deg)" : "rotate(0)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: px(-5),
            right: px(6),
            width: 0,
            height: 0,
            borderLeft: `${px(3)} solid transparent`,
            borderRight: `${px(3)} solid transparent`,
            borderBottom: `${px(6)} solid ${mood === "angry" ? "var(--red-soft)" : "rgba(233,167,110,0.3)"}`,
          }}
        />

        {/* Angry eyebrows */}
        {mood === "angry" && (
          <>
            <div
              style={{
                position: "absolute",
                top: px(8),
                left: px(6),
                width: px(10),
                height: px(2.5),
                background: "var(--red)",
                borderRadius: px(1),
                transform: "rotate(15deg)",
                transformOrigin: "right center",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: px(8),
                right: px(6),
                width: px(10),
                height: px(2.5),
                background: "var(--red)",
                borderRadius: px(1),
                transform: "rotate(-15deg)",
                transformOrigin: "left center",
              }}
            />
          </>
        )}

        {/* Eyes */}
        <Eyes mood={mood} s={s} faceData={faceData} />

        {/* Blush marks (happy) */}
        {mood === "happy" && (
          <>
            <div
              style={{
                position: "absolute",
                top: px(21),
                left: px(3),
                width: px(6),
                height: px(3),
                borderRadius: "50%",
                background: "rgba(233,167,110,0.35)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: px(21),
                right: px(3),
                width: px(6),
                height: px(3),
                borderRadius: "50%",
                background: "rgba(233,167,110,0.35)",
              }}
            />
          </>
        )}

        {/* Nose */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: px(22),
            transform: "translateX(-50%)",
            width: px(4),
            height: px(3),
            borderRadius: "50%",
            background: mood === "angry" ? "var(--red)" : "var(--a1)",
            transition: "background 0.3s",
          }}
        />

        {/* Mouth */}
        <Mouth mood={mood} s={s} />

        {/* Whiskers */}
        <Whiskers mood={mood} s={s} />
      </div>

      {/* Paws */}
      <div
        style={{
          position: "absolute",
          bottom: px(4),
          display: "flex",
          gap: px(10),
        }}
      >
        <div
          style={{
            width: px(8),
            height: px(6),
            borderRadius: `0 0 ${px(4)} ${px(4)}`,
            background: "var(--a3)",
            opacity: 0.5,
          }}
        />
        <div
          style={{
            width: px(8),
            height: px(6),
            borderRadius: `0 0 ${px(4)} ${px(4)}`,
            background: "var(--a3)",
            opacity: 0.5,
          }}
        />
      </div>

      {/* Sleeping zzZ */}
      {mood === "sleeping" && (
        <div
          className="font-silkscreen cat-zzz"
          style={{
            position: "absolute",
            top: px(-2),
            right: px(2),
            fontSize: px(10),
            color: "var(--a4)",
            opacity: 0.7,
          }}
        >
          z<span style={{ fontSize: px(8) }}>z</span>
          <span style={{ fontSize: px(6) }}>Z</span>
        </div>
      )}
    </div>
    </div>
  );
}

function Eyes({ mood, s, faceData }: { mood: CatMood; s: number; faceData?: FaceData | null }) {
  const px = (n: number) => `${n * s}px`;
  // Shared pupil offset for all moods that have visible pupils.
  const pupilOffX = faceData ? (faceData.cx - 0.5) * 3 : 0;
  const pupilOffY = faceData ? (faceData.cy - 0.5) * 2.5 : 0;
  const pupilTranslate = `translate(${px(pupilOffX)}, ${px(pupilOffY)})`;

  // Sleeping: horizontal lines
  if (mood === "sleeping") {
    return (
      <>
        <div
          style={{
            position: "absolute",
            top: px(15),
            left: px(8),
            width: px(8),
            height: px(2.5),
            background: "var(--a3)",
            borderRadius: px(1),
          }}
        />
        <div
          style={{
            position: "absolute",
            top: px(15),
            right: px(8),
            width: px(8),
            height: px(2.5),
            background: "var(--a3)",
            borderRadius: px(1),
          }}
        />
      </>
    );
  }

  // Happy: curved arcs (^_^)
  if (mood === "happy") {
    return (
      <>
        <div
          style={{
            position: "absolute",
            top: px(13),
            left: px(8),
            width: px(8),
            height: px(5),
            borderTop: `${px(2.5)} solid var(--a3)`,
            borderRadius: `${px(5)} ${px(5)} 0 0`,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: px(13),
            right: px(8),
            width: px(8),
            height: px(5),
            borderTop: `${px(2.5)} solid var(--a3)`,
            borderRadius: `${px(5)} ${px(5)} 0 0`,
          }}
        />
      </>
    );
  }

  // Suspicious: squinted (one smaller)
  if (mood === "suspicious") {
    return (
      <>
        <div
          style={{
            position: "absolute",
            top: px(14),
            left: px(9),
            width: px(7),
            height: px(4),
            background: "#facc15",
            borderRadius: "50%",
            boxShadow: `0 0 ${px(4)} rgba(250,204,21,0.4)`,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: px(1),
              left: px(2.5),
              width: px(2.5),
              height: px(2.5),
              background: "#1a1a2e",
              borderRadius: "50%",
              transform: pupilTranslate,
              transition: "transform 0.1s ease",
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            top: px(15),
            right: px(9),
            width: px(7),
            height: px(3),
            background: "#facc15",
            borderRadius: "50%",
            boxShadow: `0 0 ${px(4)} rgba(250,204,21,0.4)`,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: px(0.5),
              left: px(2.5),
              width: px(2),
              height: px(2),
              background: "#1a1a2e",
              borderRadius: "50%",
              transform: pupilTranslate,
              transition: "transform 0.1s ease",
            }}
          />
        </div>
      </>
    );
  }

  // Angry: sharp, narrow eyes
  if (mood === "angry") {
    return (
      <>
        <div
          style={{
            position: "absolute",
            top: px(14),
            left: px(8),
            width: px(8),
            height: px(5),
            background: "#f87171",
            borderRadius: `${px(1)} ${px(4)} ${px(4)} ${px(1)}`,
            boxShadow: `0 0 ${px(6)} rgba(248,113,113,0.5)`,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: px(1),
              left: px(2),
              width: px(3),
              height: px(3),
              background: "#1a1a2e",
              borderRadius: "50%",
              transform: pupilTranslate,
              transition: "transform 0.1s ease",
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            top: px(14),
            right: px(8),
            width: px(8),
            height: px(5),
            background: "#f87171",
            borderRadius: `${px(4)} ${px(1)} ${px(1)} ${px(4)}`,
            boxShadow: `0 0 ${px(6)} rgba(248,113,113,0.5)`,
          }}
        >
          <div
            style={{
              position: "absolute",
              top: px(1),
              left: px(2),
              width: px(3),
              height: px(3),
              background: "#1a1a2e",
              borderRadius: "50%",
              transform: pupilTranslate,
              transition: "transform 0.1s ease",
            }}
          />
        </div>
      </>
    );
  }

  // Default (idle, watching): round eyes with pupil tracking + proximity reactions
  // Proximity > 0.55 → wide eyes (cat startled by closeness)
  // Proximity < 0.15 → smaller squint (user far away)
  const isClose = !!faceData && faceData.proximity > 0.55;
  const isFar = !!faceData && faceData.proximity < 0.15;
  const eyeSize = isClose ? 9 : isFar ? 5.5 : 7;
  const pupilSize = isClose ? 4.5 : isFar ? 2 : 3;
  const pupilCenter = (eyeSize - pupilSize) / 2;
  const glowSize = isClose ? px(8) : px(4);
  const glowAlpha = isClose ? 0.6 : 0.35;

  return (
    <>
      <div
        className="cat-eye-blink"
        style={{
          position: "absolute",
          top: px(13 - (eyeSize - 7) / 2),
          left: px(8 - (eyeSize - 7) / 2),
          width: px(eyeSize),
          height: px(eyeSize),
          background: "var(--a3)",
          borderRadius: "50%",
          transition: "width 0.2s, height 0.2s, top 0.2s, left 0.2s",
          boxShadow: `0 0 ${glowSize} rgba(201,138,163,${glowAlpha})`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: px(pupilCenter),
            left: px(pupilCenter),
            width: px(pupilSize),
            height: px(pupilSize),
            background: "#1a1a2e",
            borderRadius: "50%",
            transform: `translate(${px(pupilOffX)}, ${px(pupilOffY)})`,
            transition: "transform 0.1s ease, width 0.2s, height 0.2s",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: px(1.5),
            right: px(1.5),
            width: px(1.5),
            height: px(1.5),
            background: "rgba(255,255,255,0.6)",
            borderRadius: "50%",
          }}
        />
      </div>
      <div
        className="cat-eye-blink"
        style={{
          position: "absolute",
          top: px(13 - (eyeSize - 7) / 2),
          right: px(8 - (eyeSize - 7) / 2),
          width: px(eyeSize),
          height: px(eyeSize),
          background: "var(--a3)",
          borderRadius: "50%",
          transition: "width 0.2s, height 0.2s, top 0.2s, right 0.2s",
          boxShadow: `0 0 ${glowSize} rgba(201,138,163,${glowAlpha})`,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: px(pupilCenter),
            left: px(pupilCenter),
            width: px(pupilSize),
            height: px(pupilSize),
            background: "#1a1a2e",
            borderRadius: "50%",
            transform: `translate(${px(pupilOffX)}, ${px(pupilOffY)})`,
            transition: "transform 0.1s ease, width 0.2s, height 0.2s",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: px(1.5),
            right: px(1.5),
            width: px(1.5),
            height: px(1.5),
            background: "rgba(255,255,255,0.6)",
            borderRadius: "50%",
          }}
        />
      </div>
    </>
  );
}

function Mouth({ mood, s }: { mood: CatMood; s: number }) {
  const px = (n: number) => `${n * s}px`;

  // Happy: wide smile (w shape)
  if (mood === "happy") {
    return (
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: px(26),
          transform: "translateX(-50%)",
          display: "flex",
          gap: px(1),
        }}
      >
        <div
          style={{
            width: px(5),
            height: px(3),
            borderBottom: `${px(1.5)} solid var(--a3)`,
            borderRadius: `0 0 ${px(3)} ${px(3)}`,
          }}
        />
        <div
          style={{
            width: px(5),
            height: px(3),
            borderBottom: `${px(1.5)} solid var(--a3)`,
            borderRadius: `0 0 ${px(3)} ${px(3)}`,
          }}
        />
      </div>
    );
  }

  // Angry: frown
  if (mood === "angry") {
    return (
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: px(27),
          transform: "translateX(-50%)",
          width: px(8),
          height: px(3),
          borderTop: `${px(1.5)} solid #f87171`,
          borderRadius: `${px(4)} ${px(4)} 0 0`,
        }}
      />
    );
  }

  // Default: small neutral mouth
  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        top: px(26),
        transform: "translateX(-50%)",
        display: "flex",
        gap: px(1),
      }}
    >
      <div
        style={{
          width: px(4),
          height: px(2),
          borderBottom: `${px(1.5)} solid var(--a3)`,
          borderRadius: `0 0 ${px(2)} ${px(2)}`,
        }}
      />
      <div
        style={{
          width: px(4),
          height: px(2),
          borderBottom: `${px(1.5)} solid var(--a3)`,
          borderRadius: `0 0 ${px(2)} ${px(2)}`,
        }}
      />
    </div>
  );
}

function Whiskers({ mood, s }: { mood: CatMood; s: number }) {
  const px = (n: number) => `${n * s}px`;
  const color = mood === "angry" ? "rgba(248,113,113,0.4)" : "rgba(201,138,163,0.3)";

  return (
    <>
      {/* Left whiskers */}
      <div
        style={{
          position: "absolute",
          top: px(22),
          left: px(-4),
          width: px(10),
          height: px(1.5),
          background: color,
          borderRadius: px(1),
          transform: "rotate(-8deg)",
          transition: "transform 0.3s",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: px(25),
          left: px(-3),
          width: px(10),
          height: px(1.5),
          background: color,
          borderRadius: px(1),
          transform: "rotate(8deg)",
          transition: "transform 0.3s",
        }}
      />
      {/* Right whiskers */}
      <div
        style={{
          position: "absolute",
          top: px(22),
          right: px(-4),
          width: px(10),
          height: px(1.5),
          background: color,
          borderRadius: px(1),
          transform: "rotate(8deg)",
          transition: "transform 0.3s",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: px(25),
          right: px(-3),
          width: px(10),
          height: px(1.5),
          background: color,
          borderRadius: px(1),
          transform: "rotate(-8deg)",
          transition: "transform 0.3s",
        }}
      />
    </>
  );
}
