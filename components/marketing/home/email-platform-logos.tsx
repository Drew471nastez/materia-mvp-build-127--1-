/*
  THE FIVE EMAIL PLATFORMS STORELIB SYNCS, IN THEIR OWN MARKS (home, section 10).

  Wave 13, the owner: "use their REAL logos". None of the five is complete
  in Simple Icons (only Brevo and Kit are), so each is drawn here from the
  mark the company itself serves, as plain SVG (sharp at any size, nothing
  to fetch):

    Klaviyo     the flag, measured from klaviyo.com's 512px app icon
                (black #232426 on white).
    Omnisend    the "i" in its black rounded square, measured from
                omnisend.com's 192px icon.
    Brevo       brevo.com's own favicon SVG (2025), as published.
    MailerLite  the green "lite" speech bubble: mailerlite.com's
                safari-pinned-tab SVG, in the green of its app icon (#08C269).
    Kit         the K from kit.com's own logo component, on the light blue
                tile of its favicon (#44B1FF, the K #1E1E1E).

  Every mark is a 40px-ish app icon: a tile the size the caller gives.
*/

type Props = { className?: string }

export function KlaviyoLogo({ className }: Props) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false">
      <rect width="40" height="40" rx="10" fill="#fff" />
      <path d="M7.6 11.5h24.8L27.1 20l5.3 8.5H7.6z" fill="#232426" />
    </svg>
  )
}

export function OmnisendLogo({ className }: Props) {
  return (
    <svg viewBox="0 0 192 192" className={className} aria-hidden="true" focusable="false">
      <defs>
        <clipPath id="omnisend-tile">
          <rect width="192" height="192" rx="44" />
        </clipPath>
      </defs>
      <g clipPath="url(#omnisend-tile)">
        <rect width="192" height="192" fill="#000" />
        <circle cx="96" cy="51" r="17" fill="#fff" />
        <path d="M79 103c13.5 3 22.5 13.5 23.4 30.5V196" fill="none" stroke="#fff" strokeWidth="24" strokeLinecap="round" />
      </g>
    </svg>
  )
}

export function BrevoLogo({ className }: Props) {
  return (
    <svg viewBox="-6 -6 44 44" className={className} aria-hidden="true" focusable="false">
      <rect x="-6" y="-6" width="44" height="44" rx="11" fill="#fff" />
      <path d="M32 16C32 24.8366 24.8366 32 16 32C7.16344 32 0 24.8366 0 16C0 7.16344 7.16344 0 16 0C24.8366 0 32 7.16344 32 16Z" fill="#0B996E" />
      <path
        d="M21.0024 14.5395C21.9917 13.5708 22.4552 12.4513 22.4552 11.0897C22.4552 8.27639 20.3848 6.4 17.2642 6.4H9.6V26.4H15.7803C20.478 26.4 24 23.5258 24 19.7135C24 17.6254 22.9188 15.7502 21.0024 14.5395ZM12.3813 9.00158H16.9547C18.4995 9.00158 19.5198 9.87892 19.5198 11.2101C19.5198 12.7227 18.1913 13.8726 15.4721 14.7499C13.6179 15.3242 12.784 15.8086 12.4746 16.3842L12.3813 16.385V9.00158ZM15.533 23.7984H12.3813V20.7125C12.3813 19.3509 13.5558 18.0197 15.1937 17.5049C16.6466 17.0206 17.8508 16.5363 18.8711 16.0228C20.2307 16.8101 21.0646 18.1705 21.0646 19.593C21.0646 22.0133 18.7157 23.7984 15.533 23.7984Z"
        fill="#fff"
      />
    </svg>
  )
}

