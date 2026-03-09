// Re-export proxy.ts as the Next.js middleware entry point.
// proxy.ts was previously orphaned because middleware.ts was deleted.
export { proxy as default, config } from "./proxy"
