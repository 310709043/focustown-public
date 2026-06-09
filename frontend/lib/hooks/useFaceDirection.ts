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

/**
 * Rich face pose data extracted each detection frame.
 *
 * All values are smoothed with exponential moving average to avoid jitter.
 */
export interface FaceData {
  /** Normalised X of face centre, 0-1, already mirror-flipped (0=left of screen). */
  cx: number;
  /** Normalised Y of face centre, 0-1 (0=top). */
  cy: number;
  /**
   * Head tilt in degrees. Negative = user tilting left (cat tilts left).
   * Computed from the angle between left and right eye keypoints.
   */
  tiltDeg: number;
  /**
   * Proximity 0-1: bounding-box width / frame width.
   * ~0.1 = far, ~0.4 = normal, >0.6 = very close.
   */
  proximity: number;
}

export interface UseFaceDirectionResult {
  camState: CamState;
  direction: FaceDirection;
  faceDetected: boolean;
  /** Smoothed face pose data; null when no face is detected. */
  faceData: FaceData | null;
  videoRef: React.RefObject<HTMLVideoElement>;
  enable: () => Promise<void>;
  disable: () => void;
}

type Keypoint = { x: number; y: number };
type BBox = { originX: number; originY: number; width: number; height: number };
type Detection = {
  boundingBox: BBox;
  /** Some MediaPipe versions expose bbox instead of boundingBox. */
  bbox?: BBox;
  keypoints?: Keypoint[];
};
type DetectorResult = { detections: Detection[] };
type Detector = { detectForVideo: (v: HTMLVideoElement, ts: number) => DetectorResult };

function centroidToDirection(normX: number, normY: number): FaceDirection {
  const cx = 1 - normX; // mirror
  const col = cx < 0.35 ? "left" : cx > 0.65 ? "right" : "center";
  const row = normY < 0.35 ? "up" : normY > 0.65 ? "down" : "center";
  if (col === "center" && row === "center") return "front";
  if (col === "left"   && row === "center") return "left";
  if (col === "right"  && row === "center") return "right";
  if (col === "center" && row === "up")     return "up";
  if (col === "center" && row === "down")   return "down";
  if (col === "left"   && row === "up")     return "upper-left";
  if (col === "right"  && row === "up")     return "upper-right";
  if (col === "left"   && row === "down")   return "lower-left";
  return "lower-right";
}

/** Exponential moving average — smooths jitter without lag. */
function ema(prev: number, next: number, alpha = 0.25): number {
  return prev + alpha * (next - prev);
}

const DETECT_INTERVAL_MS = 100; // ~10 fps for responsive face tracking

/**
 * Manages webcam + MediaPipe face detection.
 *
 * Returns:
 *   direction  — coarse 9-zone gaze (for mood system)
 *   faceData   — smooth cx/cy/tiltDeg/proximity (for cat animation)
 *   faceDetected — presence boolean
 *
 * Privacy: all inference runs in-browser via WASM, no frames leave the device.
 */
export function useFaceDirection(): UseFaceDirectionResult {
  const [camState, setCamState] = useState<CamState>("idle");
  const [direction, setDirection] = useState<FaceDirection>("front");
  const [faceDetected, setFaceDetected] = useState(false);
  const [faceData, setFaceData] = useState<FaceData | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<Detector | null>(null);
  const rafRef = useRef<number>(0);
  const enabledRef = useRef(false);
  const lastDetectRef = useRef(0);

  // Smoothed values — mutated in rAF, then committed to state.
  const smoothRef = useRef<FaceData>({ cx: 0.5, cy: 0.5, tiltDeg: 0, proximity: 0.3 });

  const disable = useCallback(() => {
    enabledRef.current = false;
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCamState("idle");
    setDirection("front");
    setFaceDetected(false);
    setFaceData(null);
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
        console.error("[CatSupervisor] getUserMedia failed:", err);
        setCamState("unsupported");
      }
      enabledRef.current = false;
      return;
    }

    if (!enabledRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      try { await video.play(); } catch { /* autoplay blocked — rAF will wait */ }
    }

    setCamState("loading");
    try {
      if (!detectorRef.current) {
        const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
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
        detectorRef.current = detector as unknown as Detector;
      }
    } catch (err: unknown) {
      console.error("[CatSupervisor] MediaPipe load failed:", err);
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
          const detected = result.detections.length > 0;
          setFaceDetected(detected);

          if (detected) {
            const det = result.detections[0];
            const bbox = det.bbox ?? det.boundingBox;
            const kp = det.keypoints ?? [];

            // ── Centroid ──
            const rawCx = (bbox.originX + bbox.width / 2) / vid.videoWidth;
            const rawCy = (bbox.originY + bbox.height / 2) / vid.videoHeight;
            // Mirror X so it matches user's perspective.
            const mirrorCx = 1 - rawCx;

            // ── Head tilt from eye keypoints ──
            // MediaPipe blaze_face keypoints: 0=right eye, 1=left eye (raw video coords).
            // In raw video, right eye is on the right side of the frame (user's left eye).
            let rawTilt = 0;
            if (kp.length >= 2) {
              const re = kp[0]; // right eye in video = user's left eye
              const le = kp[1]; // left eye in video = user's right eye
              // Angle of the line between eyes. Positive = user tilting right.
              rawTilt = Math.atan2(re.y - le.y, le.x - re.x) * (180 / Math.PI);
              rawTilt = Math.max(-35, Math.min(35, rawTilt));
            }

            // ── Proximity from bbox size ──
            const rawProximity = Math.min(bbox.width / vid.videoWidth, 1);

            // ── Smooth with EMA ──
            const s = smoothRef.current;
            s.cx        = ema(s.cx,        mirrorCx,   0.3);
            s.cy        = ema(s.cy,        rawCy,      0.3);
            s.tiltDeg   = ema(s.tiltDeg,   rawTilt,    0.2);
            s.proximity = ema(s.proximity, rawProximity, 0.15);

            setDirection(centroidToDirection(rawCx, rawCy));
            setFaceData({ ...s });
          } else {
            setFaceData(null);
          }
        } catch {
          // Non-fatal single-frame error.
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => () => disable(), [disable]);

  return { camState, direction, faceDetected, faceData, videoRef, enable, disable };
}
