"use client";

import { useShallow } from "zustand/react/shallow";

import { entityKindFor, type EntityKind } from "@/lib/data/entity-assignment";
import { usePresenceStore } from "@/lib/state/presenceStore";

/**
 * ISP-flavoured selector: components consume only the presence slice that
 * matches their entity kind, never the whole map. `useShallow` keeps the
 * array reference stable when nothing in the bucket changed — avoids the
 * SSR/CSR snapshot infinite-loop that `Object.values` would otherwise
 * trigger.
 */
export function usePresenceByKind(kind: EntityKind) {
  return usePresenceStore(
    useShallow((s) =>
      Object.values(s.byId).filter((u) => entityKindFor(u.id) === kind),
    ),
  );
}
