import { isOpen, severityFor, totalPatients, touchesStock, worst } from './model.ts'
import type { Constraint, Decision, Severity, Status } from './model.ts'

export type QueueRow = {
  id: string
  rank: number | null
  drug: string
  form: string
  hours: number
  severity: Severity
  campus: string
  patients: number
  kind: string
  move: string
  owner: string
  status: Status
  mark: 'Revised' | 'Noted' | null
}

function byUrgency(a: Constraint, b: Constraint): number {
  const hours = worst(a).hours - worst(b).hours
  if (hours !== 0) return hours
  return b.lockedPatients - a.lockedPatients
}

export function markFor(id: string, decisions: Decision[]): 'Revised' | 'Noted' | null {
  const related = decisions.filter(
    (decision) =>
      !decision.locked && (decision.drugId === id || decision.effect?.cross?.drugId === id),
  )
  if (related.some((decision) => touchesStock(decision) || decision.effect?.status === 'reviewed')) {
    return 'Revised'
  }
  if (related.length > 0) return 'Noted'
  return null
}

export function toQueueRows(list: Constraint[], decisions: Decision[]): QueueRow[] {
  const ranked = list.filter(isOpen).sort(byUrgency)
  const rank = new Map(ranked.map((drug, index) => [drug.id, index + 1]))
  return list.map((drug) => {
    const node = worst(drug)
    return {
      id: drug.id,
      rank: rank.get(drug.id) ?? null,
      drug: drug.drug,
      form: drug.form,
      hours: node.hours,
      severity: severityFor(node.hours),
      campus: node.campus.name,
      patients: totalPatients(drug),
      kind: drug.kindLabel,
      move: drug.move,
      owner: drug.owner,
      status: drug.status,
      mark: markFor(drug.id, decisions),
    }
  })
}
