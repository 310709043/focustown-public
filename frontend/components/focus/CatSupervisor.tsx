"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";

import { type FaceDirection, useFaceDirection } from "@/lib/hooks/useFaceDirection";

/** Maps each direction to its sprite filename under /public/cat/. */
const CAT_IMAGE: Record<FaceDirection, string> = {
  front:        "/cat/front.png",
  left:         "/cat/left.png",
  right:        "/cat/right.png",
  up:           "/cat/up.png",
  down:         "/cat/down.png",
  "upper-left":  "/cat/upper-left.png",
  "upper-right": "/cat/upper-right.png",
  "lower-left":  "/cat/lower-left.png",
  "lower-right": "/cat/lower-right.png",
};

const CAT_SIZE = 96; // px — compact enough for the right rail

/**
 * CSS pixel-art cat placeholder — shown when the real sprite files have not
 * been added to /public/cat/ yet. Eight squares arranged as a face.
 */
function CatPlaceholder({ direction }: { direction: FaceDirection }) {
  // Eye offset hints at the current gaze direction.
  const eyeOffset: Record<FaceDirection, { x: number; y: number }> = {
    front:        { x: 0, y: 0 },
    left:         { x: -3, y: 0 },
    right:        { x: 3, y: 0 },
    up:           { x: 0, y: -3 },
    down:         { x: 0, y: 3 },
    "upper-left":  { x: -2, y: -2 },
    "upper-right": { x: 2, y: -2 },
    "lower-left":  { x: -2, y: 2 },
    "lower-right": { x: 2, y: 2 },
  };
  const { x, y } = eyeOffset[direction];

  return (
    <div
      aria-hidden
      style={{
        width: CAT_SIZE,
        height: CAT_SIZE,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      {/* Face outline */}
      <div
        style={{
          width: 56,
          height: 52,
          border: "2px solid var(--accent-2)",
          borderRadius: "40% 40% 35% 35%",
          position: "relative",
          background: "rgba(168,85,247,0.08)",
          boxShadow: "0 0 8px rgba(168,85,247,0.25)",
        }}
      >
        {/* Ears */}
        <div style={{ position: "absolute", top: -12, left: 5, width: 0, height: 0,
          borderLeft: "7px solid transparent", borderRight: "7px solid transparent",
          borderBottom: "12px solid var(--accent-2)" }} />
        <div style={{ position: "absolute", top: -12, right: 5, width: 0, height: 0,
          borderLeft: "7px solid transparent", borderRight: "7px solid transparent",
          borderBottom: "12px solid var(--accent-2)" }} />

        {/* Eyes */}
        <div style={{
          position: "absolute",
          left: 10 + x,
          top: 16 + y,
          width: 7,
          height: 7,
          background: "var(--accent-2)",
          borderRadius: "50%",
          boxShadow: "0 0 4px var(--accent-2)",
          transition: "left 0.15s ease, top 0.15s ease",
        }} />
        <div style={{
          position: "absolute",
          right: 10 - x,
          top: 16 + y,
          width: 7,
          height: 7,
          background: "var(--accent-2)",
          borderRadius: "50%",
          boxShadow: "0 0 4px var(--accent-2)",
          transition: "right 0.15s ease, top 0.15s ease",
        }} />

        {/* Nose */}
        <div style={{
          position: "absolute",
          left: "50%",
          top: 28,
          transform: "translateX(-50%)",
          width: 5,
          height: 4,
          background: "var(--accent-3)",
          borderRadius: "50%",
        }} />
      </div>
    </div>
  );
}

/**
 * Supervision cat for the solo focus page.
 *
 * User-opt-in: the webcam is NOT activated until the user explicitly clicks
 * "Enable". Camera permission is requested only at that point.
 *
 * All video processing is local — frames are analysed by MediaPipe WASM in
 * the browser and never sent to any server.
 *
 * Sprite images go in /public/cat/{direction}.png — see CAT_IMAGE map above.
 * Until those files are added, the CSS placeholder cat is shown instead.
 */
export function CatSupervisor() {
  const t = useTranslations("focus.catSupervisor");
  const { camState, direction, videoRef, enable, disable } = useFaceDirection();
  const [imgError, setImgError] = useState(false);

  const isActive = camState === "active";
  const isBusy = camState === "requesting" || camState === "loading";

  // Reset error flag when direction changes so a different sprite can try loading.
  const handleImgError = () => setImgError(true);
  const handleImgLoad = () => setImgError(false);

  const statusText: Record<string, string> = {
    idle:        t("statusIdle"),
    requesting:  t("statusRequesting"),
    loading:     t("statusLoading"),
    active:      t("statusActive"),
    denied:      t("statusDenied"),
    unsupported: t("statusUnsupported"),
  };

  const statusColor: Record<string, string> = {
    idle:        "var(--ink-mute)",
    requesting:  "var(--accent-2)",
    loading:     "var(--accent-2)",
    active:      "var(--accent)",
    denied:      "#f87171",
    unsupported: "#f87171",
  };

  return (
    <div
      data-testid="cat-supervisor"
      className="pixel-panel"
      style={{ padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span
          className="font-silkscreen"
          style={{ fontSize: 9, color: "var(--accent-2)", letterSpacing: "0.2em" }}
        >
          {t("title")}
        </span>
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: statusColor[camState] ?? "var(--ink-mute)",
              boxShadow: isActive ? "0 0 5px var(--accent)" : "none",
            }}
          />
          <span
            className="font-silkscreen"
            style={{ fontSize: 8, color: statusColor[camState] ?? "var(--ink-mute)" }}
          >
            {statusText[camState] ?? ""}
          </span>
        </div>
      </div>

      {/* Cat display */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: CAT_SIZE,
          opacity: isActive ? 1 : 0.45,
          transition: "opacity 0.4s ease",
        }}
      >
        {!imgError ? (
          <Image
            key={direction}
            src={CAT_IMAGE[direction]}
            alt=""
            aria-hidden
            width={CAT_SIZE}
            height={CAT_SIZE}
            style={{ imageRendering: "pixelated", objectFit: "contain" }}
            onError={handleImgError}
            onLoad={handleImgLoad}
            unoptimized
          />
        ) : (
          <CatPlaceholder direction={isActive ? direction : "front"} />
        )}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {isActive ? (
          <button
            type="button"
            data-testid="cat-supervisor-disable"
            className="pixel-btn"
            aria-label={t("disableAria")}
            style={{ flex: 1, padding: "4px 8px", fontSize: 9, letterSpacing: "0.18em" }}
            onClick={disable}
          >
            {t("disableCta")}
          </button>
        ) : (
          <button
            type="button"
            data-testid="cat-supervisor-enable"
            className="pixel-btn primary"
            aria-label={t("enableAria")}
            disabled={isBusy}
            style={{
              flex: 1,
              padding: "4px 8px",
              fontSize: 9,
              letterSpacing: "0.18em",
              opacity: isBusy ? 0.6 : 1,
            }}
            onClick={() => void enable()}
          >
            {isBusy ? "..." : t("enableCta")}
          </button>
        )}
      </div>

      {/* Privacy notice */}
      <div
        className="font-silkscreen"
        style={{ fontSize: 7, color: "var(--ink-dim)", letterSpacing: "0.08em", textAlign: "center" }}
      >
        {t("privacy")}
      </div>

      {/* Hidden video element — purely for face detection; never displayed */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        aria-hidden
        playsInline
        muted
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
      />
    </div>
  );
}
