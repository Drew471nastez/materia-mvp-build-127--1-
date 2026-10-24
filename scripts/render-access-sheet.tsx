/**
 * The access sheet and the notifications ask, mounted in a page that stands
 * in for the app: window.Capacitor says native, and the Camera and
 * PushNotifications plugins answer from window.__cam and window.__push
 * (scripts/check-access-sheet.mjs sets them per case).
 */
import { createRoot } from "react-dom/client"
import { createElement as h } from "react"
import { AccessSheet } from "@/components/platform/access-sheet"
import { NotificationsAsk } from "@/components/platform/notifications-ask"
import { pickPhoto } from "@/lib/native-camera"
import { nudgeNotifications, type NudgeMoment } from "@/lib/notifications/nudge"

const w = window as unknown as Record<string, unknown>
w.Capacitor = { isNativePlatform: () => true, getPlatform: () => w.__platform }
w.__pickPhoto = (source: "PHOTOS" | "CAMERA" | "PROMPT") => pickPhoto(source).then((r) => (w.__picked = r ? "photo" : "none"))
w.__nudge = (m: NudgeMoment) => nudgeNotifications(m)

function Page() {
  return h(
    "main",
    { style: { padding: 24, fontFamily: "Inter, system-ui" } },
    h("input", { id: "photo", type: "file", accept: "image/*" }),
    h("input", { id: "pdf", type: "file", accept: ".pdf,.zip" }),
    h("input", { id: "cam", type: "file", accept: "image/*", capture: "environment" }),
    h("label", { id: "photo-label", htmlFor: "photo2" }, "Add photo"),
    h("input", { id: "photo2", type: "file", accept: "image/png,image/jpeg", style: { display: "none" } }),
    h("button", { id: "pick-camera", onClick: () => void (w.__pickPhoto as (s: string) => void)("CAMERA") }, "Take photo"),
    h(AccessSheet),
    h(NotificationsAsk),
  )
}

createRoot(document.getElementById("root")!).render(h(Page))
