/**
 * The notice a creator's website shows when checkout brings a buyer back
 * with ?checkout=paid (components/website-builder/checkout-return-notice.tsx),
 * mounted alone over a stand-in page, for scripts/check-agent-commerce.mjs.
 */
import { createRoot } from "react-dom/client"
import { CheckoutReturnNotice } from "@/components/website-builder/checkout-return-notice"

createRoot(document.getElementById("root")!).render(<CheckoutReturnNotice />)
