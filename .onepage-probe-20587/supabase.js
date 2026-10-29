const result = { data: Object.assign([], { onboarding_completed: true }), error: null }
/* A harness that sets globalThis.PROBE_EMPTY_READS gets nothing back instead (the onboarding: every name is free). */
const nothing = { data: null, error: null }
const q = new Proxy(function () {}, { get: (_, k) => k === "then" ? (r) => r(globalThis.PROBE_EMPTY_READS ? nothing : result) : q, apply: () => q })
/* A probe that names a catalogue (window.PROBE_PRODUCTS) gets it back from a read of products, the read lib/onepage/live-products makes. */
const rows = (list) => { const r = { data: list, error: null }; const p = new Proxy(function () {}, { get: (_, k) => k === "then" ? (res) => res(r) : p, apply: () => p }); return p }
export function createClient() { return { auth: { getUser: async () => ({ data: { user: { id: "probe-user" } } }), getSession: async () => ({ data: { session: null } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) }, from: (table) => (table === "products" && Array.isArray(globalThis.PROBE_PRODUCTS) ? rows(globalThis.PROBE_PRODUCTS) : q), storage: { from: () => q }, channel: () => ({ on() { return this }, subscribe() { return this } }), removeChannel() {} } }
