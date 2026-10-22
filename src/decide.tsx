import { useEffect, useRef, useState } from 'react'
import {
  effectFor,
  formatHours,
  maxQtySafe,
  minQtyToFloor,
  preview,
  severityFor,
} from './model.ts'
import type { Action, Constraint, Decision } from './model.ts'

function toneOf(headline: string): 'bad' | 'good' | 'neutral' {
  if (headline.startsWith('Breaks') || headline.startsWith('Still')) return 'bad'
  if (headline.startsWith('Clears') || headline.startsWith('Cover extends')) return 'good'
  return 'neutral'
}

function detailLine(rows: { name: string; before: number; after: number }[], cross: { name: string; before: number; after: number } | null): string {
  const parts = rows
    .filter((row) => row.before !== row.after)
    .map((row) => `${row.name} ${formatHours(row.before)} → ${formatHours(row.after)}`)
  if (cross && cross.before !== cross.after) {
    parts.push(`${cross.name} ${formatHours(cross.before)} → ${formatHours(cross.after)}`)
  }
  return parts.length > 0 ? parts.join(' · ') : 'No cover change.'
}

export function Decide({
  drugs,
  drug,
  stamp,
  onQueue,
  onBack,
  onOpenDrug,
  onCommit,
}: {
  drugs: Constraint[]
  drug: Constraint
  stamp: string
  onQueue: () => void
  onBack: () => void
  onOpenDrug: (id: string) => void
  onCommit: (decision: Decision) => void
}) {
  const recommended = drug.actions.find((action) => action.id === drug.recommendedActionId) ?? drug.actions[0]
  const [actionId, setActionId] = useState(recommended.id)
  const [qty, setQty] = useState(recommended.qty ?? 1)
  const [reason, setReason] = useState('')
  const [invalid, setInvalid] = useState(false)
  const sent = useRef(false)
  const serial = useRef(0)
  const action = drug.actions.find((item) => item.id === actionId) ?? recommended
  const result = preview(drugs, action, action.kind === 'transfer' ? qty : (action.qty ?? 0))
  const ready = reason.trim().length >= 20
  const tone = toneOf(result.headline)
  const from = drug.campuses.find((campus) => campus.id === action.from)
  const to = drug.campuses.find((campus) => campus.id === action.to)
  const related = drugs.find((item) => item.id === result.relatedDrugId)

  const presets: { qty: number; label: string }[] = []
  if (action.kind === 'transfer' && from && to) {
    const floorQty = minQtyToFloor(drug, from.id, to.id)
    const safeQty = maxQtySafe(drug, from.id, to.id)
    const suggested = action.qty ?? floorQty
    if (floorQty > 0 && floorQty === suggested) presets.push({ qty: floorQty, label: 'Suggested · clears 12h' })
    else {
      if (floorQty > 0) presets.push({ qty: floorQty, label: 'Clears 12h' })
      if (suggested > 0) presets.push({ qty: suggested, label: 'Suggested' })
    }
    if (safeQty > 0 && !presets.some((item) => item.qty === safeQty)) {
      presets.push({ qty: safeQty, label: `Last safe · ${from.name}` })
    }
  }

  function select(next: Action) {
    setActionId(next.id)
    setQty(next.qty ?? 1)
    setInvalid(false)
  }

  function commit() {
    if (sent.current) return
    if (reason.trim().length < 20) {
      setInvalid(true)
      return
    }
    sent.current = true
    serial.current += 1
    const moved = action.kind === 'transfer' ? qty : (action.qty ?? 0)
    onCommit({
      id: `${drug.id}-${serial.current}`,
      drugId: drug.id,
      drug: drug.drug,
      at: stamp,
      author: 'Morning lead',
      actionLabel: action.kind === 'transfer' ? `${action.label} · ${qty} vials` : action.label,
      detail: detailLine(result.rows, result.cross),
      rationale: reason.trim(),
      effect: effectFor(action, moved),
    })
  }

  const commitRef = useRef<() => void>(() => {})

  useEffect(() => {
    commitRef.current = commit
  })

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault()
        commitRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="view">
      <div className="view-scroll">
        <p className="crumb">
          <button type="button" onClick={onQueue}>
            Queue
          </button>
          <span>/</span>
          <button type="button" onClick={onBack}>
            {drug.drug}
          </button>
          <span>/</span>
          <span>Move</span>
        </p>
        <h1 className="page-title">Shape the move</h1>
        <p className="question">{drug.question}</p>
        <div className="decide-grid">
          <div>
            <div className="k">Paths</div>
            <div className="strategies" role="radiogroup" aria-label="Moves">
              {drug.actions.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="radio"
                  aria-checked={item.id === action.id}
                  className="strategy"
                  onClick={() => select(item)}
                >
                  <span className="dot" aria-hidden="true" />
                  <span>
                    <span className="strategy-label">
                      {item.label}
                      {item.id === drug.recommendedActionId && <span className="tag">Suggested</span>}
                    </span>
                    <span className="strategy-sum">{item.summary}</span>
                  </span>
                </button>
              ))}
            </div>
            {action.patientsNote && <p className="note-line">{action.patientsNote}</p>}
            {action.kind === 'transfer' && from && to && (
              <div className="qty-block">
                <div className="presets">
                  {presets.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      className={qty === item.qty ? 'preset on' : 'preset'}
                      onClick={() => setQty(item.qty)}
                    >
                      <span className="mono">{item.qty}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
                <div className="stepper-row">
                  <div className="stepper">
                    <button type="button" aria-label="Fewer vials" onClick={() => setQty((value) => Math.max(1, value - 1))} disabled={qty <= 1}>
                      –
                    </button>
                    <input
                      aria-label="Vials to move"
                      inputMode="numeric"
                      value={qty}
                      onChange={(event) => {
                        const next = Number(event.target.value)
                        if (Number.isFinite(next)) setQty(Math.max(1, Math.min(from.vials, Math.round(next))))
                      }}
                    />
                    <button
                      type="button"
                      aria-label="More vials"
                      onClick={() => setQty((value) => Math.min(from.vials, value + 1))}
                      disabled={qty >= from.vials}
                    >
                      +
                    </button>
                  </div>
                  <span className="sub">
                    {from.vials} available at {from.name} · moving to {to.name}
                  </span>
                </div>
              </div>
            )}
            <div className={`banner ${tone}`} role="status">
              {result.headline}
            </div>
            <table className="delta">
              <thead>
                <tr>
                  <th>Campus</th>
                  <th className="num">Now</th>
                  <th />
                  <th className="num">After</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.key}>
                    <td>
                      <div>{row.name}</div>
                      <div className="sub">{row.meta}</div>
                    </td>
                    <td className={`num hrs ${severityFor(row.before)}`}>{formatHours(row.before)}</td>
                    <td className="arrow">→</td>
                    <td className={`num hrs ${severityFor(row.after)}`}>{formatHours(row.after)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.cross && (
              <div className="cross">
                <div className="k">Related drug</div>
                <div className="cross-row">
                  <div>
                    <div>{result.cross.name}</div>
                    <div className="sub">{result.cross.meta}</div>
                  </div>
                  <div className={`hrs ${severityFor(result.cross.before)}`}>{formatHours(result.cross.before)}</div>
                  <div className="arrow">→</div>
                  <div className={`hrs ${severityFor(result.cross.after)}`}>{formatHours(result.cross.after)}</div>
                </div>
                {result.sideEffect && <p className="note-line">{result.sideEffect}</p>}
                {related && (
                  <button type="button" className="texty" onClick={() => onOpenDrug(related.id)}>
                    Open {related.drug}
                  </button>
                )}
              </div>
            )}
            {!result.cross && result.sideEffect && <p className="note-line">{result.sideEffect}</p>}
            <p className="fine-line">Hours until on-hand hits zero, counting the morning wave.</p>
          </div>
          <div className="sign">
            <div className="sign-head">
              <label htmlFor="reason">Reason for the log</label>
              <button
                type="button"
                className="texty"
                onClick={() => {
                  setReason(action.draft)
                  setInvalid(false)
                }}
              >
                Insert a draft
              </button>
            </div>
            <textarea
              id="reason"
              value={reason}
              aria-invalid={invalid}
              className={invalid ? 'invalid' : ''}
              placeholder="What the next shift needs to know."
              onChange={(event) => {
                setReason(event.target.value)
                if (event.target.value.trim().length >= 20) setInvalid(false)
              }}
            />
            <p className="hint">
              {ready ? 'This sentence is what the log keeps.' : 'Write the reason. The next shift was not in the room.'}
            </p>
            <div className="audit">
              <div className="k">The log will store</div>
              <div className="audit-title">
                {drug.drug} · {action.kind === 'transfer' ? `${action.label} · ${qty} vials` : action.label}
              </div>
              <p>{detailLine(result.rows, result.cross)}</p>
              <p className="sub">Morning lead · {stamp}</p>
            </div>
            <button type="button" className={`primary block ${tone === 'bad' && ready ? 'warn' : ''}`} disabled={!ready} onClick={commit}>
              {tone === 'bad' ? 'Commit anyway' : 'Commit decision'}
            </button>
            <p className="fine-line">The 12-hour floor warns. It does not block a commit.</p>
          </div>
        </div>
      </div>
      <p className="keys">Cmd Enter commit · Esc back</p>
    </div>
  )
}
