import { SettingsFormNew } from "@/components/app/settings-form-new"
import { loadSettingsData } from "../_server"

export default async function PaymentsPage() {
  const data = await loadSettingsData()

  return (
    <SettingsFormNew
      profile={data.profile}
      creator={data.creator}
      storeBuilderAvatarUrl={data.storeBuilderAvatarUrl}
      onepageAvatarUrl={data.onepageAvatarUrl}
      googleAvatarUrl={data.googleAvatarUrl}
      initialTab="payments"
    />
  )
}
