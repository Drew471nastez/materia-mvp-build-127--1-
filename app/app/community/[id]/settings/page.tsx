import { communityHead, loadSettings, sectionPage } from "@/lib/communities/server/creator"
import { SettingsSection, type SettingsTab } from "@/components/community/creator/settings-section"

export const dynamic = "force-dynamic"

const TABS: readonly SettingsTab[] = ["general", "access", "discovery", "notifications", "gamification", "advanced"]

/** /app/community/<id>/settings?tab=general|access|discovery|notifications|gamification|advanced */
export default async function CommunitySettingsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const [{ id }, query] = await Promise.all([params, searchParams])
  const ctx = await sectionPage(id, "manage_settings")
  if (!ctx) return null
  const [head, data] = await Promise.all([communityHead(ctx), loadSettings(ctx)])
  const tab = TABS.find((t) => t === query.tab) ?? "general"
  return <SettingsSection head={head} data={data} tab={tab} />
}
