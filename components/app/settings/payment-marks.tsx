/** Payment marks drawn in the page. No remote images. */
import { cn } from "@/lib/utils"

export function StripeMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" role="img" aria-label="Stripe">
      <rect width="40" height="40" rx="9" fill="#635bff" />
      <svg x="10" y="9" width="20" height="22" viewBox="3.7 0 17 24">
        <path
          fill="#fff"
          d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"
        />
      </svg>
    </svg>
  )
}

/** Header lockup: Stripe mark and Storelib Payments / Powered by Stripe. */
export function StorelibPaymentsBrand({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  const mark = size === "lg" ? "h-11 w-11 sm:h-12 sm:w-12" : "h-10 w-10"
  const title = size === "lg" ? "text-[16px] sm:text-[17px]" : "text-[15px]"
  const sub = size === "lg" ? "text-[12px] sm:text-[13px]" : "text-[12px]"
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      <StripeMark className={cn(mark, "shrink-0")} />
      <div className="min-w-0">
        <p className={cn("truncate font-semibold leading-5 text-[#1a1a2e]", title)}>Storelib Payments</p>
        <p className={cn("truncate leading-4 text-[#6b7280]", sub)}>Powered by Stripe</p>
      </div>
    </div>
  )
}

const BADGE = "h-6 w-[38px] shrink-0"

export function VisaMark() {
  return (
    <svg viewBox="0 0 38 24" className={BADGE} role="img" aria-label="Visa">
      <rect width="38" height="24" rx="4" fill="#1a1f71" />
      <svg x="6" y="7.5" width="26" height="9" viewBox="0 8.1 24 7.8">
        <path
          fill="#fff"
          d="M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z"
        />
      </svg>
    </svg>
  )
}

export function MastercardMark() {
  return (
    <svg viewBox="0 0 38 24" className={BADGE} role="img" aria-label="Mastercard">
      <rect width="38" height="24" rx="4" fill="#1f1f1f" />
      <circle cx="15" cy="12" r="6.5" fill="#eb001b" />
      <circle cx="23" cy="12" r="6.5" fill="#f79e1b" />
      <path d="M19 6.9a6.5 6.5 0 0 1 0 10.2 6.5 6.5 0 0 1 0-10.2z" fill="#ff5f00" />
    </svg>
  )
}

export function AmexMark() {
  return (
    <svg viewBox="0 0 38 24" className={BADGE} role="img" aria-label="American Express">
      <rect width="38" height="24" rx="4" fill="#1f72cd" />
      <text x="19" y="15.5" textAnchor="middle" fill="#fff" fontFamily="Arial, Helvetica, sans-serif" fontSize="8.5" fontWeight="800" letterSpacing="0.3">AMEX</text>
    </svg>
  )
}

export function ApplePayMark() {
  return (
    <svg viewBox="0 0 38 24" className={BADGE} role="img" aria-label="Apple Pay">
      <rect x="0.5" y="0.5" width="37" height="23" rx="3.5" fill="#fff" stroke="#d1d5db" />
      <svg x="6.5" y="6" width="9" height="11" viewBox="0 0 384 512">
        <path
          fill="#000"
          d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"
        />
      </svg>
      <text x="16.5" y="15.8" fill="#000" fontFamily="-apple-system, 'Helvetica Neue', Arial, sans-serif" fontSize="8.5" fontWeight="600">Pay</text>
    </svg>
  )
}

export function GooglePayMark() {
  return (
    <svg viewBox="0 0 38 24" className={BADGE} role="img" aria-label="Google Pay">
      <rect x="0.5" y="0.5" width="37" height="23" rx="11.5" fill="#fff" stroke="#d1d5db" />
      <svg x="6" y="7" width="10" height="10" viewBox="0 0 48 48">
        <path fill="#4285f4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.8-2.1 5.1-4.4 6.7v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.2z" />
        <path fill="#34a853" d="M24 46c5.9 0 10.9-2 14.5-5.3l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.4v5.7C8 41.1 15.4 46 24 46z" />
        <path fill="#fbbc05" d="M11.7 28.2c-.4-1.3-.7-2.7-.7-4.2s.3-2.9.7-4.2v-5.7H4.4A21.9 21.9 0 0 0 2 24c0 3.5.8 6.9 2.4 9.9l7.3-5.7z" />
        <path fill="#ea4335" d="M24 10.7c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8 6.9 4.4 14.1l7.3 5.7c1.7-5.2 6.6-9.1 12.3-9.1z" />
      </svg>
      <text x="17.5" y="15.8" fill="#3c4043" fontFamily="Arial, Helvetica, sans-serif" fontSize="8.5" fontWeight="600">Pay</text>
    </svg>
  )
}
