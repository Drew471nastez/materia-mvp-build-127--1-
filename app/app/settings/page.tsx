import { SettingsFormNew } from "@/components/app/settings-form-new"
import type { Metadata } from "next"
import { loadSettingsData } from "./_server"

export const metadata: Metadata = {
  title: "Settings",
}

export default async function SettingsPage() {
  const data = await loadSettingsData()
  if (!data) return null

  return (
    <SettingsFormNew
      profile={data.profile}
      creator={data.creator}
      accountTimeZone={data.timeZone}
      websitePublished={data.websitePublished}
      onePageLive={data.onePageLive}
      sharePlatforms={data.sharePlatforms}
      website={data.website}
      newsletter={data.newsletter}
      otherStores={data.otherStores}
      paymentsProvider={data.paymentsProvider}
      initialTab="general"
    />
  )
}
