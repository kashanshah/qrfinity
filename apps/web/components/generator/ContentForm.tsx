'use client'

import {
  SOCIAL_PLATFORMS,
  type ContentFields,
  type ContentType,
  type EncodeResult,
  type SocialPlatform,
} from '@qrfinity/core'
import {
  AppWindow,
  CalendarDays,
  Contact,
  Link2,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Phone,
  Share2,
  Type,
  Wifi,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useGenerator } from '@/lib/generator-context'
import { Checkbox, SelectField, TextArea, TextField } from '../ui/Field'
import { OptionGroup } from '../ui/OptionGroup'

const icon = (I: typeof Link2) => <I aria-hidden="true" size={20} strokeWidth={1.75} />

export const CONTENT_TYPE_OPTIONS: ReadonlyArray<{
  value: ContentType
  label: string
  icon: ReactNode
}> = [
  { value: 'url', label: 'Link', icon: icon(Link2) },
  { value: 'text', label: 'Text', icon: icon(Type) },
  { value: 'wifi', label: 'Wi-Fi', icon: icon(Wifi) },
  { value: 'vcard', label: 'Contact', icon: icon(Contact) },
  { value: 'email', label: 'Email', icon: icon(Mail) },
  { value: 'sms', label: 'SMS', icon: icon(MessageSquareText) },
  { value: 'phone', label: 'Phone', icon: icon(Phone) },
  { value: 'whatsapp', label: 'WhatsApp', icon: icon(MessageCircle) },
  { value: 'location', label: 'Location', icon: icon(MapPin) },
  { value: 'event', label: 'Event', icon: icon(CalendarDays) },
  { value: 'app', label: 'App store', icon: icon(AppWindow) },
  { value: 'social', label: 'Social', icon: icon(Share2) },
]

const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  x: 'X (Twitter)',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  threads: 'Threads',
  pinterest: 'Pinterest',
}

/** Errors show once a field has been left, so nobody is told off mid-typing. */
function useTouched() {
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  return {
    touched,
    blur: (name: string) => () => setTouched((t) => (t[name] ? t : { ...t, [name]: true })),
  }
}

