/**
 * 10 mock NPCs that populate the town scene. Each entry references a key from
 * the existing CHARACTERS roster so colour/role data can be looked up via
 * findCharacter(). Swap to live WebSocket presence later — the component
 * structure expects `{character_key, status_code, x_percent}`.
 */

import type { StatusCode } from "./statuses";

export type NPC = {
  characterKey: string;
  // semi-stable horizontal positions across the lane; will jitter +/- on tick
  baseX: number;          // 0..100 (% of lane width)
  speedSec: number;       // cycle for cars driving by
  initialStatus: StatusCode;
};

export const NPCS: NPC[] = [
  { characterKey: "kai",   baseX: 6,  speedSec: 5.4, initialStatus: "focus"  },
  { characterKey: "milo",  baseX: 17, speedSec: 6.2, initialStatus: "deep"   },
  { characterKey: "aria",  baseX: 28, speedSec: 4.8, initialStatus: "read"   },
  { characterKey: "zoe",   baseX: 39, speedSec: 5.9, initialStatus: "create" },
  { characterKey: "bear",  baseX: 50, speedSec: 4.4, initialStatus: "break"  },
  { characterKey: "nyx",   baseX: 61, speedSec: 7.1, initialStatus: "focus"  },
  { characterKey: "rex",   baseX: 71, speedSec: 5.2, initialStatus: "afk"    },
  { characterKey: "sage",  baseX: 81, speedSec: 6.5, initialStatus: "read"   },
  { characterKey: "panda", baseX: 90, speedSec: 5.7, initialStatus: "deep"   },
  { characterKey: "uni",   baseX: 96, speedSec: 4.6, initialStatus: "create" },
];
