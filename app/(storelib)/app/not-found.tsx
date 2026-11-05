import { AppNotFoundBody } from "@/components/app/app-not-found-body"
import { NOT_FOUND_METADATA } from "@/lib/seo/not-found-metadata"
import { PageLanded } from "@/components/app/app-stage"
import { getServerTt } from "@/lib/i18n/server"

/* One robots tag on a 404, and it says noindex: lib/seo/not-found-metadata.ts. */
export const metadata = NOT_FOUND_METADATA

export default async function AppNotFound() {
  const { tt } = await getServerTt()
  return (
    <>
      <PageLanded />
      <AppNotFoundBody tt={tt} />
    </>
  )
}
