import { consentRequiredFor } from '@/lib/consent-region'

export const dynamic = 'force-dynamic'

/**
 * Tells the page whether this visitor must be asked before analytics cookies are set.
 * Returns only a yes/no: the country itself isn't stored or echoed back.
 */
export function GET(req: Request) {
  return Response.json(
    { required: consentRequiredFor(req.headers) },
    {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'x-vercel-ip-country, cf-ipcountry' },
    },
  )
}
