/**
 * The battery is a real button (label and pressed state follow the music),
 * the hint turns into a three-step volume radiogroup after the first play,
 * and the header switch mirrors the same state.
 */
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BatteryCharacter } from "@/components/lbt/BatteryCharacter";
import { HeaderMusicButton, MusicVolume } from "@/components/lbt/MusicControls";
import type { MusicEngine } from "@/lib/lbt/music";
import { setMusicEngineFactory, useMusicStore } from "@/lib/lbt/musicStore";

const engine: MusicEngine = {
  play: vi.fn(async () => undefined),
  pause: vi.fn(),
  setLevel: vi.fn(),
  amplitude: () => 0.4,
  onTrack: () => () => undefined,
};

beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
  setMusicEngineFactory(() => engine);
  useMusicStore.setState({ playing: false, level: 0, track: 0, seen: false, started: false });
});

describe("music controls", () => {
  test("the battery button plays and pauses, and says which it will do", async () => {
    render(<BatteryCharacter energy={2} />);
    const button = screen.getByRole("button", { name: "lbt.music.play" });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await act(async () => {
      fireEvent.click(button);
    });
    expect(engine.play).toHaveBeenCalledWith(0);
    const pause = screen.getByRole("button", { name: "lbt.music.pause" });
    expect(pause).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector(".battery-display")).toHaveClass("is-singing");

    await act(async () => {
      fireEvent.click(pause);
    });
    expect(engine.pause).toHaveBeenCalled();
    expect(document.querySelector(".battery-display")).not.toHaveClass("is-singing");
  });

  test("the hint starts the music, then the volume steps appear", async () => {
    render(<MusicVolume />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /lbt\.music\.hint/ }));
    });
    const group = screen.getByRole("radiogroup", { name: "lbt.music.volume" });
    const steps = within(group).getAllByRole("radio");
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveAttribute("aria-checked", "true");

    fireEvent.click(steps[2]);
    expect(engine.setLevel).toHaveBeenCalledWith(2);
    expect(within(group).getAllByRole("radio")[2]).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(within(group).getAllByRole("radio")[2], { key: "ArrowLeft" });
    expect(useMusicStore.getState().level).toBe(1);
  });

  test("the header switch mirrors the battery", async () => {
    render(<HeaderMusicButton />);
    const button = screen.getByRole("button", { name: "lbt.music.play" });
    expect(button).not.toHaveClass("is-started");
    await act(async () => {
      fireEvent.click(button);
    });
    const pause = screen.getByRole("button", { name: "lbt.music.pause" });
    expect(pause).toHaveAttribute("aria-pressed", "true");
    expect(pause).toHaveClass("is-started");
  });
});
