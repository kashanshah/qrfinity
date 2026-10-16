export function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-hairline">
      <div className="body-small mx-auto flex max-w-[1200px] flex-col gap-2 px-4 py-8 text-ink-muted md:flex-row md:justify-between md:px-6">
        <p>QRfinity: free QR codes that never expire.</p>
        <p>© {new Date().getFullYear()} Teknoffice Technologies Inc.</p>
      </div>
    </footer>
  )
}
