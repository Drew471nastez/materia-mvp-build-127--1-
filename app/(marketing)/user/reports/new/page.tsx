import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { ReportForm } from "@/components/messages/report-form"
import { createClient } from "@/lib/supabase/server"

/**
 * ===========================================================================
 *  /user/reports/new — reporting one message
 * ===========================================================================
 *
 * Reached from the menu on a bubble, carrying what is being reported in the
 * query string:
 *
 *   ?ref_type=msg_thread          what kind of thing this is about
 *   &ref_id=<conversation id>     which one
 *   &offender_id=<user id>        who
 *   &reported_message_id=<id>     and, optionally, which message
 *
 * ---------------------------------------------------------------------------
 * EVERY ONE OF THOSE IS A CLAIM MADE BY A URL
 * ---------------------------------------------------------------------------
 * A query string is written by whoever is standing in front of the address bar,
 * so none of it is believed here. The conversation is read through the CALLER's
 * client, which means RLS decides whether they are a party to it — a thread
 * that is not theirs reads as absent and this page 404s the same way the API
 * does. The offender is then taken from THAT ROW rather than from the URL, so
 * `offender_id=<somebody unrelated>` cannot file a report against a stranger.
 * And the message is fetched scoped to the conversation, so an id belonging to
 * a different thread simply does not resolve.
 *
 * What is left over is a page that can be linked to, refreshed, and opened from
 * an email, and that shows the reporter the exact words they are reporting —
 * which is the one thing a bottom sheet over a conversation could not do while
 * they were typing an explanation of them.
 */

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Raportează | Storelib",
  robots: { index: false, follow: false },
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function one(v: string | string[] | undefined): string | null {
  const s = Array.isArray(v) ? v[0] : v
  return typeof s === "string" && s.length > 0 ? s : null
}

export default async function NewReportPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = (await searchParams) ?? {}
  const refType = one(params.ref_type) ?? "msg_thread"
  const refId = one(params.ref_id)
  const messageId = one(params.reported_message_id)

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // Signed out, with the report they were about to file preserved in the return
  // path — losing what somebody had already decided to report because they were
  // logged out is how a report stops being filed at all.
  if (!user) {
    const back = new URLSearchParams(
      Object.entries(params).flatMap(([k, v]) => {
        const s = one(v)
        return s ? [[k, s] as [string, string]] : []
      }),
    )
    redirect(`/login?redirect=${encodeURIComponent(`/user/reports/new?${back.toString()}`)}`)
  }

  // Only one kind of thing is reportable through this page today. Anything else
  // in ref_type is a URL somebody made up.
  if (refType !== "msg_thread" || !refId || !UUID_RE.test(refId)) {
    return <Unreportable />
  }

  // RLS is the membership check, exactly as it is in the API routes.
  const { data: convo } = await supabase
    .from("conversations")
    .select("id, buyer_id, seller_id")
    .eq("id", refId)
    .maybeSingle()
  if (!convo) return <Unreportable />

  // THE ROW DECIDES WHO THE OFFENDER IS, not the query string.
  const offenderId = convo.buyer_id === user.id ? convo.seller_id : convo.buyer_id

  const [{ data: offender }, { data: message }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, username")
      .eq("id", offenderId)
      .maybeSingle(),
    messageId && UUID_RE.test(messageId)
      ? supabase
          .from("messages")
          .select("id, body, kind, created_at, sender_id, deleted_at")
          .eq("id", messageId)
          .eq("conversation_id", refId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // A message you sent yourself is not a message you can report. Dropping the
  // pointer rather than refusing the page keeps the thread-level report
  // available, which is very often what was actually meant.
  const reported = message && message.sender_id !== user.id ? message : null

  return (
    <ReportForm
      conversationId={refId}
      offenderName={offender?.display_name || offender?.username || "Utilizator"}
      message={
        reported
          ? {
              id: reported.id,
              body: reported.deleted_at ? null : reported.body,
              kind: reported.kind,
              createdAt: reported.created_at,
            }
          : null
      }
    />
  )
}

/** The URL points at nothing this account can report. Said plainly, with no
 *  detail about why — "that conversation is not yours" and "that conversation
 *  does not exist" have to look identical from out here. */
function Unreportable() {
  return (
    <main className="mx-auto flex min-h-[60svh] max-w-[560px] flex-col items-center justify-center px-6 text-center">
      <h1 className="text-[19px] font-bold text-neutral-900">Nu găsim ce vrei să raportezi</h1>
      <p className="mt-2 text-[14.5px] leading-relaxed text-neutral-500">
        Linkul este incomplet sau conversația nu mai există. Deschide conversația și încearcă din
        meniul mesajului.
      </p>
      <a
        href="/messages"
        className="mt-6 rounded-full bg-[#7c3aed] px-5 py-2.5 text-[14.5px] font-semibold text-white"
      >
        Mergi la mesaje
      </a>
    </main>
  )
}
