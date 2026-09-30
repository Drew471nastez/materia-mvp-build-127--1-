/** Payment marks drawn in the page. No remote images. */

export function StripeMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" rx="10" fill="#635bff" />
      <path fill="#fff" d="M18.2 16.2c0-.9.7-1.3 1.9-1.3 1.7 0 3.8.5 5.5 1.4V12c-1.8-.7-3.6-1-5.5-1-4.5 0-7.5 2.3-7.5 6.2 0 6.1 8.4 5.1 8.4 7.7 0 1.1-.9 1.4-2.2 1.4-1.9 0-4.4-.8-6.3-1.9v4.4c2.1.9 4.3 1.3 6.3 1.3 4.6 0 7.8-2.3 7.8-6.2 0-6.6-8.4-5.4-8.4-7.7z" />
    </svg>
  )
}

export function VisaMark() {
  return (
    <svg viewBox="0 8.1 24 7.8" className="h-[14px] w-9" aria-label="Visa" role="img">
      <path
        fill="#1a1f71"
        d="M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z"
      />
    </svg>
  )
}

export function MastercardMark() {
  return (
    <svg viewBox="0 0 32 20" className="h-4 w-7" aria-hidden>
      <circle cx="12" cy="10" r="7" fill="#eb001b" />
      <circle cx="20" cy="10" r="7" fill="#f79e1b" />
      <path d="M16 4.8a7 7 0 0 1 0 10.4 7 7 0 0 1 0-10.4z" fill="#ff5f00" />
    </svg>
  )
}

export function AmexMark() {
  return (
    <svg viewBox="0 0 36 16" className="h-4 w-9" aria-hidden>
      <rect width="36" height="16" rx="2" fill="#2e77bc" />
      <text x="18" y="11.5" textAnchor="middle" fill="#fff" fontFamily="Arial, Helvetica, sans-serif" fontSize="8" fontWeight="700">AMEX</text>
    </svg>
  )
}

export function ApplePayMark() {
  return (
    <svg viewBox="0 0 40 16" className="h-4 w-10" aria-hidden>
      <text x="0" y="12" fill="#111" fontFamily="Arial, Helvetica, sans-serif" fontSize="11" fontWeight="600"> Pay</text>
      <path fill="#111" d="M8.2 3.2c.4-.5.7-1.2.6-1.9-.6 0-1.3.4-1.7.9-.4.4-.7 1.1-.6 1.8.7 0 1.3-.3 1.7-.8zM8.8 4.4c-.9-.1-1.7.5-2.1.5s-1.1-.5-1.9-.5c-1 0-1.8.6-2.3 1.4-1 1.7-.3 4.3.7 5.7.5.7 1 1.4 1.8 1.4.7 0 1-.4 1.8-.4s1.1.4 1.9.4 1.2-.7 1.7-1.4c.5-.8.7-1.5.7-1.6-.1 0-1.4-.5-1.4-2.1 0-1.3 1.1-1.9 1.1-2 .-.6-1.1-1.1-1.6-1.2-.4-.1-.4-.1-.4 0z" />
    </svg>
  )
}

export function GooglePayMark() {
  return (
    <svg viewBox="0 0 40 16" className="h-4 w-10" aria-hidden>
      <text x="12" y="12" fill="#5f6368" fontFamily="Arial, Helvetica, sans-serif" fontSize="11" fontWeight="600">Pay</text>
      <path fill="#4285f4" d="M7.8 8.2v2.3h3.8c-.2 1-1.2 2.8-3.8 2.8A4.3 4.3 0 1 1 7.8 4.7c1.2 0 2 .5 2.5 1l1.7-1.6A7 7 0 0 0 7.8 1a7.2 7.2 0 1 0 0 14.4c4.2 0 6.9-2.9 6.9-7 0-.5 0-.8-.1-1.2H7.8z" />
    </svg>
  )
}
