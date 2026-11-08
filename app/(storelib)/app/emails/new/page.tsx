/**
 * /app/emails/new: a new email, written in the composer
 * (components/email/compose/composer.tsx). The first save gives it an
 * address of its own, /app/emails/edit/<id>, so a reload opens the draft.
 *
 * Round 51, the shared contract with Contacts: it can open with people
 * already chosen, ?to=<contactId> for one and ?contacts=<id,id,...> for a
 * selection (at most 200), or with a saved segment, ?segment=<id>, or with
 * a layout from Campaigns › Templates, ?layout=<id>. Who of the picked
 * people may get it is decided on the server (app/api/email/recipients).
 */
import { ComposePage } from "@/components/email/compose/compose-page"
import type { Metadata } from "next"
import { getServerTt } from "@/lib/i18n/server"
import { readContactIds } from "@/lib/emails/recipient-contacts"

export async function generateMetadata(): Promise<Metadata> {
  const { tt } = await getServerTt()
  return { title: tt("New email") }
}

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : Array.isArray(v) ? v[0] : undefined)

export default async function NewEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams
  const contacts = readContactIds(one(sp.to), one(sp.contacts))
  const segment = one(sp.segment)
  const layout = one(sp.layout)
  return (
    <ComposePage
      campaignId={null}
      preset={{
        contacts,
        segment: segment && /^[0-9a-f-]{36}$/i.test(segment) ? segment : null,
        layout: layout && /^[a-z_]{1,32}$/.test(layout) ? layout : null,
      }}
    />
  )
}
