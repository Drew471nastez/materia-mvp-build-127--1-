import { redirect } from "next/navigation"
import { SettingsFormNew } from "@/components/app/settings-form-new"
import { loadSettingsData, type SettingsTab } from "../_server"

const VALID_TABS = new Set<SettingsTab>(["general", "security", "privacy", "billing", "payments", "stores"])

export default async function SettingsTabPage({ params }: { params: Promise<{ tab: string }> }) {
  const { tab } = await params

  if (!VALID_TABS.has(tab as SettingsTab)) {
    redirect("/app/settings")
  }

  const data = await loadSettingsData()

  return (
    <SettingsFormNew
      profile={data.profile}
      creator={data.creator}
      storeBuilderAvatarUrl={data.storeBuilderAvatarUrl}
      onepageAvatarUrl={data.onepageAvatarUrl}
      googleAvatarUrl={data.googleAvatarUrl}
      initialTab={tab as SettingsTab}
    />
  )
}
