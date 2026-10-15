'use client'

import { useState } from 'react'
import { useGenerator } from '@/lib/generator-context'
import { saveTemplates, useTemplates, type Template } from '@/lib/templates'
import { Button } from '../ui/Button'
import { TextField } from '../ui/Field'

export function Templates() {
  const design = useGenerator((s) => s.design)
  const replaceDesign = useGenerator((s) => s.replaceDesign)
  const templates = useTemplates()
  const [name, setName] = useState('')
  const [message, setMessage] = useState<string | null>(null)

  function persist(next: Template[], success: string) {
    if (saveTemplates(next)) {
      setMessage(success)
    } else {
      setMessage(
        'This browser would not save it. Private windows and full storage block saving; try a smaller logo.',
      )
    }
  }

  function save() {
    const label = name.trim() || `Design ${templates.length + 1}`
    const t: Template = { id: crypto.randomUUID(), name: label, design, savedAt: Date.now() }
    persist([t, ...templates].slice(0, 20), `Saved “${label}”.`)
    setName('')
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="body-small text-ink-muted">
        Saved in this browser only. Accounts will keep them across devices.
      </p>
      <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto]">
        <TextField
          label="Name"
          value={name}
          maxLength={40}
          placeholder="Café menu"
          onChange={(e) => setName(e.target.value)}
        />
        <Button variant="primary" onClick={save}>
          Save this design
        </Button>
      </div>
      <p className="body-small text-ink-muted" aria-live="polite">
        {message}
      </p>
      {templates.length ? (
        <ul className="flex flex-col divide-y divide-hairline rounded-lg border border-hairline">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <span className="text-ink">{t.name}</span>
              <span className="flex gap-2">
                <Button
                  onClick={() => {
                    replaceDesign(t.design)
                    setMessage(`Applied “${t.name}”.`)
                  }}
                >
                  Use
                </Button>
                <Button
                  onClick={() =>
                    persist(
                      templates.filter((x) => x.id !== t.id),
                      `Deleted “${t.name}”.`,
                    )
                  }
                  aria-label={`Delete ${t.name}`}
                >
                  Delete
                </Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
