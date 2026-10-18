import { AppNotFoundBody } from "@/components/app/app-not-found-body"
import { PageLanded } from "@/components/app/app-stage"
import { getServerTt } from "@/lib/i18n/server"

export default async function AppNotFound() {
  const { tt } = await getServerTt()
  return (
    <>
      <PageLanded />
      <AppNotFoundBody tt={tt} />
    </>
  )
}
