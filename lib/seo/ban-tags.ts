/**
 * The tags a ban's and a spam verdict's held answers carry (lib/seo/bans.ts),
 * so a ban, its lifting or a deleted account expires them at once
 * (lib/delivery/public-pages-purge) rather than after their minute. Pure.
 */
export const creatorBanTag = (creatorId: string) => `creator-banned:${creatorId}`
export const spamStateTag = (userId: string) => `profile-spam-state:${userId}`
