"use client"

/**
 * THE OWNER'S CONTROLS ARE FETCHED FOR THE OWNER.
 *
 * Edit profile, Edit about and the owner's menu are drawn only when the
 * creator looks at their own page, but imported plainly from the page they
 * were in every visitor's download: the rich text field with an HTML
 * sanitiser, drag and drop, image upload and the Supabase client (measured on
 * storelib.com/<name>: about 1.1 MB of JavaScript per visit).
 *
 * Loaded on demand instead, still drawn on the server for the owner (ssr
 * stays on), so the owner sees the same page and a visitor does not
 * download what they never see.
 */
import type { ComponentProps } from "react"
import dynamic from "next/dynamic"
import { useCreatorPageViewer } from "./creator-page-viewer"

export const EditProfileButton = dynamic(() => import("@/components/storefront/edit-profile-button").then((m) => m.EditProfileButton))
export const EditAboutButton = dynamic(() => import("@/components/storefront/edit-about-button").then((m) => m.EditAboutButton))
export const OwnerMenu = dynamic(() => import("@/components/storefront/owner-menu").then((m) => m.OwnerMenu))

/**
 * Edit about on the creator page (round 49): the owner's own typed contact
 * address is not in the page (one HTML for everybody), so their form takes
 * it from /api/creator-page/viewer, which answers it to the owner only.
 * Drawn inside OwnerOnly, after that answer is in.
 */
export function EditAboutButtonForOwner(props: Omit<ComponentProps<typeof EditAboutButton>, "contactEmail">) {
  const { contactEmail } = useCreatorPageViewer()
  return <EditAboutButton {...(props as ComponentProps<typeof EditAboutButton>)} contactEmail={contactEmail ?? ""} />
}
