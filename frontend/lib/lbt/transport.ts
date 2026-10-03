import type {
  EndReason,
  Energy,
  LbtMode,
  PartnerRef,
  PeerProfile,
  Preference,
  ReportReason,
  TownStatus,
} from "./types";

export interface JoinRequest {
  nickname: string;
  energy: Energy;
  preference: Preference;
  adult: boolean;
}

/**
 * Everything the chat UI can hear. Times are already converted to the
 * local clock (`endsAt` is a `Date.now()`-style millisecond timestamp).
 */
export type TransportEvent =
  | { type: "connection"; state: "connecting" | "open" | "offline" }
  | { type: "waiting" }
  | {
      type: "matched";
      me: PeerProfile;
      partner: PeerProfile;
      simulated: boolean;
      endsAt: number;
      graceSeconds: number;
    }
  | { type: "message"; id: string; from: "me" | "partner"; text?: string; ref?: PartnerRef }
  | { type: "typing" }
  | { type: "extendRequested"; by: "me" | "partner" }
  | { type: "extended"; endsAt: number }
  | { type: "ended"; reason: EndReason }
  | { type: "idle" }
  | { type: "error"; code: string };

export type TransportListener = (event: TransportEvent) => void;

/**
 * Port between the chat UI and whatever runs the conversation: the live
 * matching backend, or the clearly labelled demo script.
 */
export interface LbtTransport {
  readonly mode: LbtMode;
  /** Start listening (and, for live, connect). Returns a stop function. */
  start(listener: TransportListener): () => void;
  join(request: JoinRequest): void;
  cancel(): void;
  send(text: string): void;
  typing(): void;
  extend(): void;
  leave(): void;
  /** "sent" when a report was filed; "simulated" when nothing was sent. */
  report(reason: ReportReason, note: string): Promise<"sent" | "simulated">;
  /** Current town status, or null when there is no honest number to show. */
  status(): Promise<TownStatus | null>;
}
