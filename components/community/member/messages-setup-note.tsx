import "server-only"

/**
 * ===========================================================================
 *  WHY MEMBERS CANNOT MESSAGE EACH OTHER YET, FOR STAFF
 * ===========================================================================
 * The Messages button in a community's bar is drawn only once member
 * messages exist in the database (run-now part 83) and the community has
 * chat on. A member never sees why it is missing, and should not. Staff
 * should: on the community's overview in /app, when chat is on and only
 * the part is missing, one quiet line says so, instead of the button simply
 * never appearing. Nothing is drawn once the part has run, with chat off,
 * or when the database could not be asked.
 */
import { admin, missing } from "@/lib/communities/server/db"

/** Whether the part 83 tables are missing (true), there (false), or the answer is unknown (null). */
export async function messagesPartMissing(): Promise<boolean | null> {
  try {
    const { error } = await admin().from("community_conversations").select("id", { count: "exact", head: true }).limit(1)
    if (!error) return false
    return missing(error) ? true : null
  } catch {
    return null
  }
}

async function MessagesSetupNoteAsync({ chatEnabled }: { chatEnabled: boolean }) {
  if (!chatEnabled || (await messagesPartMissing()) !== true) return null
  return (
    <p className="mb-4 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-[13.5px] leading-relaxed text-[#4b5563]" data-messages-setup-note="">
      <span className="font-medium text-[#1a1a2e]">Member messages are not set up yet.</span> Chat is on, but the database update that adds messages between members (run-now part 83) has not run, so members do not see the Messages button. It appears on its own once the update has run.
    </p>
  )
}

/** For JSX, as CommunityFeedPage (feed-page.tsx) is: an async server component typed as a plain one. */
export const MessagesSetupNote = MessagesSetupNoteAsync as unknown as (props: { chatEnabled: boolean }) => React.ReactElement | null
