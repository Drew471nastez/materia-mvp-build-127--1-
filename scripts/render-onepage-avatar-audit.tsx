/** Browser audit entry: real editor, preview and public components. Only the
 * account/database boundary is supplied by check-onepage-avatar-sync.mjs. */
import { saveAccountPhoto } from "@/lib/onepage/photo-save"
import { writeAuthSnapshot } from "@/lib/auth/auth-snapshot"
import { avatarReadToken, acceptAvatarRead } from "@/lib/account/avatar-store"

async function boot() {
  const state = await fetch("/audit-state").then(r => r.json())
  Object.assign(globalThis, {
    PROBE_AVATAR: state.avatar,
    PROBE_SESSION: { access_token: "local-probe-token", user: { id: "probe-user" }, expires_at: Math.floor(Date.now() / 1000) + 3600 },
    PROBE_READ_PROFILE: () => fetch("/audit-state").then(r => r.json()).then(state => ({ data: { avatar_url: state.avatar, display_name: "Satori Studio" }, error: null })),
    PROBE_PROFILE: { avatar_url: state.avatar, display_name: "Satori Studio" },
    PROBE_THEME: state.theme,
    PROBE_LIVE_THEME: state.theme,
    PROBE_BLOCKS: state.blocks,
    auditPhoto: saveAccountPhoto,
    auditReadStart: avatarReadToken,
    auditReadFinish: acceptAvatarRead,
  })
  // Anonymous live visitors must never need an auth snapshot for their photo.
  if (!location.search.includes("live")) writeAuthSnapshot({ signedIn: true, userId: "probe-user", avatarUrl: state.avatar, displayName: "Satori Studio", username: "satori", isSeller: true })
  await import("./render-onepage-editor")
}
void boot()
