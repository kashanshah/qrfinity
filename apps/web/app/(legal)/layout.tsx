export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-[720px] px-4 py-12 md:py-16">
      {children}
      <p className="body-small mt-12 border-t border-hairline pt-6 text-ink-muted">
        Questions? Email{' '}
        <a href="mailto:legal@qrfinity.com" className="text-evergreen underline">
          legal@qrfinity.com
        </a>
        . Teknoffice Technologies Inc., Ontario, Canada.
      </p>
    </article>
  )
}
