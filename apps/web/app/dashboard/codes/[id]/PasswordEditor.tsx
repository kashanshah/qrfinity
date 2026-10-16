'use client'

import { PASSWORD_MAX, PASSWORD_MIN } from '@qrfinity/core'
import { Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { setPasswordAction } from '@/app/dashboard/actions'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { AdvancedSection, type AdvancedAccess } from '@/components/dashboard/Advanced'

/** Set, change or remove the password scans must enter (an advanced feature). */
export function PasswordEditor({
  id,
  hasPassword,
  canAdd,
  used,
  allowance,
  access,
  disabled,
}: {
  id: string
  access: AdvancedAccess
  hasPassword: boolean
  /** False when this code has no advanced features and the allowance is used up, or it's paused. */
  canAdd: boolean
  used: number
  allowance: number
  disabled: boolean
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, start] = useTransition()
  const locked = disabled || pending
  const formOpen = editing || !hasPassword

  const save = (next: string | null) =>
    start(async () => {
      setError(null)
      setMessage(null)
      const r = await setPasswordAction(id, next)
      if (!r.ok) setError(r.error)
      else {
        setPassword('')
        setEditing(false)
        setShow(false)
        setMessage(
          r.data
            ? 'Saved. Scans ask for the new password within a minute.'
            : 'Password removed. Scans open the code directly within a minute.',
        )
        router.refresh()
      }
    })

  const blocked = !hasPassword && !canAdd
  return (
    <AdvancedSection
      id="password"
      icon={LockKeyhole}
      title="Password protection"
      description="People who scan the code type a password before they see where it goes. It’s asked on every scan. We keep only a scrambled copy, so we can’t show it to you again: if you forget it, set a new one."
      access={access}
      used={used}
      allowance={allowance}
      blocked={blocked}
      what="protect this code too"
    >
      {hasPassword ? (
        <p role="status" className="rounded-md bg-mint px-4 py-3 text-ink">
          This code is protected. Scans ask for the password first.
        </p>
      ) : null}

      {formOpen ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            save(password)
          }}
        >
          <div className="max-w-[420px]">
            <TextField
              label={hasPassword ? 'New password' : 'Password'}
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              minLength={PASSWORD_MIN}
              maxLength={PASSWORD_MAX}
              value={password}
              disabled={locked}
              onChange={(e) => {
                setPassword(e.target.value)
                setError(null)
              }}
              hint={`${PASSWORD_MIN} to ${PASSWORD_MAX} characters. Share it only with the people who should get in.`}
              action={
                <Button
                  aria-pressed={show}
                  icon={
                    show ? (
                      <EyeOff aria-hidden="true" size={18} strokeWidth={1.75} />
                    ) : (
                      <Eye aria-hidden="true" size={18} strokeWidth={1.75} />
                    )
                  }
                  onClick={() => setShow((s) => !s)}
                >
                  {show ? 'Hide' : 'Show'}
                </Button>
              }
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              variant="primary"
              disabled={locked || password.length < PASSWORD_MIN}
            >
              {pending ? 'Saving…' : hasPassword ? 'Save new password' : 'Protect this code'}
            </Button>
            {hasPassword ? (
              <Button
                disabled={pending}
                onClick={() => {
                  setEditing(false)
                  setPassword('')
                  setError(null)
                }}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            disabled={locked}
            onClick={() => {
              setEditing(true)
              setMessage(null)
            }}
          >
            Change password
          </Button>
          <Button disabled={locked} onClick={() => save(null)}>
            {pending ? 'Removing…' : 'Remove password'}
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="text-ink">
          <span
            aria-hidden="true"
            className="mr-2 inline-block size-2 rounded-full bg-scan-fail align-middle"
          />
          {error}
        </p>
      ) : message ? (
        <p role="status" className="body-small text-ink-muted">
          {message}
        </p>
      ) : null}
    </AdvancedSection>
  )
}