export function MailerLiteLogo({ className }: Props) {
  return (
    <svg viewBox="-70 -64 660 660" className={className} aria-hidden="true" focusable="false">
      <rect x="-70" y="-64" width="660" height="660" rx="165" fill="#fff" />
      <g transform="translate(0 520) scale(.1 -.1)" fill="#08C269">
        <path d="M670 4523c-102-16-223-85-298-169-62-70-95-134-121-239-7-26-11-615-11-1714v-1673l351 348c193 192 353 351 355 354 3 3 801 5 1772 6 1635 0 1772 2 1832 18 166 44 300 166 363 331l22 60 2 1120c3 1068 2 1123-16 1181-56 186-195 321-378 368-54 14-263 16-1954 15-1042-1-1905-4-1919-6zm606-729c12-9 31-27 41-42 17-25 18-71 20-793 1-700 0-770-15-800-24-46-64-72-116-75-53-3-107 29-126 76-10 25-13 190-13 794 0 727 1 764 19 794 38 65 128 86 190 46zm640-30c100-48 104-210 6-267-68-40-173-16-212 48-23 37-28 104-12 147 12 30 47 66 77 78 33 14 105 11 141-6zm733-255c18-17 21-31 21-109v-90h125c137 0 169-9 199-55 42-63 6-166-64-184-19-5-81-9-137-9-55 0-105-2-111-6-5-3-9-145-8-351 1-335 2-345 22-365 25-26 96-32 170-14 64 15 94 9 133-24 24-20 33-37 36-68 9-103-102-167-282-165-162 2-274 62-324 173-24 52-24 57-27 433-2 209-5 381-7 383-2 3-37 4-76 5-64 0-76 3-97 24-20 20-23 31-19 61 5 30 33 62 174 201 92 91 178 170 191 177 28 14 53 9 81-17zm1240-193c96-23 193-79 264-152 141-146 211-457 120-535-36-32-80-35-446-35l-368 1 6-35c16-86 96-174 191-210 109-41 285-30 414 27 66 29 87 33 121 21 74-25 108-117 66-179-39-59-199-131-322-146-197-24-371 5-500 82-122 74-216 214-249 375-19 93-15 288 8 375 39 147 141 287 257 350 97 53 190 74 309 71 58-2 116-6 129-10zm-1978-19c70-47 69-34 69-594 0-576 1-566-76-603-50-25-95-23-138 5-60 39-59 31-59 596 0 493 1 519 19 551 38 65 124 86 185 45z" />
        <path d="M3653 3070c-89-29-148-86-178-171-29-80-50-75 276-74h291l-5 32c-27 165-214 268-384 213z" />
      </g>
    </svg>
  )
}

export function KitLogo({ className }: Props) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden="true" focusable="false">
      <rect width="40" height="40" rx="10" fill="#44B1FF" />
      <g transform="translate(10.6 9.6) scale(.1)">
        <path
          fill="#1E1E1E"
          d="M124.73 86.32c56.03 10.86 73.42 62.73 73.9 114.9 0 1.18-.95 2.15-2.13 2.15h-70.53a2.1 2.1 0 0 1-2.12-2.1c-.2-40.48-6.77-76.2-46.88-77.74-1.19-.04-2.2.91-2.2 2.12v75.62c0 1.17-.94 2.12-2.11 2.12H2.12A2.1 2.1 0 0 1 0 201.27V8.55c0-1.17.95-2.12 2.12-2.12h70.56c1.17 0 2.11.95 2.11 2.12v72.18a1.93 1.93 0 0 0 3.79.58C96.73 21.77 130.68 6.8 185.79 6.45c1.18 0 2.12.95 2.12 2.12v72c0 1.17-.94 2.11-2.12 2.11h-60.7c-1.04 0-1.86.83-1.86 1.85 0 .87.64 1.63 1.5 1.8"
        />
      </g>
    </svg>
  )
}

/** The five, in the order the catalog lists them, with their names. */
export const EMAIL_PLATFORMS = [
  { name: "Klaviyo", Logo: KlaviyoLogo },
  { name: "Omnisend", Logo: OmnisendLogo },
  { name: "Brevo", Logo: BrevoLogo },
  { name: "MailerLite", Logo: MailerLiteLogo },
  { name: "Kit", Logo: KitLogo },
] as const
