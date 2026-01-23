"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"

// Storelib logo SVG component - inlined for instant loading
const StorelibLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-label="Storelib">
    <path d="M0 0 C1.25598999 -0.00852997 2.51197998 -0.01705994 3.80603027 -0.02584839 C5.19036878 -0.02514942 6.57470719 -0.02422639 7.95904541 -0.02310181 C9.42299746 -0.02908898 10.88694635 -0.03589496 12.35089111 -0.04345703 C16.32216398 -0.06110767 20.29335063 -0.06581209 24.26465893 -0.0670886 C26.7484317 -0.06851159 29.23218266 -0.07278404 31.71595001 -0.07808304 C40.3887928 -0.09658205 49.06157417 -0.10475404 57.73443604 -0.10317993 C65.80571415 -0.1019794 73.87672448 -0.1230646 81.94793487 -0.15466726 C88.88740979 -0.18086566 95.82679746 -0.1915457 102.76632142 -0.19026911 C106.90650235 -0.18976041 111.04644538 -0.19539209 115.18657684 -0.21662521 C119.08386362 -0.23606723 122.98068708 -0.2360918 126.87799072 -0.22159195 C128.3029473 -0.21950992 129.72793332 -0.22416847 131.15283966 -0.23631287 C141.09680252 -0.31552915 147.72066213 0.96939458 156.01470947 6.39242554 C164.00844081 14.7495083 164.48967637 23.75783423 164.39581299 34.77963257 C164.40096022 36.32476622 164.40824753 37.86989399 164.41749573 39.41500854 C164.43591288 43.58446598 164.42313434 47.75327889 164.40340543 51.92270899 C164.38694289 56.29916711 164.39584208 60.67558686 164.40092468 65.05206299 C164.40543622 72.39722923 164.38963191 79.74214002 164.3616333 87.08724976 C164.32956172 95.56596535 164.32960943 104.04422102 164.34684807 112.52296937 C164.36273668 120.69971652 164.35596615 128.87629588 164.33891106 137.05303574 C164.33205827 140.52416353 164.33305464 143.99515609 164.34045601 147.46628189 C164.34814329 151.55574766 164.33591375 155.64469271 164.3086071 159.73406982 C164.30174858 161.23038055 164.30159802 162.72674016 164.30882263 164.22304916 C164.34272151 172.16130636 164.16638678 178.42591425 159.76470947 185.26742554 C159.22845947 186.15430054 158.69220947 187.04117554 158.13970947 187.95492554 C152.43571606 193.50881386 144.75237362 196.38313512 136.89727783 196.41459656 C135.67216995 196.42175186 134.44706207 196.42890717 133.18482971 196.4362793 C131.8247378 196.43911959 130.46464562 196.44183131 129.10455322 196.44442749 C127.67369929 196.45069344 126.24284699 196.45734036 124.81199646 196.46434021 C120.10874564 196.48537739 115.40549454 196.49574619 110.70220947 196.50570679 C109.0806883 196.50975527 107.45916731 196.51387222 105.83764648 196.51805687 C98.21463332 196.53711229 90.59162982 196.55133937 82.96859741 196.55966884 C74.18508474 196.56942573 65.40182511 196.59570309 56.61840153 196.63616973 C49.82077103 196.66640598 43.02321272 196.68114504 36.22551632 196.68444985 C32.17017831 196.68679292 28.1151105 196.69565491 24.05984497 196.72091103 C20.23810795 196.74432693 16.41681639 196.74837134 12.59502602 196.73814964 C11.19992904 196.73765734 9.80480913 196.7438867 8.4097805 196.75770569 C-1.41657181 196.84951715 -9.61649844 195.68755985 -18.11029053 190.51742554 C-27.18735637 180.90641464 -27.53411292 170.57341229 -27.49407959 157.91610718 C-27.49679343 156.4714185 -27.50035657 155.02673121 -27.50469971 153.58204651 C-27.51378005 149.67704699 -27.51029729 145.77215372 -27.50394154 141.86715245 C-27.49885795 137.76875741 -27.50357962 133.67037113 -27.50671387 129.57197571 C-27.51034706 122.68992489 -27.50557183 115.80791708 -27.49603271 108.9258728 C-27.48515374 100.98582544 -27.4886723 93.04588084 -27.49968553 85.10583597 C-27.50878201 78.27246064 -27.51003202 71.43911611 -27.50480819 64.60573667 C-27.5017009 60.53163085 -27.50124478 56.45757321 -27.50788116 52.38347054 C-27.51368829 48.55108556 -27.50959658 44.71883213 -27.49809265 40.88646126 C-27.4954638 39.48569964 -27.49618056 38.08492682 -27.50061798 36.68416977 C-27.53530251 24.61619513 -27.10564593 15.19154067 -18.23529053 6.26742554 C-15.93480906 4.53840125 -13.88377264 3.49357466 -11.23529053 2.26742554 C-10.46928402 1.91071463 -9.70327751 1.55400372 -8.91405869 1.18648338 C-5.79872006 0.11764269 -3.29228243 0.01012495 0 0 Z" fill="#8B56FA" transform="translate(31.23529052734375,1.732574462890625)"/>
    <path d="M0 0 C0.99749268 0.36665771 0.99749268 0.36665771 2.01513672 0.74072266 C6.62777473 2.59663113 6.62777473 2.59663113 7.68823242 4.86303711 C7.94652165 7.99120666 7.02705902 10.04467511 5.85546875 12.94921875 C5.41009766 14.05974609 4.96472656 15.17027344 4.50585938 16.31445312 C4.02955078 17.46880859 3.55324219 18.62316406 3.0625 19.8125 C2.59779297 20.97845703 2.13308594 22.14441406 1.65429688 23.34570312 C-1.85471661 31.98985831 -1.85471661 31.98985831 -4.125 33.125 C-6.02961204 32.43054915 -7.90085447 31.64344514 -9.75 30.8125 C-19.66422998 26.58368153 -27.26609106 25.85047702 -38.125 26.125 C-38.455 27.115 -38.785 28.105 -39.125 29.125 C-38.14402344 29.36734375 -37.16304687 29.6096875 -36.15234375 29.859375 C-33.31305776 30.56236873 -30.47635159 31.27497918 -27.640625 31.9921875 C-24.80213536 32.70970135 -21.95989766 33.40235421 -19.109375 34.0703125 C-6.69949938 37.1089446 3.02755655 40.84926977 9.875 52.125 C13.29151905 58.95803811 12.61307566 67.23479967 10.625 74.4375 C7.53029491 83.45189328 1.37513276 90.18616729 -7.02734375 94.67578125 C-26.20884362 103.04454374 -49.04415352 101.90170642 -68.5 94.625 C-72.25964144 93.07749587 -75.67848864 91.2806362 -79.125 89.125 C-78.55593823 84.90468545 -77.56543969 81.39586411 -75.83984375 77.5078125 C-75.39189453 76.48945313 -74.94394531 75.47109375 -74.48242188 74.421875 C-73.77956055 72.85179688 -73.77956055 72.85179688 -73.0625 71.25 C-72.59005859 70.18007812 -72.11761719 69.11015625 -71.63085938 68.0078125 C-70.46832699 65.3774362 -69.29955398 62.75002483 -68.125 60.125 C-63.80181734 61.13483216 -60.07150265 62.96083682 -56.07421875 64.87109375 C-49.32009515 67.74271451 -43.48344492 68.41757298 -36.25 68.3125 C-35.38375 68.31185547 -34.5175 68.31121094 -33.625 68.31054688 C-29.55080641 68.64235092 -29.55080641 68.64235092 -26.125 67.125 C-32.43853708 64.84703882 -38.66045093 62.93279428 -45.25 61.625 C-56.73505022 59.25968679 -67.31315991 55.21661495 -74.125 45.125 C-77.1608836 40.09281577 -77.67121961 36.10082917 -77.625 30.375 C-77.62072998 29.57876221 -77.61645996 28.78252441 -77.61206055 27.9621582 C-77.37730644 19.82208022 -74.95520496 14.3797357 -69.625 8.25 C-68.8 7.54875 -67.975 6.8475 -67.125 6.125 C-66.403125 5.465 -65.68125 4.805 -64.9375 4.125 C-46.69751714 -8.84565448 -20.22397968 -7.61423584 0 0 Z" fill="#FDFDFF" transform="translate(134.125,52.875)"/>
  </svg>
)

