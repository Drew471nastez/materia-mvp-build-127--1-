export const metadata = {
  title: "Privacy Policy | Materia",
  description: "Privacy Policy for Materia",
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">Privacy Policy</h1>
      <p className="mt-2 text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>

      <div className="mt-8 space-y-8 text-muted-foreground">
        <section>
          <h2 className="mb-3 text-lg font-medium text-foreground">1. Information We Collect</h2>
          <p>
            We collect information you provide directly to us, such as when you create an account, make a purchase, or
            contact us for support. This includes your name, email address, and payment information.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium text-foreground">2. How We Use Your Information</h2>
          <p>
            We use the information we collect to provide, maintain, and improve our services, process transactions, send
            you technical notices and support messages, and respond to your comments and questions.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium text-foreground">3. Information Sharing</h2>
          <p>
            We do not share your personal information with third parties except as described in this policy. We may
            share information with vendors and service providers who need access to such information to carry out work
            on our behalf.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium text-foreground">4. Data Security</h2>
          <p>
            We take reasonable measures to help protect information about you from loss, theft, misuse, unauthorized
            access, disclosure, alteration, and destruction.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium text-foreground">5. Cookies</h2>
          <p>
            We use cookies and similar technologies to collect information about your browsing activities and to
            personalize your experience on our platform.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium text-foreground">6. Your Rights</h2>
          <p>
            You have the right to access, correct, or delete your personal information. You can manage your account
            settings or contact us to exercise these rights.
          </p>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-medium text-foreground">7. Contact</h2>
          <p>
            For any questions about this Privacy Policy, please contact us at{" "}
            <a href="mailto:privacy@materia.io" className="text-foreground underline underline-offset-4">
              privacy@materia.io
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  )
}
