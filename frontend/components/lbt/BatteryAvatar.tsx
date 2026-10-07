import { useId } from "react";

import { avatarSvg } from "@/lib/lbt/avatarArt";
import type { AvatarId } from "@/lib/lbt/avatars";

/**
 * One battery-family avatar. The markup is static artwork from
 * lib/lbt/avatarArt.ts (constants only, no user text), so injecting it is
 * safe; nicknames and messages are never rendered this way.
 */
export function BatteryAvatar({ avatar }: { avatar: AvatarId }) {
  const uid = useId();
  return (
    <span
      className="avatar battery-avatar"
      aria-hidden="true"
      data-avatar={avatar}
      dangerouslySetInnerHTML={{ __html: avatarSvg(avatar, uid) }}
    />
  );
}
