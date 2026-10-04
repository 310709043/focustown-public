/**
 * Attention cues: silent while the visitor is looking; when they are away,
 * a chime (if on, at most one per gap) and a tab-title note that goes back
 * the moment they return. The 提示音 switch keeps its choice.
 */
import { fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { ChimeToggle } from "@/components/lbt/ChimeToggle";
import { useAttentionCues } from "@/components/lbt/useAttentionCues";
import { setChimePlayerFactory, type ChimePlayer } from "@/lib/lbt/chime";
import { useChimeStore } from "@/lib/lbt/chimeStore";
import { useLbtStore } from "@/lib/lbt/sessionStore";
import type { ChatLine } from "@/lib/lbt/types";

const BASE = "LowBatteryTown";
let player: ChimePlayer & { play: ReturnType<typeof vi.fn<ChimePlayer["play"]>> };
let away = false;

function partnerLine(id: string): ChatLine {
  return { id, kind: "partner", text: "嗨" };
}

beforeEach(() => {
  window.localStorage.clear();
  document.title = BASE;
  away = false;
  vi.spyOn(document, "hasFocus").mockImplementation(() => !away);
  Object.defineProperty(document, "hidden", {
    configurable: true,
    get: () => away,
  });
  player = { unlock: vi.fn(), play: vi.fn() };
  setChimePlayerFactory(() => player);
  useChimeStore.setState({ enabled: true });
  useLbtStore.setState({
    view: "waiting",
    lines: [],
    extendPartner: false,
    companionInvitation: null,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("useAttentionCues", () => {
  test("nothing happens while the visitor is looking", () => {
    renderHook(() => useAttentionCues());
    useLbtStore.setState({ view: "chat" });
    useLbtStore.setState({ lines: [partnerLine("a")] });
    expect(player.play).not.toHaveBeenCalled();
    expect(document.title).toBe(BASE);
  });

  test("away: someone arrives → arrive chime and a title note, cleared on return", () => {
    renderHook(() => useAttentionCues());
    away = true;
    useLbtStore.setState({ view: "chat" });
    expect(player.play).toHaveBeenCalledWith("arrive");
    expect(document.title).toBe(`lbt.cues.arrived · ${BASE}`);

    away = false;
    fireEvent(document, new Event("visibilitychange"));
    expect(document.title).toBe(BASE);
  });

  test("away: messages are counted, and the chime does not repeat within the gap", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    useLbtStore.setState({ view: "chat" });
    renderHook(() => useAttentionCues());
    away = true;
    useLbtStore.setState({ lines: [partnerLine("a")] });
    useLbtStore.setState({ lines: [partnerLine("a"), partnerLine("b")] });
    expect(player.play).toHaveBeenCalledTimes(1);
    expect(player.play).toHaveBeenCalledWith("message");
    expect(document.title).toBe(`lbt.cues.messages({"count":2}) · ${BASE}`);

    vi.advanceTimersByTime(1600);
    useLbtStore.setState({
      lines: [partnerLine("a"), partnerLine("b"), partnerLine("c")],
    });
    expect(player.play).toHaveBeenCalledTimes(2);
    expect(document.title).toBe(`lbt.cues.messages({"count":3}) · ${BASE}`);
  });

  test("away: the host's invitation and the partner's extend request also cue", () => {
    renderHook(() => useAttentionCues());
    away = true;
    useLbtStore.setState({
      companionInvitation: { id: "inv-1", expiresAt: Date.now() + 60_000 },
    });
    expect(document.title).toBe(`lbt.cues.invited · ${BASE}`);

    useLbtStore.setState({ view: "chat", companionInvitation: null });
    useLbtStore.setState({ extendPartner: true });
    expect(document.title).toBe(`lbt.cues.extend · ${BASE}`);
  });

  test("with the chime off, only the title changes", () => {
    useChimeStore.getState().setEnabled(false);
    renderHook(() => useAttentionCues());
    away = true;
    useLbtStore.setState({ view: "chat" });
    expect(player.play).not.toHaveBeenCalled();
    expect(document.title).toBe(`lbt.cues.arrived · ${BASE}`);
  });

  test("the first click unlocks sound", () => {
    renderHook(() => useAttentionCues());
    fireEvent.pointerDown(document.body);
    expect(player.unlock).toHaveBeenCalled();
  });
});

describe("ChimeToggle", () => {
  test("switches off and on, and remembers off", () => {
    render(<ChimeToggle />);
    const button = screen.getByRole("button", { name: /lbt\.cues\.sound/ });
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(window.localStorage.getItem("lbt.chime.off")).toBe("1");
    fireEvent.click(button);
    expect(window.localStorage.getItem("lbt.chime.off")).toBeNull();
  });
});
