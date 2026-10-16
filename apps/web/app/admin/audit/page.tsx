import { listAudit } from '@/lib/server/admin'
import { adminContext } from '@/lib/server/context'

const fmt = new Intl.DateTimeFormat('en-CA', { dateStyle: 'medium', timeStyle: 'medium' })

export default async function AdminAudit() {
  const { db } = await adminContext()
  const rows = await listAudit(db)
  return (
    <div className="flex flex-col gap-6">
      <h1 className="heading text-ink">Audit log</h1>
      <div className="overflow-x-auto rounded-lg border border-hairline bg-surface">
        <table className="body-small w-full text-left">
          <thead className="text-ink-muted">
            <tr>
              <th className="px-4 py-2 font-normal">When</th>
              <th className="px-4 py-2 font-normal">Who</th>
              <th className="px-4 py-2 font-normal">Action</th>
              <th className="px-4 py-2 font-normal">Target</th>
              <th className="px-4 py-2 font-normal">Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-hairline align-top text-ink">
                <td className="whitespace-nowrap px-4 py-2">{fmt.format(r.createdAt)}</td>
                <td className="mono px-4 py-2">{r.actor}</td>
                <td className="px-4 py-2">{r.action}</td>
                <td className="mono px-4 py-2">
                  {r.targetType}:{r.targetId}
                </td>
                <td className="mono max-w-[40ch] break-all px-4 py-2 text-ink-muted">
                  {r.details ? JSON.stringify(r.details) : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
