/**
 * The AI source bank (round AZ): real websites from the Storelib admin's library, snapshotted with nothing of
 * their account's business left in them, as the agent's starting sites and worked examples. Browser safe; the
 * database half is ./store.ts (server only), the agent's library is lib/ai-builder/agent/bank-templates.ts.
 */
export * from "./snapshot"
export * from "./fit"
export * from "./upload"
