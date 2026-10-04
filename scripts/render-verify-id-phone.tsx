/** The Verify ID phone page (the QR code's target), for scripts/check-setup-own-form.mjs. */
import * as React from "react"
import { createRoot } from "react-dom/client"
import { VerifyIdOnPhone } from "@/components/app/settings/verify-id-phone"

createRoot(document.getElementById("app")!).render(<VerifyIdOnPhone token="probe.token" />)
