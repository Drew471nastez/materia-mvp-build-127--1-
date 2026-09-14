import { SettingsFormNew } from "@/components/app/settings-form-new"
import type { Metadata } from "next"
import { loadSettingsData } from "./_server"

export const metadata: Metadata = {
  title: "Settings",
}

export default async function SettingsPage() {
  const data = await loadSettingsData()

  return (
    <SettingsFormNew
      profile={data.profile}
      creator={data.creator}
      storeBuilderAvatarUrl={data.storeBuilderAvatarUrl}
      onepageAvatarUrl={data.onepageAvatarUrl}
      googleAvatarUrl={data.googleAvatarUrl}
      websitePublished={data.websitePublished}
      initialTab="general"
    />
  )
}