export function ContentForm({ result }: { result: EncodeResult }) {
  const type = useGenerator((s) => s.type)
  const kind = useGenerator((s) => s.kind)
  const fields = useGenerator((s) => s.fields)
  const setFields = useGenerator((s) => s.setFields)
  const { touched, blur } = useTouched()
  const errors = result.ok ? {} : result.errors
  const err = (name: string) => (touched[name] ? errors[name] : undefined)

  function bind<K extends ContentType>(t: K, name: keyof ContentFields[K] & string) {
    return {
      value: String(fields[t][name] ?? ''),
      onChange: (e: { target: { value: string } }) =>
        setFields(t, { [name]: e.target.value } as Partial<ContentFields[K]>),
      onBlur: blur(name),
      error: err(name),
    }
  }

  switch (type) {
    case 'url':
      return (
        <TextField
          label="Website address"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="example.com/menu"
          hint={
            kind === 'static'
              ? 'The address goes straight into the code. No redirect, no tracking.'
              : 'Scans go here. You can change it any time without reprinting.'
          }
          {...bind('url', 'url')}
        />
      )
    case 'text':
      return (
        <TextArea
          label="Text"
          maxLength={1500}
          hint="Shown as plain text when scanned."
          {...bind('text', 'text')}
        />
      )
    case 'wifi': {
      const f = fields.wifi
      return (
        <div className="grid gap-4">
          <TextField label="Network name (SSID)" autoComplete="off" {...bind('wifi', 'ssid')} />
          <SelectField
            label="Security"
            value={f.encryption}
            onChange={(encryption) => setFields('wifi', { encryption })}
            options={[
              { value: 'WPA', label: 'WPA / WPA2 / WPA3' },
              { value: 'WEP', label: 'WEP (older routers)' },
              { value: 'nopass', label: 'No password' },
            ]}
          />
          {f.encryption !== 'nopass' ? (
            <TextField
              label="Password"
              autoComplete="off"
              spellCheck={false}
              {...bind('wifi', 'password')}
            />
          ) : null}
          <Checkbox
            label="Hidden network"
            checked={f.hidden}
            onChange={(hidden) => setFields('wifi', { hidden })}
          />
          <p className="body-small text-ink-muted">
            The password is stored inside the code, so anyone who scans it can join.
          </p>
        </div>
      )
    }
    case 'vcard':
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="First name" autoComplete="given-name" {...bind('vcard', 'firstName')} />
          <TextField label="Last name" autoComplete="family-name" {...bind('vcard', 'lastName')} />
          <TextField
            label="Company"
            autoComplete="organization"
            {...bind('vcard', 'organization')}
          />
          <TextField
            label="Job title"
            autoComplete="organization-title"
            {...bind('vcard', 'title')}
          />
          <TextField label="Mobile" type="tel" autoComplete="tel" {...bind('vcard', 'mobile')} />
          <TextField label="Work phone" type="tel" {...bind('vcard', 'workPhone')} />
          <TextField label="Email" type="email" autoComplete="email" {...bind('vcard', 'email')} />
          <TextField label="Website" type="url" inputMode="url" {...bind('vcard', 'website')} />
          <div className="sm:col-span-2">
            <TextField label="Street" autoComplete="street-address" {...bind('vcard', 'street')} />
          </div>
          <TextField label="City" autoComplete="address-level2" {...bind('vcard', 'city')} />
          <TextField
            label="Province or state"
            autoComplete="address-level1"
            {...bind('vcard', 'region')}
          />
          <TextField
            label="Postal code"
            autoComplete="postal-code"
            {...bind('vcard', 'postalCode')}
          />
          <TextField label="Country" autoComplete="country-name" {...bind('vcard', 'country')} />
          <div className="sm:col-span-2">
            <TextArea label="Note" rows={2} {...bind('vcard', 'note')} />
          </div>
          <p className="body-small text-ink-muted sm:col-span-2">
            Every detail is stored in the code, so more details make a denser code. Fill in only
            what people need.
          </p>
        </div>
      )
    case 'email':
      return (
        <div className="grid gap-4">
          <TextField label="Send to" type="email" autoComplete="email" {...bind('email', 'to')} />
          <TextField label="Subject" {...bind('email', 'subject')} />
          <TextArea label="Message" rows={3} {...bind('email', 'body')} />
        </div>
      )
    case 'sms':
      return (
        <div className="grid gap-4">
          <TextField
            label="Phone number"
            type="tel"
            placeholder="+1 555 123 4567"
            {...bind('sms', 'phone')}
          />
          <TextArea
            label="Message"
            rows={3}
            hint="The phone opens a new text with this message ready to send."
            {...bind('sms', 'message')}
          />
        </div>
      )
    case 'phone':
      return (
        <TextField
          label="Phone number"
          type="tel"
          placeholder="+1 555 123 4567"
          hint="Include the country code if people may call from abroad."
          {...bind('phone', 'phone')}
        />
      )
    case 'whatsapp':
      return (
        <div className="grid gap-4">
          <TextField
            label="WhatsApp number"
            type="tel"
            placeholder="+1 555 123 4567"
            hint="With country code."
            {...bind('whatsapp', 'phone')}
          />
          <TextArea label="Message (optional)" rows={3} {...bind('whatsapp', 'message')} />
        </div>
      )
    case 'location': {
      const f = fields.location
      return (
        <div className="grid gap-4">
          <OptionGroup
            label="Find the place by"
            value={f.mode}
            onChange={(mode) => setFields('location', { mode })}
            columns="grid-cols-2"
            options={[
              { value: 'address', label: 'Address' },
              { value: 'coordinates', label: 'Coordinates' },
            ]}
          />
          {f.mode === 'address' ? (
            <TextField
              label="Address or place name"
              autoComplete="street-address"
              {...bind('location', 'address')}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Latitude"
                inputMode="decimal"
                placeholder="43.6532"
                {...bind('location', 'latitude')}
              />
              <TextField
                label="Longitude"
                inputMode="decimal"
                placeholder="-79.3832"
                {...bind('location', 'longitude')}
              />
            </div>
          )}
          <p className="body-small text-ink-muted">
            Opens the place in Google Maps, which works on iPhone and Android.
          </p>
        </div>
      )
    }
    case 'event': {
      const f = fields.event
      const inputType = f.allDay ? 'date' : 'datetime-local'
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <TextField label="Event name" {...bind('event', 'title')} />
          </div>
          <div className="sm:col-span-2">
            <Checkbox
              label="All day"
              checked={f.allDay}
              onChange={(allDay) =>
                setFields('event', {
                  allDay,
                  start: f.start.slice(0, allDay ? 10 : 16),
                  end: f.end.slice(0, allDay ? 10 : 16),
                })
              }
            />
          </div>
          <TextField label="Starts" type={inputType} {...bind('event', 'start')} />
          <TextField label="Ends" type={inputType} {...bind('event', 'end')} />
          <div className="sm:col-span-2">
            <TextField label="Location" {...bind('event', 'location')} />
          </div>
          <div className="sm:col-span-2">
            <TextArea label="Details" rows={2} {...bind('event', 'description')} />
          </div>
          <p className="body-small text-ink-muted sm:col-span-2">
            Times are local to wherever the event happens.
          </p>
        </div>
      )
    }
    case 'app': {
      const f = fields.app
      return (
        <div className="grid gap-4">
          <OptionGroup
            label="Store"
            value={f.store}
            onChange={(store) => setFields('app', { store })}
            columns="grid-cols-2"
            options={[
              { value: 'ios', label: 'App Store (iPhone)' },
              { value: 'android', label: 'Google Play (Android)' },
            ]}
          />
          <TextField
            label="App link"
            type="url"
            inputMode="url"
            placeholder={
              f.store === 'ios' ? 'apps.apple.com/app/…' : 'play.google.com/store/apps/details?id=…'
            }
            {...bind('app', 'url')}
          />
          <p className="body-small text-ink-muted">
            One code holds one store link. Make one code per store, or link to a page that lists
            both.
          </p>
        </div>
      )
    }
    case 'social': {
      const f = fields.social
      return (
        <div className="grid gap-4">
          <SelectField
            label="Platform"
            value={f.platform}
            onChange={(platform) => setFields('social', { platform })}
            options={SOCIAL_PLATFORMS.map((p) => ({ value: p, label: SOCIAL_LABELS[p] }))}
          />
          <TextField
            label="Username or profile link"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="@yourname"
            {...bind('social', 'handle')}
          />
        </div>
      )
    }
  }
}
