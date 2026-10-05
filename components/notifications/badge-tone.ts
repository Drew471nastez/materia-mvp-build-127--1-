/**
 * ===========================================================================
 *  THE NOTIFICATION BUBBLE IS RED
 * ===========================================================================
 * Round 12, reversing round 8: "the notification bubble is RED again
 * (Storelib red, white text) everywhere". Round 8 had made it ink to match the
 * wishlist heart's count; a count of things waiting for you is the one place
 * red belongs, so the bell (Storelib's header and a community's bar) and a
 * community's Messages carry this bubble, the same red the dashboard's own
 * notifications badge has always had (components/app/notifications-modal.tsx,
 * Tailwind red-500), white figures, round, on light and dark bars alike.
 *
 * The wishlist heart's count is not news and stays ink (components/platform/
 * platform-header-client.tsx COUNT_BADGE_TONE).
 */
export const NOTIFICATION_BADGE = "rounded-full bg-[#ef4444] text-white shadow-[0_1px_2px_rgba(185,28,28,0.28)]"
