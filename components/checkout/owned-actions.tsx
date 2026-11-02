"use client"

/**
 * ===========================================================================
 *  UNDER DOWNLOAD: THE LIBRARY, OR THE GUEST BUYER'S OWN WAY TO KEEP IT (round 49)
 * ===========================================================================
 * The product page drew one or the other on the server, from the guest
 * buyer's signed sl_owned cookie. It is one HTML for everybody now (a CDN
 * holds it), so the purchase check in the browser decides
 * (components/checkout/use-purchase-status, /api/purchases/verify `guest`),
 * and the buy box hands its answer down here (PurchaseViewerContext). This
 * is only drawn once that check says the product is owned.
 */
import { createContext, useContext } from "react"
import { GuestOwnedActions } from "./guest-owned-actions"
import { ViewInLibraryButton } from "./view-in-library-button"

export interface PurchaseViewer {
  guest: { orderId: string; maskedEmail: string | null } | null
  signedIn: boolean
}

export const PurchaseViewerContext = createContext<PurchaseViewer>({ guest: null, signedIn: false })

export function OwnedActions({ backgroundColor, textColor, borderColor, mutedColor }: { backgroundColor?: string; textColor?: string; borderColor?: string; mutedColor?: string }) {
  const { guest, signedIn } = useContext(PurchaseViewerContext)
  if (guest) {
    return (
      <GuestOwnedActions
        orderId={guest.orderId}
        maskedEmail={guest.maskedEmail}
        signedIn={signedIn}
        backgroundColor={backgroundColor}
        textColor={textColor}
        borderColor={borderColor}
        mutedColor={mutedColor}
      />
    )
  }
  return <ViewInLibraryButton backgroundColor={backgroundColor} textColor={textColor} borderColor={borderColor} />
}
