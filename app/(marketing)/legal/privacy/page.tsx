"use client"

import { ArrowLeft, Shield } from "lucide-react"
import { backThen } from "@/lib/navigation/go-back"

export default function LegalPrivacyPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Redirect notice */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <button
          type="button"
          /* Most visits here are a link somebody was sent, with nothing behind
             them: a bare back did nothing at all (lib/navigation/go-back). */
          onClick={() => backThen(() => window.location.assign("/privacy"))}
          className="inline-flex items-center gap-2 text-[14px] text-[#6b7280] hover:text-[#1a1a2e] transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 rounded-xl bg-[#8b5cf6]/10 flex items-center justify-center">
            <Shield className="h-6 w-6 text-[#8b5cf6]" />
          </div>
          <div>
            <h1 className="text-[32px] font-bold text-[#1a1a2e]">Privacy Policy</h1>
            <p className="text-[14px] text-[#6b7280] mt-1">Redirecting to our full Privacy Policy…</p>
          </div>
        </div>
        <p className="text-[15px] text-[#4b5563]">
          Our Privacy Policy has moved.{" "}
          <a href="/privacy" className="text-[#8b5cf6] hover:underline font-medium">
            Click here to view the full Privacy Policy →
          </a>
        </p>
        <script
          dangerouslySetInnerHTML={{
            __html: `window.location.replace("/privacy")`,
          }}
        />
      </div>
    </div>
  )
}
