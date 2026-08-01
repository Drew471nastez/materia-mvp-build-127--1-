// Reserved words that cannot be used as usernames/slugs
export const RESERVED_WORDS = [
  // Brand names
  "materia",
  "materiaio",
  "materia-io",

  // Common reserved paths
  "www",
  "admin",
  "api",
  "app",
  "dashboard",
  "login",
  "signup",
  "sign-up",
  "signin",
  "sign-in",
  "logout",
  "register",
  "auth",
  "oauth",

  // Route paths
  "u",
  "p",
  "c",
  "explore",
  "settings",
  // Marketplace routes. A username matching one of these would sit behind a
  // static route it can never win against, leaving that seller's storefront
  // permanently unreachable.
  "profile",
  "member",
  "messages",
  "purchases",
  "sales",
  "products",
  "courses",
  "community",
  "orders",
  "analytics",
  "checkout",
  "onboarding",
  "terms",
  "privacy",
  "help",
  "support",
  "about",
  "contact",
  "blog",
  "pricing",

  // Technical
  "null",
  "undefined",
  "true",
  "false",
  "test",
  "demo",
  "example",
  "static",
  "public",
  "private",
  "assets",
  "images",
  "files",
  "uploads",
  "_next",
  "favicon",
  "robots",
  "sitemap",
]

export function isReservedWord(word: string): boolean {
  return RESERVED_WORDS.includes(word.toLowerCase())
}

export function isValidUsername(username: string): { valid: boolean; error?: string } {
  // Must be at least 3 characters
  if (username.length < 3) {
    return { valid: false, error: "Username must be at least 3 characters" }
  }

  // Must be at most 30 characters
  if (username.length > 30) {
    return { valid: false, error: "Username must be at most 30 characters" }
  }

  // Must only contain lowercase letters, numbers, and dashes
  if (!/^[a-z0-9-]+$/.test(username)) {
    return { valid: false, error: "Username can only contain lowercase letters, numbers, and dashes" }
  }

  // Cannot start or end with a dash
  if (username.startsWith("-") || username.endsWith("-")) {
    return { valid: false, error: "Username cannot start or end with a dash" }
  }

  // Cannot have consecutive dashes
  if (username.includes("--")) {
    return { valid: false, error: "Username cannot have consecutive dashes" }
  }

  // Cannot be a reserved word
  if (isReservedWord(username)) {
    return { valid: false, error: "This username is not available" }
  }

  return { valid: true }
}
