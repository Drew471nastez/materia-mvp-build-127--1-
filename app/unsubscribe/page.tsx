"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Loader2, CheckCircle, XCircle, Mail } from "lucide-react"

export default function UnsubscribePage() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const [status, setStatus] = useState<"loading" | "success" | "error" | "already">("loading")
  const [email, setEmail] = useState<string>("")

  useEffect(() => {
    if (!token) {
      setStatus("error")
      return
    }

    const unsubscribe = async () => {
      try {
        const response = await fetch(`/api/email/unsubscribe?token=${token}`)
        const html = await response.text()

        // Parse the response to get status
        if (html.includes("Successfully")) {
          setStatus("success")
          // Try to extract email from response
          const emailMatch = html.match(/$$([^)]+@[^)]+)$$/)
          if (emailMatch) setEmail(emailMatch[1])
        } else if (html.includes("Already Unsubscribed")) {
          setStatus("already")
        } else {
          setStatus("error")
        }
      } catch (error) {
        setStatus("error")
      }
    }

    unsubscribe()
  }, [token])

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <Loader2 className="h-12 w-12 animate-spin text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">Processing your request...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        {status === "success" && (
          <>
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Unsubscribed Successfully</h1>
            <p className="text-gray-600 mb-6">
              {email ? `${email} has` : "You have"} been unsubscribed and will no longer receive emails from this
              sender.
            </p>
            <p className="text-sm text-gray-500 mb-6">
              If this was a mistake, you can resubscribe by visiting the sender's page.
            </p>
          </>
        )}

        {status === "already" && (
          <>
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Mail className="h-8 w-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Already Unsubscribed</h1>
            <p className="text-gray-600 mb-6">You have already been unsubscribed from this mailing list.</p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <XCircle className="h-8 w-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Link</h1>
            <p className="text-gray-600 mb-6">
              This unsubscribe link is invalid or has expired. Please contact the sender directly if you wish to
              unsubscribe.
            </p>
          </>
        )}

        <div className="pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-400">Powered by Storelib</p>
        </div>
      </div>
    </div>
  )
}
