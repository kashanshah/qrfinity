'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { SelectField, TextField } from '@/components/ui/Field'
import { addBlockAction } from '../actions'

export function AddBlockForm() {
  const [kind, setKind] = useState<'domain' | 'tld' | 'contains'>('domain')
  const [value, setValue] = useState('')
  const [reason, setReason] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <form
      className="grid items-end gap-3 rounded-lg border border-hairline bg-surface p-4 md:grid-cols-[200px_1fr_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault()
        start(async () => {
          const r = await addBlockAction(kind, value, reason)
          if (r.ok) {
            setValue('')
            setReason('')
            setMessage('Added.')
          } else setMessage(r.error)
        })
      }}
    >
      <SelectField
        label="Type"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'domain', label: 'Domain' },
          { value: 'tld', label: 'Top-level domain' },
          { value: 'contains', label: 'Address contains' },
        ]}
      />
      <TextField
        label="Value"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={kind === 'tld' ? 'zip' : kind === 'domain' ? 'scam.example' : '/wp-login.php'}
      />
      <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      <Button type="submit" variant="primary" disabled={pending || !value.trim()}>
        Add
      </Button>
      {message ? <p className="body-small text-ink-muted md:col-span-4">{message}</p> : null}
    </form>
  )
}
