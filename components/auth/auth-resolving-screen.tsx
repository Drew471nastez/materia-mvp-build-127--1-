/**
 * Full-screen loading spinner shown while auth state is resolving.
 *
 * Used across login, signup, protected layouts, and the native auth gate
 * to guarantee users never see a stale form or flash of wrong content
 * while a session check or OAuth callback is in progress.
 */
export function AuthResolvingScreen({ message }: { message?: string }) {
  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-white">
      <div className="text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-neutral-200 border-t-neutral-900 mx-auto" />
        {message && <p className="mt-4 text-neutral-500">{message}</p>}
      </div>
    </div>
  )
}
