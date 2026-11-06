/** Actual platform header + receipt + buyer tabs, with local purchase fixtures. */
import React from "react"
import {createRoot} from "react-dom/client"
import {LocaleProvider} from "@/components/locale-provider"
import {PlatformSettingsProvider} from "@/components/platform/platform-settings-context"
import {PlatformHeaderClient} from "@/components/platform/platform-header-client"
import {BuyerTabBar} from "@/components/nav/buyer-tab-bar"
import {ReceiptView} from "@/app/(storelib)/receipt/[token]/receipt-view"
import {receiptCases} from "./receipt-cases"
const chosen=receiptCases(location.origin)[new URLSearchParams(location.search).get("case")||"guest"]
chosen.receipt.items=chosen.receipt.items.map((item: Record<string, unknown>)=>({...item,thumbnailUrl:"/audit-images/icon-light-32x32.png"}))
const user=chosen.viewer.signedIn?{id:"probe-user",email:"ghita.nastase@gmail.com",user_metadata:{}}:null
Object.assign(globalThis,{PROBE_USER:user,PROBE_SESSION:user?{access_token:"fixture",user}:null,PROBE_PROFILE:{id:"probe-user",display_name:"Ghita Nastase",avatar_url:null,is_creator:false}})
createRoot(document.getElementById("app")!).render(<LocaleProvider><PlatformSettingsProvider exploreMarketplace buyerHeaderLight><div className="flex min-h-svh flex-col bg-[#f5f6f8]" data-receipt-frame=""><PlatformHeaderClient buyerHeaderLight/><ReceiptView receipt={chosen.receipt as never} viewer={chosen.viewer as never} locale="en-US"/><BuyerTabBar/></div></PlatformSettingsProvider></LocaleProvider>)
