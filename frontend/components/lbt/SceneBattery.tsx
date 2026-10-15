import { useId } from "react";

import { sceneArt } from "@/lib/lbt/avatarArt";
import type { AvatarId } from "@/lib/lbt/avatars";
import type { Face } from "@/lib/lbt/chatFaces";

const INK = "#334158";

/**
 * One battery on the chat stage's bench. Every face is drawn at once in
 * layers and CSS shows the one named by `data-x` (lbt.css, `.av`), so a
 * change of face cross-fades and moves without re-rendering the art. The
 * body and accessory are static artwork from lib/lbt/avatarArt.ts
 * (constants only, never user text), so injecting them is safe.
 */
export function SceneBattery({
  avatar,
  face,
  side,
  x,
}: {
  avatar: AvatarId;
  face: Face;
  /** `lr` sits left of the lamp and looks right; `ll` sits right and looks left. */
  side: "lr" | "ll";
  /** Where on the 1344-wide stage the battery sits. */
  x: number;
}) {
  const art = sceneArt(avatar, useId());
  return (
    <g transform={`translate(${x} 183) scale(1.15) translate(-48 -55)`}>
      <ellipse className="bx-shadow" cx="48" cy="82.5" rx="17" ry="2.6" />
      <g className={`av ${side}`} data-x={face} data-avatar={avatar}>
        <g className="bx-body">
          <g dangerouslySetInnerHTML={{ __html: art.body }} />
          <g transform={`translate(0 ${art.faceDy})`}>
            <g className="lay e-open">
              <g className="pupils">
                <ellipse cx="42.6" cy="52" rx="1.9" ry="2.8" fill={INK} />
                <ellipse cx="53.4" cy="52" rx="1.9" ry="2.8" fill={INK} />
                <circle className="shine" cx="43.2" cy="50.9" r="0.7" fill="#ffffff" />
                <circle className="shine" cx="54" cy="50.9" r="0.7" fill="#ffffff" />
              </g>
            </g>
            <g className="lids">
              <rect x="39.8" y="45" width="5.6" height="6.4" fill={art.lid} />
              <rect x="50.6" y="45" width="5.6" height="6.4" fill={art.lid} />
              <path d="M40.3 51.4 h4.6 M51.1 51.4 h4.6" stroke={INK} strokeWidth="1.2" strokeLinecap="round" />
            </g>
            <path className="lay e-closed" d="M40.2 52 q2.4 2.4 4.8 0 M51 52 q2.4 2.4 4.8 0" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <path className="lay e-happy" d="M40.2 53 q2.4 -3 4.8 0 M51 53 q2.4 -3 4.8 0" stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" />
            <path className="lay e-squint" d="M40.6 50.2 l3.6 1.8 l-3.6 1.8 M55.4 50.2 l-3.6 1.8 l3.6 1.8" stroke={INK} strokeWidth="1.7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            <path className="lay m-smile" d="M45.6 58.5 q2.4 2.2 4.8 0" stroke={INK} strokeWidth="1.7" fill="none" strokeLinecap="round" />
            <path className="lay m-flat" d="M46 59 h4" stroke={INK} strokeWidth="1.7" strokeLinecap="round" />
            <ellipse className="lay m-ooh" cx="48" cy="59.4" rx="1.6" ry="1.9" fill={INK} />
            <path className="lay m-open" d="M45 57.6 q3 4 6 0 z" fill="#c9656b" stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
            <g className="cheeks">
              <ellipse cx="39.2" cy="56.5" rx="2.6" ry="1.6" fill="#ff8f7e" opacity="0.45" />
              <ellipse cx="56.8" cy="56.5" rx="2.6" ry="1.6" fill="#ff8f7e" opacity="0.45" />
            </g>
          </g>
          <g dangerouslySetInnerHTML={{ __html: art.accessory }} />
        </g>
      </g>
    </g>
  );
}
