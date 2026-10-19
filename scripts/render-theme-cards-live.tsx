/**
 * The marketplace page mounted in a browser with the fixture listings, for
 * scripts/check-theme-marketplace.mjs to hover and tap: the same
 * ThemesMarketplace storelib.com/themes draws, its cards the library's.
 */
import { createElement } from "react"
import { createRoot } from "react-dom/client"

import { ThemesMarketplace } from "@/app/(marketing)/themes/themes-marketplace"
import { probeListings } from "./theme-marketplace-fixtures"

const cover = (window as unknown as { __COVER__?: string }).__COVER__ ?? ""
createRoot(document.getElementById("root")!).render(createElement(ThemesMarketplace, { listings: probeListings(cover) }))
