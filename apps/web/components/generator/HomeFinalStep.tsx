'use client'

import { ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { track } from '@/lib/analytics'
import { saveDraft } from '@/lib/draft'
import { useViewerPlan } from '@/lib/plan-client'
import { Button } from '../ui/Button'
import { ExportPanel } from './ExportPanel'
import type { FinalStepProps } from './Generator'

/** Homepage last step: download a static code, or carry a dynamic one to a free account. */
export function HomeFinalStep({
  kind,
  type,
  fields,
  design,
  content,
  job,
  scanFailed,
}: FinalStepProps) {
  const router = useRouter()
  const viewer = useViewerPlan()
  if (kind === 'static') {
    return (
      <div className="rounded-lg border border-hairline bg-surface p-4 shadow-card md:p-6">
        <h2 className="subheading mb-4 text-ink">3. Download</h2>
        <ExportPanel job={job} scanFailed={scanFailed} />
      </div>
    )
  }
  return (
    <div className="rounded-lg border border-hairline bg-surface p-4 shadow-card md:p-6">
      <h2 className="subheading mb-2 text-ink">3. Save your dynamic code</h2>
      <p className="body-small mb-4 text-ink-muted">
        Dynamic codes need a free account, so only you can change where they go. No credit card, no
        trial: the code keeps working forever.
      </p>
      <Button
        variant="primary"
        className="w-full"
        disabled={!content.ok}
        icon={<ArrowRight aria-hidden="true" size={18} strokeWidth={1.75} />}
        onClick={() => {
          saveDraft({ kind, type, fields, design })
          track('dynamic_continue', { content_type: type, signed_in: Boolean(viewer?.signedIn) })
          router.push('/dashboard/new')
        }}
      >
        Continue with a free account
      </Button>
      {!content.ok ? (
        <p className="body-small mt-2 text-ink-muted">Add the destination first.</p>
      ) : null}
    </div>
  )
}
