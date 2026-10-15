"use client";

import { useEffect, useRef, useState } from "react";

import {
  CHEER_MS,
  FACE_MS,
  REACT_DELAY_MS,
  reactionFace,
  restingFace,
  type Face,
  type FaceContext,
  type Flash,
} from "@/lib/lbt/chatFaces";
import type { ChatLine } from "@/lib/lbt/types";

type Side = "self" | "partner";
type Speaker = Side | null;

interface Shown {
  face: Flash | null;
  /** Bumped on every flash so the battery replays it even if the face repeats. */
  beat: number;
}

export interface ChatFaces {
  self: Face;
  partner: Face;
  selfBeat: number;
  partnerBeat: number;
  /** Both plugged in a moment ago: stars, the badge, a full lamp. */
  cheering: boolean;
}

const lastSpeaker = (lines: readonly ChatLine[]): Speaker => {
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const kind = lines[i]?.kind;
    if (kind === "me") return "self";
    if (kind === "partner") return "partner";
  }
  return null;
};

/**
 * The two stage batteries' faces. A new line makes its sender talk and the
 * other one react a beat later; a plug makes the other look up; both plugs
 * make both cheer. In between each rests on `restingFace`. Lines already on
 * screen when the chat opens (a reload, a reconnect) cause no reaction.
 */
export function useChatFaces(
  lines: readonly ChatLine[],
  context: FaceContext,
): ChatFaces {
  const [shown, setShown] = useState<Record<Side, Shown>>({
    self: { face: null, beat: 0 },
    partner: { face: null, beat: 0 },
  });
  const [cheering, setCheering] = useState(false);
  const seen = useRef(lines.length);
  const speaker = useRef<Speaker>(lastSpeaker(lines));
  const beat = useRef(0);
  const timers = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    const later = (fn: () => void, ms: number) => {
      timers.current = [...timers.current, setTimeout(fn, ms)];
    };
    const flash = (side: Side, face: Flash) => {
      beat.current += 1;
      const mine = beat.current;
      setShown((s) => ({ ...s, [side]: { face, beat: mine } }));
      // Settle back only if no newer face took over; keep the beat so it cross-fades.
      later(
        () => setShown((s) => (s[side].beat === mine ? { ...s, [side]: { face: null, beat: mine } } : s)),
        FACE_MS[face],
      );
    };
    const react = (reader: Side, text: string | undefined, previous: Speaker) => {
      const face = reactionFace(text, previous === reader);
      later(() => flash(reader, face), REACT_DELAY_MS);
    };

    // A shorter list is a new conversation or a replay: nothing to react to.
    const fresh = lines.length >= seen.current ? lines.slice(seen.current) : [];
    seen.current = lines.length;
    const line = fresh.at(-1);
    const previous = speaker.current;
    speaker.current = lastSpeaker(lines);
    if (!line) return;

    if (line.kind === "me") {
      flash("self", "talk");
      react("partner", line.text, previous);
    } else if (line.kind === "partner") {
      flash("partner", "talk");
      react("self", line.text, previous);
    } else if (line.code === "extendAsked") {
      flash("partner", "notice");
    } else if (line.code === "extendPartnerAsked") {
      flash("self", "notice");
    } else if (line.code === "extendAccepted") {
      flash("self", "cheer");
      flash("partner", "cheer");
      setCheering(true);
      later(() => setCheering(false), CHEER_MS);
    }
  }, [lines]);

  return {
    self: shown.self.face ?? restingFace("self", context),
    partner: shown.partner.face ?? restingFace("partner", context),
    selfBeat: shown.self.beat,
    partnerBeat: shown.partner.beat,
    cheering,
  };
}