// 3D Coin icon for creator/monetize
const CoinIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Coin base - 3D effect */}
    <ellipse cx="12" cy="14" rx="8" ry="3" fill="#D4AF37" opacity="0.6"/>
    <ellipse cx="12" cy="13" rx="8" ry="3" fill="#F5D061"/>
    {/* Main coin face */}
    <circle cx="12" cy="10" r="8" fill="url(#coinGradient)" stroke="#D4AF37" strokeWidth="1"/>
    {/* Dollar sign */}
    <path d="M12 6V7M12 13V14M10 8.5C10 7.67 10.9 7 12 7C13.1 7 14 7.67 14 8.5C14 9.33 13.1 10 12 10C10.9 10 10 10.67 10 11.5C10 12.33 10.9 13 12 13C13.1 13 14 12.33 14 11.5" stroke="#8B6914" strokeWidth="1.5" strokeLinecap="round"/>
    {/* Gradient definition */}
    <defs>
      <linearGradient id="coinGradient" x1="12" y1="2" x2="12" y2="18" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#FFE066"/>
        <stop offset="50%" stopColor="#F5D061"/>
        <stop offset="100%" stopColor="#D4AF37"/>
      </linearGradient>
    </defs>
  </svg>
)

const UserIcon = () => (
  <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 21V19C20 17.9391 19.5786 16.9217 18.8284 16.1716C18.0783 15.4214 17.0609 15 16 15H8C6.93913 15 5.92172 15.4214 5.17157 16.1716C4.42143 16.9217 4 17.9391 4 19V21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 11C14.2091 11 16 9.20914 16 7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7C8 9.20914 9.79086 11 12 11Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

interface WelcomeModalProps {
  open: boolean
  onClose: () => void
  onCreatorSelect?: () => void
}

export function WelcomeModal({ open, onClose, onCreatorSelect }: WelcomeModalProps) {
  const router = useRouter()
  const [hoveredCard, setHoveredCard] = useState<"creator" | "buyer" | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [selectedChoice, setSelectedChoice] = useState<"creator" | "buyer" | null>(null)

  const handleChoice = async (choice: "creator" | "buyer") => {
    // Store the choice in localStorage
    localStorage.setItem("storelib_user_type", choice)
    // For testing: comment out the line below to show modal every time
    // localStorage.setItem("storelib_welcome_shown", "true")

    // Show loading state
    setSelectedChoice(choice)
    setIsLoading(true)

    // Subtle delay for smooth transition
    await new Promise(resolve => setTimeout(resolve, 600))

    onClose()

    // Navigate based on choice
    if (choice === "creator") {
      // If creator selected, trigger the creator onboarding
      if (onCreatorSelect) {
        onCreatorSelect()
      } else {
        router.push("/app")
      }
    } else {
      router.push("/library")
    }
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className={cn(
          "p-0 gap-0 overflow-hidden border-0",
          // Desktop: centered modal with reduced height and 10% more width
          "sm:w-[640px] sm:max-w-[640px] sm:rounded-[40px]",
          // Mobile: responsive width and height
          "w-[calc(100%-32px)] max-w-none max-sm:rounded-[24px]",
          // Shadow
          "shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)]",
          // Hide the close button
          "[&>button]:hidden"
        )}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className={cn(
          "flex flex-col bg-white py-6 sm:py-8 px-5 sm:px-8 transition-opacity duration-300",
          isLoading && "opacity-50"
        )}>
          {/* Logo with smooth vibrating animation */}
          <div className="flex justify-center mb-4 sm:mb-5">
            <div className="relative flex items-center justify-center">
              {/* Smooth vibrating background animations - slower duration */}
              <div
                className="absolute inset-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-purple-400/20"
                style={{
                  animation: "ping 2s cubic-bezier(0, 0, 0.2, 1) infinite"
                }}
              />
              <div
                className="absolute inset-0 w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-purple-400/15"
                style={{
                  animation: "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite"
                }}
              />
              {/* Logo container */}
              <div className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-xl overflow-hidden shadow-lg bg-white flex items-center justify-center">
                <StorelibLogo className="w-full h-full" />
              </div>
            </div>
          </div>

          {/* Title & Subtext */}
          <div className="text-center mb-5 sm:mb-6">
            <h1 className="text-[24px] sm:text-[32px] font-bold leading-tight mb-1.5">
              Welcome
            </h1>
            <p className="text-gray-500 text-xs sm:text-sm">
              Choose how you want to use Storelib.
            </p>
          </div>

          {/* Cards */}
          <div className="flex flex-col sm:flex-row gap-3 mb-5 sm:mb-6">
            {/* Creator Card */}
            <div
              className={cn(
                "flex-1 p-4 sm:p-5 rounded-[16px] border-2 cursor-pointer transition-all duration-300 ease-out",
                hoveredCard === "creator"
                  ? "border-black bg-gray-50/80"
                  : "border-gray-200 bg-white hover:border-gray-300",
                isLoading && "pointer-events-none"
              )}
              onMouseEnter={() => setHoveredCard("creator")}
              onMouseLeave={() => setHoveredCard(null)}
              onClick={() => handleChoice("creator")}
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3 bg-gray-100 text-gray-600">
                <CoinIcon />
              </div>
              <h3 className="text-base font-semibold mb-0.5">I'm a creator</h3>
              <p className="text-gray-500 text-xs sm:text-sm mb-3">
                Create pages and sell products.
              </p>
              <button
                disabled={isLoading}
                className={cn(
                  "w-full py-2.5 rounded-full font-medium text-sm transition-all duration-300 ease-out active:scale-[0.98]",
                  hoveredCard === "creator"
                    ? "bg-purple-600 text-white hover:bg-purple-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                  isLoading && selectedChoice === "creator" && "bg-purple-600 text-white"
                )}
              >
                {isLoading && selectedChoice === "creator" ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </span>
                ) : (
                  "Continue"
                )}
              </button>
            </div>

            {/* Buyer Card */}
            <div
              className={cn(
                "flex-1 p-4 sm:p-5 rounded-[16px] border-2 cursor-pointer transition-all duration-300 ease-out",
                hoveredCard === "buyer"
                  ? "border-black bg-gray-50/80"
                  : "border-gray-200 bg-white hover:border-gray-300",
                isLoading && "pointer-events-none"
              )}
              onMouseEnter={() => setHoveredCard("buyer")}
              onMouseLeave={() => setHoveredCard(null)}
              onClick={() => handleChoice("buyer")}
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3 bg-gray-100 text-gray-600">
                <UserIcon />
              </div>
              <h3 className="text-base font-semibold mb-0.5">I'm a buyer</h3>
              <p className="text-gray-500 text-xs sm:text-sm mb-3">
                Explore and purchase from creators.
              </p>
              <button
                disabled={isLoading}
                className={cn(
                  "w-full py-2.5 rounded-full font-medium text-sm transition-all duration-300 ease-out active:scale-[0.98]",
                  hoveredCard === "buyer"
                    ? "bg-purple-600 text-white hover:bg-purple-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200",
                  isLoading && selectedChoice === "buyer" && "bg-purple-600 text-white"
                )}
              >
                {isLoading && selectedChoice === "buyer" ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </span>
                ) : (
                  "Continue"
                )}
              </button>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-gray-400 text-[11px] sm:text-xs">
            You can switch later.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// Hook to manage welcome modal state
export function useWelcomeModal() {
  const [showWelcome, setShowWelcome] = useState(false)
  const [isChecked, setIsChecked] = useState(false)

  useEffect(() => {
    // Check if welcome was already shown (from signup success page or previously)
    const welcomeShown = localStorage.getItem("storelib_welcome_shown")
    if (!welcomeShown) {
      // For testing: always show the modal when not shown before
      setShowWelcome(true)
    }

    setIsChecked(true)
  }, [])

  const closeWelcome = () => {
    setShowWelcome(false)
  }

  return { showWelcome, closeWelcome, isChecked }
}
