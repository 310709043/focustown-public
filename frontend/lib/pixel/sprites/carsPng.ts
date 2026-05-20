/**
 * 876810 old-cars side-view sheets — Jeep_1 + Passenger car. Canonical
 * NamedCars bundle per docs/qa/canonical-reference-index.md § 1.1 layer 71.
 *
 * Each action is a single-row horizontal sheet at 192×192 cell. We use the
 * "Ride" action (8-frame driving loop) as the default ambient state. The
 * Passenger car has no Idle sheet (per 876810 pack quirk noted in
 * ASSET-MANIFEST.md); first frame of Ride serves as a static fallback.
 *
 * Jeep_2 is intentionally archived (256×256 cell size would dwarf the
 * 192×192 Jeep_1 at the same render scale).
 */

import type { PngSheetSpec } from "./walkersPng";

const FRAME = 192;

export type PngCarSpec = {
  readonly ride: PngSheetSpec;
  readonly rideBack: PngSheetSpec;
};

export const PNG_CARS: Readonly<{ jeep1: PngCarSpec; passenger: PngCarSpec }> =
  {
    jeep1: {
      ride: {
        url: "/assets/v6/cars/Jeep_1_Ride.png",
        frameW: FRAME,
        frameH: FRAME,
        frames: 8,
        fps: 10,
      },
      rideBack: {
        url: "/assets/v6/cars/Jeep_1_Ride_back.png",
        frameW: FRAME,
        frameH: FRAME,
        frames: 8,
        fps: 10,
      },
    },
    passenger: {
      ride: {
        url: "/assets/v6/cars/Passenger_Ride.png",
        frameW: FRAME,
        frameH: FRAME,
        frames: 8,
        fps: 10,
      },
      rideBack: {
        url: "/assets/v6/cars/Passenger_Ride_Back.png",
        frameW: FRAME,
        frameH: FRAME,
        frames: 8,
        fps: 10,
      },
    },
  };

/** Canonical-reference-index.md § 1.1 layers 71 — render @ 0.30× scale so
 *  a 192px cell becomes ~58px on-screen (matching walker height). */
export const CAR_SCALE_DEFAULT = 0.3;
