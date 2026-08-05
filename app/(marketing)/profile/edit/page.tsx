import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { readProfileRow } from "@/lib/profile/read"
import { ProfileEditForm } from "@/components/member/profile-edit-form"

/**
 * /profile/edit — the subpage behind "Editează profilul".
 *
 * A route rather than a modal, and the reasoning is in
 * components/member/profile-edit-form.tsx. What matters here is that it is a
 * REAL page: it has an address, the phone's back gesture leaves it, the form
 * survives a rotation, and nothing about it depends on the profile still being
 * mounted underneath.
 *
 * Dynamic for the same reason /profile is: this is your own row, and a cached
 * copy of it would be somebody else's.
 */

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Editează profilul | Storelib",
  robots: { index: false, follow: false },
}

export default async function ProfileEditPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login?next=/profile/edit")

  // The optional columns are asked for once and dropped by name if this
  // database has not got them — see lib/profile/read.ts. A form that cannot
  // read `bio` should still let somebody change their name.
  const { row: profile } = await readProfileRow((cols) =>
    createAdminClient().from("profiles").select(cols).eq("id", user.id).maybeSingle(),
  )

  const emailHandle = user.email?.split("@")[0] || null

  return (
    <ProfileEditForm
      userId={user.id}
      username={profile?.username || emailHandle || "eu"}
      initial={{
        displayName: profile?.display_name ?? user.user_metadata?.display_name ?? null,
        bio: profile?.bio ?? null,
        cover: profile?.cover_url ?? null,
        avatar: profile?.avatar_url ?? user.user_metadata?.avatar_url ?? null,
      }}
    />
  )
}
