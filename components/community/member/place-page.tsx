import "server-only"

/**
 * A PLACE'S ROUTE PAGE, ROUND 15: SEED THE SHELL, DRAW NOTHING OF ITS OWN. A reload, a shared link or a first visit
 * still renders on the server, as before: the page reads its place through the one loader
 * (lib/communities/server/places.ts, the same one the JSON place route uses) and hands it to the community's shell
 * (place-host.tsx PlaceSeed), which draws it inside the frame. Moving between places afterwards never comes back here.
 *
 * The (member) layout above already sent anybody who is not a member away; this checks again, never trusting it alone.
 */
import { notFound } from "next/navigation"
import { admin } from "@/lib/communities/server/db"
import { loadPlace } from "@/lib/communities/server/places"
import type { Place } from "@/lib/communities/client/places"
import { memberPage } from "./data"
import { MemberStateScreen } from "./member-state"
import { PlaceSeed } from "./place-host"

async function PlacePageAsync({ slug, place, lesson = null }: { slug: string; place: Place; lesson?: string | null }) {
  const page = await memberPage(slug)
  if (page.state === "off" || page.state === "missing" || !page.community) notFound()
  /* A request waiting, a ban, a paused community, a session that could not be read: one plain screen, as the feed's page drew. */
  if (page.state === "banned" || page.state === "pending" || page.state === "closed" || page.state === "unknown") return <MemberStateScreen state={page.state} community={page.community} />
  if (page.state !== "member" || !page.viewer) notFound()
  const load = await loadPlace(admin(), page.community, page.viewer, place, { lesson })
  if (!load.ok) notFound()
  return <PlaceSeed communityId={page.community.id} slug={page.community.slug} place={load.place} data={load.data} at={Date.now()} />
}

/** For JSX (an async server component, typed as shell.tsx explains): `<PlacePage slug={slug} place={{ kind: "learn" }} />`. */
export const PlacePage = PlacePageAsync as unknown as (props: { slug: string; place: Place; lesson?: string | null }) => React.ReactElement
