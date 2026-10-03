import type { JoinRequest, LbtTransport, TransportEvent, TransportListener } from "@/lib/lbt/transport";
import type { LbtMode, ReportReason, TownStatus } from "@/lib/lbt/types";

/** Records every intent and lets a test push server events. */
export class FakeTransport implements LbtTransport {
  listener: TransportListener | null = null;
  calls: Array<{ op: string; arg?: unknown }> = [];
  statusValue: TownStatus | null = null;
  reportResult: "sent" | "simulated" | Error = "sent";
  stopped = false;

  constructor(readonly mode: LbtMode = "live") {}

  start(listener: TransportListener) {
    this.listener = listener;
    return () => {
      this.stopped = true;
      this.listener = null;
    };
  }

  emit(event: TransportEvent) {
    this.listener?.(event);
  }

  join(request: JoinRequest) {
    this.calls.push({ op: "join", arg: request });
  }
  cancel() {
    this.calls.push({ op: "cancel" });
  }
  send(text: string) {
    this.calls.push({ op: "send", arg: text });
  }
  typing() {
    this.calls.push({ op: "typing" });
  }
  extend() {
    this.calls.push({ op: "extend" });
  }
  leave() {
    this.calls.push({ op: "leave" });
  }
  async report(reason: ReportReason, note: string) {
    this.calls.push({ op: "report", arg: { reason, note } });
    if (this.reportResult instanceof Error) throw this.reportResult;
    return this.reportResult;
  }
  async status() {
    return this.statusValue;
  }

  ops(): string[] {
    return this.calls.map((c) => c.op);
  }
}

export const PARTNER = { nickname: "阿樹", energy: 2, preference: "story" } as const;
export const ME = { nickname: "小橘", energy: 1, preference: "listen" } as const;

export function matched(endsInMs = 420_000, simulated = false): TransportEvent {
  return {
    type: "matched",
    me: { ...ME },
    partner: { ...PARTNER },
    simulated,
    endsAt: Date.now() + endsInMs,
    graceSeconds: 60,
  };
}
