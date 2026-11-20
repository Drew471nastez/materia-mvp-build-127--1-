/** What the setup screens and the buyer's buttons are sent. Browser safe. */

export type GrantStatus = "needs_link" | "invited" | "pending" | "granted" | "revoked" | "failed" | "blocked"

export interface MemberAccessRow {
  grantId: string
  buyer: string
  productTitle: string
  /** The role or chat name. */
  target: string
  /** The Discord or Telegram name the buyer joined as. */
  handle: string | null
  want: "in" | "out"
  status: GrantStatus
  lastError: string | null
  updatedAt: string
}

export interface PickProduct {
  id: string
  title: string
  type: string | null
}

export interface DiscordRoleView {
  id: string
  name: string
  /** Why the bot cannot give it, in words, or null. */
  problem: string | null
}

export interface DiscordSetupView {
  available: boolean
  /** SQL part 473 has run. */
  ready: boolean
  connection: { guildId: string; guildName: string; status: string; lastError: string | null } | null
  /** Read live from Discord; null when Discord did not answer. */
  roles: DiscordRoleView[] | null
  mappings: Array<{ id: string; productId: string; productTitle: string; roleId: string; roleName: string; problem: string | null }>
  products: PickProduct[]
  members: MemberAccessRow[]
}

export interface TelegramSetupView {
  available: boolean
  /** SQL part 474 has run. */
  ready: boolean
  botUsername: string | null
  chats: Array<{ id: string; title: string; type: string; status: string; lastError: string | null }>
  mappings: Array<{ id: string; productId: string; productTitle: string; chatRef: string; chatTitle: string }>
  products: PickProduct[]
  members: MemberAccessRow[]
}

export interface CommunityRolesStatus {
  discord: { available: boolean; connected: boolean; attention: boolean }
  telegram: { available: boolean; connected: boolean; attention: boolean }
}

/** One Join button for a buyer. */
export interface JoinOption {
  provider: "discord" | "telegram"
  productId: string
  /** The server or chat's name. */
  name: string
  /** join: press to join; joined: already in (press to open again); sign_in: sign in first. */
  state: "join" | "joined" | "sign_in"
  href: string
}
