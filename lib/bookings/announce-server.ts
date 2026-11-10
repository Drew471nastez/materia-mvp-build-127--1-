import "server-only"
import { sendEmail, buildFromHeader } from "@/lib/mail"
import { resolveCreatorIdentity } from "@/lib/email"
import { notifyUser } from "@/lib/notifications/user-inbox"
import { platformOrigin } from "@/lib/onepage/return-address"
import { syncBookingEvent } from "@/lib/google-calendar/server"
import { announceBooking, type AnnounceDeps, type Announced, type BookingChange } from "./announce"
import { bookingManagePath } from "./manage-token"
import { readContext, type BookingRow, type Db } from "./server"

/* The real senders behind lib/bookings/announce.ts: the bell, Mailgun, Google. */
export function liveDeps(db: Db): AnnounceDeps {
  const origin = platformOrigin()
  return {
    origin,
    notify: (n) => notifyUser(db as never, n),
    email: (m) =>
      sendEmail({
        to: m.to,
        subject: m.subject,
        html: m.html,
        text: m.text,
        from: buildFromHeader(m.fromName),
        replyTo: m.replyTo || undefined,
        attachments: m.attachments,
        transactional: true,
        keepBounce: true,
      }),
    sync: (input) => syncBookingEvent(db, input),
    identity: async (ownerId) => {
      const id = await resolveCreatorIdentity(db, ownerId)
      return { fromName: id?.fromName || "", sellerEmail: id?.sellerEmail || null, replyTo: id?.replyTo || null }
    },
    manageUrl: (bookingId) => {
      try {
        return `${origin}${bookingManagePath(bookingId)}`
      } catch {
        return null
      }
    },
  }
}

export async function announce(db: Db, booking: BookingRow, change: BookingChange, by: "owner" | "visitor" | "system", extra: { previousStart?: string | null } = {}): Promise<Announced | null> {
  try {
    const ctx = await readContext(db, booking)
    return await announceBooking(liveDeps(db), ctx, change, by, extra)
  } catch (e) {
    console.warn("[bookings] notices failed:", booking.id, change, e instanceof Error ? e.message.slice(0, 200) : "error")
    return null
  }
}
