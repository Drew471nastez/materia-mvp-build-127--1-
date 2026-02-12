export const metadata = {
  title: "Terms of Service",
  description: "Terms of Service for Storelib",
}

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Terms of Service</h1>
      <p className="mt-2 text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

      <div className="mt-8 space-y-8 text-muted-foreground">
        <section>
          <h2 className="mb-3 text-lg font-medium text-foreground">1. Acceptance of Terms</h2>
          <p>
            By accessing or using Storelib, you agree to be bound by these Terms of Service and all applicable laws and
            regulations. If you do not agree with any of these terms, you are prohibited from using this service.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium text-foreground">2. Use License</h2>
          <p>
            Permission is granted to temporarily access Storelib for personal, non-commercial transitory viewing only.
            This is the grant of a license, not a transfer of title.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium text-foreground">3. Creator Responsibilities</h2>
          <p>
            As a creator on Storelib, you are responsible for the content you publish and sell. You must have the rights
            to all content you distribute and must comply with all applicable laws regarding digital commerce.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium text-foreground">4. Buyer Rights</h2>
          <p>
            When you purchase a product on Storelib, you receive a license to access and use that product according to
            the terms set by the creator. Refund policies are determined by individual creators.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium text-foreground">5. Payment Processing</h2>
          <p>
            All payments are processed securely through Stripe. Storelib does not store your payment information. By
            making a purchase, you agree to Stripe&apos;s terms of service.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium text-foreground">6. Limitation of Liability</h2>
          <p>
            Storelib shall not be liable for any indirect, incidental, special, consequential, or punitive damages
            resulting from your use of the service.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium text-foreground">7. Contact</h2>
          <p>
            For any questions about these Terms of Service, please contact us at{" "}
            <a href="mailto:legal@materia.io" className="text-foreground underline underline-offset-4">
              legal@materia.io
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  )
}
