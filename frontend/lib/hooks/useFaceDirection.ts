"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type FaceDirection =
  | "front"
  | "left"
  | "right"
  | "up"
  | "down"
  | "upper-left"
  | "upper-right"
  | "lower-left"
  | "lower-right";

export type CamState =
  | "idle"
  | "requesting"
  | "loading"
  | "active"
  | "denied"
  | "unsupported";

export interface UseFaceDirectionResult {
  camState: CamState;
  direction: FaceDirection;
  videoRef: React.RefObject<HTMLVideoElement>;
  enable: () => Promise<void>;
  disable: () => void;
}

/**
 * Maps a normalised face centroid (cx, cy in 0-1 range) to a direction.
 * X is inverted so the result matches the user's mirror perspective:
 *   user moves right → face appears left in raw video → after inversion → "right"
 */
function centroidToDirection(
  normX: number,
  normY: number,
): FaceDirection {
  // Invert X: camera video is a mirror of user's actual position.
  const cx = 1 - normX;
  const col = cx < 0.35 ? "left" : cx > 0.65 ? "right" : "center";
  const row = normY < 0.35 ? "up" : normY > 0.65 ? "down" : "center";

  if (col === "center" && row === "center") return "front";
  if (col === "left" && row === "center") return "left";
  if (col === "right" && row === "center") return "right";
  if (col === "center" && row === "up") return "up";
  if (col === "center" && row === "down") return "down";
  if (col === "left" && row === "up") return "upper-left";
  if (col === "right" && row === "up") return "upper-right";
  if (col === "left" && row === "down") return "lower-left";
  return "lower-right";
}

// Detection throttle — ~5 fps is plenty for a supervision gimmick.
const DETECT_INTERVAL_MS = 200;

/**
 * Manages the webcam stream and MediaPipe face detection lifecycle.
 *
 * Privacy guarantee: video frames never leave the device. All inference
 * runs in-browser via WebAssembly; no pixels are uploaded anywhere.
 *
 * Usage:
 *   const { camState, direction, videoRef, enable, disable } = useFaceDirection();
 */
export function useFaceDirection(): UseFaceDirectionResult {
  const [camState, setCamState] = useState<CamState>("idle");
  const [direction, setDirection] = useState<FaceDirection>("front");

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<{ detectForVideo: (v: HTMLVideoElement, ts: number) => { detections: Array<{ boundingBox: { originX: number; originY: number; width: number; height: number } }> } } | null>(null);
  const rafRef = useRef<number>(0);
  const enabledRef = useRef(false);
  const lastDetectRef = useRef(0);

  const disable = useCallback(() => {
    enabledRef.current = false;
    cancelAnimationFrame(rafRef.current);

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    // Detectors are stateless and reusable; leave the ref intact to avoid
    // paying the WASM initialisation cost again if the user re-enables.

    setCamState("idle");
    setDirection("front");
  }, []);

  const enable = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState("unsupported");
      return;
    }

    enabledRef.current = true;
    setCamState("requesting");

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "NotAllowedError") {
        setCamState("denied");
      } else {
        setCamState("unsupported");
      }
      enabledRef.current = false;
      return;
    }

    if (!enabledRef.current) {
      // User clicked disable while we were awaiting permission.
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay blocked — stream is still valid, detection tick will wait
        // for readyState >= 2 before processing frames.
      }
    }

    // Lazily load MediaPipe only when the user enables the feature.
    setCamState("loading");
    try {
      if (!detectorRef.current) {
        const { FaceDetector, FilesetResolver } = await import(
          "@mediapipe/tasks-vision"
        );
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm",
        );
        const detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
          },
          runningMode: "VIDEO",
          minDetectionConfidence: 0.5,
        });
        // Cast through unknown to our local detection interface.
        detectorRef.current = detector as unknown as typeof detectorRef.current;
      }
    } catch {
      setCamState("unsupported");
      enabledRef.current = false;
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    if (!enabledRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    setCamState("active");

    const tick = () => {
      if (!enabledRef.current) return;

      const vid = videoRef.current;
      const detector = detectorRef.current;

      if (!vid || !detector || vid.readyState < 2 || vid.videoWidth === 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const now = performance.now();
      if (now - lastDetectRef.current >= DETECT_INTERVAL_MS) {
        lastDetectRef.current = now;
        try {
          const result = detector.detectForVideo(vid, now);
          if (result.detections.length > 0) {
            const bbox = result.detections[0].boundingBox;
            const cx = (bbox.originX + bbox.width / 2) / vid.videoWidth;
            const cy = (bbox.originY + bbox.height / 2) / vid.videoHeight;
            setDirection(centroidToDirection(cx, cy));
          }
        } catch {
          // Non-fatal: single frame error — keep ticking.
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  // Cleanup on unmount.
  useEffect(() => () => disable(), [disable]);

  return { camState, direction, videoRef, enable, disable };
}
