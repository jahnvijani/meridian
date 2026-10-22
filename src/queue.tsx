import { useEffect, useRef, useState } from 'react'
import type { Constraint, Decision } from './model.ts'
import { toQueueRows } from './rows.ts'
import type { QueueRow } from './rows.ts'

type Filter = 'open' | 'critical' | 'watch' | 'reviewed' | 'all'
type SortKey = 'rank' | 'name' | 'hours' | 'patients'

function matches(row: QueueRow, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'reviewed') return row.status === 'reviewed'
  if (row.status !== 'open') return false
  if (filter === 'critical') return row.severity === 'critical'
  if (filter === 'watch') return row.severity === 'watch'
  return row.severity !== 'stable'
}

function SortHead({
  label,
  sortKey,
  align,
  sort,
  onSort,
}: {
  label: string
  sortKey: SortKey
  align?: 'num'
  sort?: { key: SortKey; dir: 1 | -1 }
  onSort?: (key: SortKey) => void
}) {
  const active = sort?.key === sortKey
  return (
    <th className={align} aria-sort={active ? (sort?.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      {onSort ? (
        <button type="button" className={active ? 'on' : ''} onClick={() => onSort(sortKey)}>
          {label}
          {active ? (sort?.dir === 1 ? ' ↑' : ' ↓') : ''}
        </button>
      ) : (
        label
      )}
    </th>
  )
}

export function QueueTable({
  rows,
  cursor = -1,
  onOpen,
  sort,
  onSort,
}: {
  rows: QueueRow[]
  cursor?: number
  onOpen: (id: string) => void
  sort?: { key: SortKey; dir: 1 | -1 }
  onSort?: (key: SortKey) => void
}) {
  const refs = useRef<Array<HTMLTableRowElement | null>>([])

  useEffect(() => {
    if (cursor >= 0) refs.current[cursor]?.scrollIntoView({ block: 'nearest' })
  }, [cursor])

  return (
    <table className="queue">
      <thead>
        <tr>
          <SortHead label="#" sortKey="rank" align="num" sort={sort} onSort={onSort} />
          <SortHead label="Medication" sortKey="name" sort={sort} onSort={onSort} />
          <SortHead label="Cover" sortKey="hours" align="num" sort={sort} onSort={onSort} />
          <SortHead label="Exposed" sortKey="patients" align="num" sort={sort} onSort={onSort} />
          <th>Constraint</th>
          <th>Next move</th>
          <th>Owner</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, index) => (
          <tr
            key={row.id}
            ref={(node) => {
              refs.current[index] = node
            }}
            className={[
              row.severity === 'critical' ? 'is-critical' : '',
              index === cursor ? 'is-cursor' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            tabIndex={index === cursor ? 0 : -1}
            role="button"
            aria-label={`${row.drug}, ${row.campus}`}
            aria-selected={index === cursor}
            onClick={() => onOpen(row.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') onOpen(row.id)
            }}
          >
            <td className="num rank">{row.rank == null ? '–' : String(row.rank).padStart(2, '0')}</td>
            <td>
              <div className="drug-name">
                {row.drug}
                {row.mark && <span className="mark">{row.mark}</span>}
              </div>
              <div className="sub">{row.form}</div>
            </td>
            <td className="num">
              <div className={`hrs ${row.severity}`}>{row.hours >= 72 ? '72h+' : `${row.hours.toFixed(1)}h`}</div>
              <div className="sub">{row.campus}</div>
            </td>
            <td className="num">
              <div className="mono">{row.patients}</div>
              <div className="sub">patients</div>
            </td>
            <td>{row.kind}</td>
            <td className="move">{row.move}</td>
            <td>{row.owner}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function Triage({
  drugs,
  decisions,
  suspended,
  onOpen,
}: {
  drugs: Constraint[]
  decisions: Decision[]
  suspended: boolean
  onOpen: (id: string) => void
}) {
  const [filter, setFilter] = useState<Filter>('open')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'rank', dir: 1 })
  const [cursor, setCursor] = useState(0)
  const rows = toQueueRows(drugs, decisions)
  const needle = query.trim().toLowerCase()
  const shown = rows
    .filter((row) => matches(row, filter))
    .filter((row) => {
      if (!needle) return true
      return `${row.drug} ${row.form} ${row.kind} ${row.move} ${row.owner} ${row.campus}`
        .toLowerCase()
        .includes(needle)
    })
    .sort((a, b) => {
      if (sort.key === 'name') return a.drug.localeCompare(b.drug) * sort.dir
      if (sort.key === 'hours') return (a.hours - b.hours) * sort.dir
      if (sort.key === 'patients') return (a.patients - b.patients) * sort.dir
      return ((a.rank ?? 99) - (b.rank ?? 99)) * sort.dir
    })

  const active = shown.length === 0 ? 0 : Math.min(cursor, shown.length - 1)

  useEffect(() => {
    if (suspended) return
    function onKey(event: KeyboardEvent) {
      const tag = (event.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.key === 'j' || event.key === 'ArrowDown') {
        event.preventDefault()
        setCursor((value) => Math.min(shown.length - 1, value + 1))
      } else if (event.key === 'k' || event.key === 'ArrowUp') {
        event.preventDefault()
        setCursor((value) => Math.max(0, value - 1))
      } else if (event.key === 'Enter' && shown[active]) {
        event.preventDefault()
        onOpen(shown[active].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [suspended, shown, active, onOpen])

  const counts = {
    open: rows.filter((row) => matches(row, 'open')).length,
    critical: rows.filter((row) => matches(row, 'critical')).length,
    watch: rows.filter((row) => matches(row, 'watch')).length,
    reviewed: rows.filter((row) => matches(row, 'reviewed')).length,
    all: rows.length,
  }
  const line =
    counts.critical === 0
      ? 'Nothing is under the 12-hour floor.'
      : `${counts.critical} under the 12-hour floor. Ranked by the worst campus.`

  function toggleSort(key: SortKey) {
    setSort((current) => {
      if (current.key === key) return { key, dir: current.dir === 1 ? -1 : 1 }
      return { key, dir: key === 'patients' ? -1 : 1 }
    })
  }

  const chips: Array<[Filter, string]> = [
    ['open', `Open ${counts.open}`],
    ['critical', `Critical ${counts.critical}`],
    ['watch', `Watch ${counts.watch}`],
    ['reviewed', `Reviewed ${counts.reviewed}`],
    ['all', `All ${counts.all}`],
  ]

  return (
    <div className="view">
      <div className="toolbar">
        <div>
          <h1>Morning queue</h1>
          <p>{line}</p>
        </div>
        <div className="tools">
          <div className="filters" role="tablist" aria-label="Queue filter">
            {chips.map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                className={filter === id ? 'chip on' : 'chip'}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <input
            className="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter"
            aria-label="Filter the queue"
          />
        </div>
      </div>
      <div className="view-scroll">
        {shown.length === 0 ? (
          <p className="empty">Nothing in this cut of the queue.</p>
        ) : (
          <QueueTable rows={shown} cursor={active} onOpen={onOpen} sort={sort} onSort={toggleSort} />
        )}
      </div>
      <p className="keys">J K move · Enter open · Cmd K search · Cover is hours to zero, not vials on hand</p>
    </div>
  )
}
