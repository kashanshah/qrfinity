/** Origin used for dynamic short links (https://qrfinity.link, or the local Worker in development). */
export function shortLinkBase(): string {
  return (
    process.env.SHORT_LINK_ORIGIN?.trim() ||
    `https://${process.env.SHORT_DOMAIN?.trim() || 'qrfinity.link'}`
  )
}

export function shortLinkFor(slug: string): string {
  return `${shortLinkBase()}/${slug}`
}
