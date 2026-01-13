import Link from "next/link"

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/40 bg-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-12">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="flex flex-col gap-4">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-lg font-semibold tracking-tight">Materia</span>
            </Link>
            <p className="text-sm text-muted-foreground">
              The all-in-one platform for creators to sell digital products, courses, and communities.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-medium">Product</h4>
            <Link href="/explore" className="text-sm text-muted-foreground hover:text-foreground">
              Explore
            </Link>
            <Link href="/signup" className="text-sm text-muted-foreground hover:text-foreground">
              Start selling
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-medium">Legal</h4>
            <Link href="/legal/terms" className="text-sm text-muted-foreground hover:text-foreground">
              Terms of Service
            </Link>
            <Link href="/legal/privacy" className="text-sm text-muted-foreground hover:text-foreground">
              Privacy Policy
            </Link>
          </div>
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-medium">Support</h4>
            <Link href="mailto:support@materia.io" className="text-sm text-muted-foreground hover:text-foreground">
              Contact us
            </Link>
          </div>
        </div>
        <div className="mt-12 border-t border-border/40 pt-8">
          <p className="text-center text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} Materia. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
