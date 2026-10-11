import { SettingsFormNew } from "@/components/app/settings-form-new"
import { Mounts } from "./mounts"
/* The real settings form with a made up account (no reads). */
export function SettingsFixture() {
  const profile = { id: "u1", email: "sam@example.com", display_name: "Sam Carter", username: "sam", bio: "", avatar_url: null, website: null, location: null, created_at: "2026-01-01" } as never
  const creator = { id: "c1", user_id: "u1", slug: "sam", store_name: "Sam's shop", store_published: true, stripe_account_id: "acct_1", stripe_onboarding_status: "complete", plan: "free" } as never
  return (
    <div>
      <Mounts name="settings-form" />
      <SettingsFormNew profile={profile} creator={creator} accountTimeZone="UTC" websitePublished onePageLive={false} sharePlatforms={[]} website={{ installId: null, name: null, handle: "sam" } as never} newsletter={false} otherStores={0} paymentsProvider={"stripe" as never} initialTab="general" />
    </div>
  )
}
