/**
 * Address suggestions from Google Places (Autocomplete, New) through the Maps JavaScript API.
 *
 * Nothing loads until someone types in an address field: the generator stays client-side and
 * fast, and no address is sent to Google unless the person is typing one. Without
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY the field is plain text.
 */

export const MAPS_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || ''

export type PlaceSuggestion = { placeId: string; main: string; secondary: string; text: string }

// The few parts of the Maps JavaScript API we use, typed by hand to avoid a dependency.
type FormattableText = { text: string }
type PlacePrediction = {
  placeId: string
  text: FormattableText
  mainText: FormattableText | null
  secondaryText: FormattableText | null
  toPlace(): { fetchFields(opts: { fields: string[] }): Promise<unknown> }
}
type PlacesLibrary = {
  AutocompleteSessionToken: new () => object
  AutocompleteSuggestion: {
    fetchAutocompleteSuggestions(request: {
      input: string
      sessionToken: object
      language?: string
    }): Promise<{ suggestions: { placePrediction: PlacePrediction | null }[] }>
  }
}
type MapsGlobal = { maps: { importLibrary(name: 'places'): Promise<PlacesLibrary> } }

let loading: Promise<PlacesLibrary> | null = null

function loadPlaces(): Promise<PlacesLibrary> {
  loading ??= new Promise<PlacesLibrary>((resolve, reject) => {
    const w = window as unknown as { google?: MapsGlobal; __qrfinityMapsReady?: () => void }
    const ready = () => w.google!.maps.importLibrary('places').then(resolve, reject)
    if (w.google?.maps?.importLibrary) return void ready()
    w.__qrfinityMapsReady = ready
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(MAPS_KEY)}&v=weekly&loading=async&callback=__qrfinityMapsReady`
    script.async = true
    script.onerror = () => reject(new Error('Google Maps could not load'))
    document.head.appendChild(script)
  }).catch((e) => {
    // Let a later keystroke try again (a flaky network shouldn't disable suggestions for good).
    loading = null
    throw e
  })
  return loading
}

/**
 * One autocomplete session: the suggestions fetched while someone types, ended by the place they
 * pick. Google bills a session as one place lookup when it ends with a pick, so each new search
 * starts a new session.
 */
export class PlacesSession {
  private token: object | null = null
  private predictions = new Map<string, PlacePrediction>()

  async suggest(input: string): Promise<PlaceSuggestion[]> {
    const places = await loadPlaces()
    this.token ??= new places.AutocompleteSessionToken()
    const { suggestions } = await places.AutocompleteSuggestion.fetchAutocompleteSuggestions({
      input,
      sessionToken: this.token,
      language: navigator.language,
    })
    const out: PlaceSuggestion[] = []
    for (const s of suggestions) {
      const p = s.placePrediction
      if (!p) continue
      this.predictions.set(p.placeId, p)
      out.push({
        placeId: p.placeId,
        main: p.mainText?.text ?? p.text.text,
        secondary: p.secondaryText?.text ?? '',
        text: p.text.text,
      })
    }
    return out
  }

  /** Ends the session with the picked place. Failure here doesn't matter to the person. */
  async pick(placeId: string) {
    const p = this.predictions.get(placeId)
    this.token = null
    this.predictions.clear()
    if (p)
      await p
        .toPlace()
        .fetchFields({ fields: ['formattedAddress'] })
        .catch(() => {})
  }
}
