export type KoiKind = "kohaku" | "showa" | "ogon" | "platinum";
export declare const KOI_KINDS: readonly KoiKind[];
export interface KoiPond {
  /** Drop one koi of this variety into the pond, with a splash. */
  addFish(kind: KoiKind): void;
  /** Draw a still koi of this variety into a canvas (144×60), for the tray. */
  drawIcon(kind: KoiKind, canvas: HTMLCanvasElement): void;
  /** Night shows the moon's reflection on the water (it fades in and out). */
  setNight(on: boolean): void;
  /** Stop, free the GPU and remove the canvases. */
  destroy(): void;
}
export declare function mountKoiPond(
  host: HTMLElement,
  options?: { reducedMotion?: boolean; night?: boolean; onCount?: (count: number) => void },
): KoiPond;
