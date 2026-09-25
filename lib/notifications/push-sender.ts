import "server-only"

import { sendPushToUser } from "@/lib/push/sender"
import type { Pusher } from "./engine"

/**
 * The engine's pushes through the push Storelib already has (lib/push/sender):
 * the phone apps through Firebase, browsers through Web Push, to whatever
 * devices and browsers this person turned notifications on for. Nobody who
 * did not is reached; that is their setting.
 */
export const storelibPusher: Pusher = {
  async send(userId, push) {
    await sendPushToUser(userId, { title: push.title, body: push.body, data: push.data })
  },
}
