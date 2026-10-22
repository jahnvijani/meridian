import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CaseStudy } from './case.tsx'
import { Decide } from './decide.tsx'
import { Investigate } from './investigate.tsx'
import { Log } from './log.tsx'
import { applyDecisions, BASE, drugById, formatHours, SCENARIO, stampFor, worst } from './model.ts'
import type { Decision } from './model.ts'
import { Triage } from './queue.tsx'

type Route =
  | { view: 'case' }
  | { view: 'triage' }
  | { view: 'log' }
  | { view: 'investigate'; id: string }
  | { view: 'decide'; id: string }

const STORAGE = 'meridian-shift-v1'

const NOTES: Record<string, { title: string; points: string[] }> = {
  triage: {
    title: 'Queue',
    points: [
      'Ranked by hours until the worst campus hits zero, then by patients with no equivalent. Vials on hand are not a column.',
      'Albumin is on All: six vials, cover past 72 hours. A quantity sort would have put it above cisplatin.',
      'Sort by Exposed. Saline jumps the line. Volume is not the morning.',
      'The open list is meant to fit without becoming a catalog. If the ranking needs a scroll, it has failed.',
    ],
  },
  investigate: {
    title: 'Investigate',
    points: [
      'The sentence under the name is the only question this screen is allowed to answer.',
      'Hover a campus to retarget the curve. Click to pin it. Combined stock hides the failure, so it is not the default.',
      'Inbound is drawn when it is too late. The late truck is the point of the cisplatin chart.',
      'Vials appear here, next to the curve, where a small count can sit beside a long cover.',
    ],
  },
  decide: {
    title: 'Move',
    points: [
      'The suggested path is marked. The others stay visible, including the ones that fail.',
      'Presets sit on the math: clear 12 hours, the suggested quantity, and the last vial before the donor breaks.',
      'The floor turns the consequence amber. It does not disable commit. Breaking it requires a written reason.',
      'Fentanyl has no stepper. A controlled-substance move happens at the safe, with a witness.',
    ],
  },
  log: {
    title: 'Log',
    points: [
      'A dismiss is a decision. Ceftriaxone stays here so the same false alarm does not return unnamed.',
      'Overnight moves are locked. This shift’s moves can be undone.',
      'The next person inherits the sentence, not the huddle.',
    ],
  },
}

function readRoute(): Route {
  const parts = window.location.hash.replace(/^#\/?/, '').split('/').filter(Boolean)
  if (parts[0] === 'case') return { view: 'case' }
  if (parts[0] === 'log') return { view: 'log' }
  if ((parts[0] === 'investigate' || parts[0] === 'decide') && parts[1]) {
    return { view: parts[0], id: parts[1] }
  }
  return { view: 'triage' }
}

function writeRoute(route: Route) {
  const hash =
    route.view === 'investigate' || route.view === 'decide' ? `#/${route.view}/${route.id}` : `#/${route.view}`
  if (window.location.hash !== hash) window.location.hash = hash
}

function loadDecisions(): Decision[] {
  try {
    const raw = sessionStorage.getItem(STORAGE)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is Decision => {
      if (!item || typeof item !== 'object') return false
      const row = item as Decision
      return typeof row.id === 'string' && typeof row.drugId === 'string' && row.locked !== true
    })
  } catch {
    return []
  }
}

function Mark() {
  return (
    <svg className="brand-mark" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1 11.5h14" fill="none" stroke="currentColor" strokeWidth="1.25" />
      <path d="M1 6h5.2L8 9.2 9.8 6H15" fill="none" stroke="currentColor" strokeWidth="1.25" />
    </svg>
  )
}

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute)
  const [decisions, setDecisions] = useState<Decision[]>(loadDecisions)
  const [palette, setPalette] = useState(false)
  const [notesOn, setNotesOn] = useState(false)
  const [toast, setToast] = useState<{ text: string; id: string } | null>(null)
  const constraints = useMemo(() => applyDecisions(BASE, decisions), [decisions])
  const drug = route.view === 'investigate' || route.view === 'decide' ? drugById(constraints, route.id) : undefined

  const go = useCallback((next: Route) => {
    setPalette(false)
    writeRoute(next)
  }, [])

  useEffect(() => {
    const sync = () => setRoute(readRoute())
    window.addEventListener('hashchange', sync)
    if (!window.location.hash) writeRoute({ view: 'triage' })
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    sessionStorage.setItem(STORAGE, JSON.stringify(decisions))
  }, [decisions])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 7000)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const titles: Record<Route['view'], string> = {
      triage: 'Queue',
      log: 'Log',
      case: 'Case study',
      investigate: drug?.drug ?? 'Investigate',
      decide: 'Move',
    }
    document.title = `${titles[route.view]} · Meridian`
  }, [route, drug])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPalette((open) => !open)
        return
      }
      if (event.key !== 'Escape') return
      if (palette) {
        event.preventDefault()
        setPalette(false)
        return
      }
      const tag = (event.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') {
        ;(event.target as HTMLElement).blur()
        return
      }
      if (route.view === 'decide') writeRoute({ view: 'investigate', id: route.id })
      else if (route.view === 'investigate') writeRoute({ view: 'triage' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [palette, route])

  function commit(decision: Decision) {
    setDecisions((current) => [decision, ...current])
    setToast({ text: `${decision.drug} recorded.`, id: decision.id })
    go({ view: 'log' })
  }

  function undo(id: string) {
    setDecisions((current) => current.filter((decision) => decision.id !== id))
    setToast(null)
  }

  if (route.view === 'case') {
    return (
      <CaseStudy
        onQueue={() => go({ view: 'triage' })}
        onDrug={(id) => go({ view: 'investigate', id })}
      />
    )
  }

  const noteKey = route.view === 'decide' ? 'decide' : route.view === 'investigate' ? 'investigate' : route.view
  const note = NOTES[noteKey]

  return (
    <div className="product app">
      <div className="shell">
        <nav className="nav">
          <button type="button" className="brand" onClick={() => go({ view: 'triage' })}>
            <Mark />
            <span>
              <span className="word">Meridian</span>
              <span className="brand-sub">Supply decisions</span>
            </span>
          </button>
          <div className="nav-group">
            <button
              type="button"
              className={route.view === 'log' ? 'nav-btn' : 'nav-btn on'}
              onClick={() => go({ view: 'triage' })}
            >
              Queue
            </button>
            <button
              type="button"
              className={route.view === 'log' ? 'nav-btn on' : 'nav-btn'}
              onClick={() => go({ view: 'log' })}
            >
              Log
            </button>
          </div>
          <div className="nav-spacer" />
          <button type="button" className={notesOn ? 'nav-btn on' : 'nav-btn'} onClick={() => setNotesOn((value) => !value)}>
            Notes
          </button>
          <button type="button" className="nav-btn" onClick={() => go({ view: 'case' })}>
            Case study
          </button>
          <p className="legal">Fictional operational data. Not for clinical use.</p>
        </nav>
        <div className="main">
          <header className="topbar">
            <div className="topbar-left">
              <span className="org">{SCENARIO.org}</span>
              <span className="scenario">Scenario</span>
            </div>
            <div className="topbar-right">
              <span className="feed warn" title="The 05:00 wholesale pull did not land">
                {SCENARIO.wholesale}
              </span>
              <span className="feed">{SCENARIO.ehr}</span>
              <span className="clock">
                {SCENARIO.when}
                <span className="clock-sub">Wave {SCENARIO.wave}</span>
              </span>
              <button type="button" className="kbd-btn" onClick={() => setPalette(true)}>
                Cmd K
              </button>
            </div>
          </header>
          <div className="workspace">
            {route.view === 'triage' && (
              <Triage drugs={constraints} decisions={decisions} suspended={palette} onOpen={(id) => go({ view: 'investigate', id })} />
            )}
            {route.view === 'investigate' && drug && (
              <Investigate
                key={drug.id}
                drug={drug}
                onQueue={() => go({ view: 'triage' })}
                onDecide={() => go({ view: 'decide', id: drug.id })}
                onLog={() => go({ view: 'log' })}
              />
            )}
            {route.view === 'decide' && drug && (
              <Decide
                key={drug.id}
                drugs={constraints}
                drug={drug}
                stamp={stampFor(decisions.length)}
                onQueue={() => go({ view: 'triage' })}
                onBack={() => go({ view: 'investigate', id: drug.id })}
                onOpenDrug={(id) => go({ view: 'investigate', id })}
                onCommit={commit}
              />
            )}
            {route.view === 'log' && (
              <Log
                decisions={decisions}
                onOpen={(id) => go({ view: 'investigate', id })}
                onUndo={undo}
                onReset={() => {
                  setDecisions([])
                  setToast(null)
                }}
              />
            )}
            {(route.view === 'investigate' || route.view === 'decide') && !drug && (
              <div className="view-scroll">
                <p className="empty">That drug is not on the board.</p>
                <button type="button" className="texty" onClick={() => go({ view: 'triage' })}>
                  Back to the queue
                </button>
              </div>
            )}
            {notesOn && note && (
              <aside className="notes">
                <h2>{note.title}</h2>
                <ul>
                  {note.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </aside>
            )}
          </div>
        </div>
      </div>
      <div className="gate">
        <Mark />
        <h1>Meridian is a desktop operations tool.</h1>
        <p>Widen the window to work the queue. The case study can be read at this size.</p>
        <button type="button" className="primary" onClick={() => go({ view: 'case' })}>
          Read the case study
        </button>
      </div>
      {palette && (
        <Palette
          constraints={constraints}
          onClose={() => setPalette(false)}
          onGo={go}
          suggestMove={
            drug
              ? () => {
                  go({ view: 'decide', id: drug.id })
                }
              : null
          }
          moveLabel={drug?.drug}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          <button type="button" onClick={() => undo(toast.id)}>
            Undo
          </button>
        </div>
      )}
    </div>
  )
}

function Palette({
  constraints,
  onClose,
  onGo,
  suggestMove,
  moveLabel,
}: {
  constraints: ReturnType<typeof applyDecisions>
  onClose: () => void
  onGo: (route: Route) => void
  suggestMove: (() => void) | null
  moveLabel?: string
}) {
  const [query, setQuery] = useState('')
  const [hi, setHi] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const commands: Array<{ id: string; group: string; label: string; hint: string; run: () => void }> = [
      ...constraints.map((drug) => ({
        id: drug.id,
        group: 'Drugs',
        label: drug.drug,
        hint: `${formatHours(worst(drug).hours)} · ${drug.kindLabel}`,
        run: () => onGo({ view: 'investigate', id: drug.id }),
      })),
      ...(suggestMove
        ? [
            {
              id: 'move',
              group: 'Go',
              label: `Shape the move${moveLabel ? ` · ${moveLabel}` : ''}`,
              hint: 'Decide',
              run: suggestMove,
            },
          ]
        : []),
      {
        id: 'queue',
        group: 'Go',
        label: 'Morning queue',
        hint: 'Triage',
        run: () => onGo({ view: 'triage' }),
      },
      {
        id: 'log',
        group: 'Go',
        label: 'Decision log',
        hint: 'Record',
        run: () => onGo({ view: 'log' }),
      },
      {
        id: 'case',
        group: 'Go',
        label: 'Case study',
        hint: 'Writeup',
        run: () => onGo({ view: 'case' }),
      },
    ]
    if (!needle) return commands
    return commands.filter((command) => `${command.label} ${command.hint}`.toLowerCase().includes(needle))
  }, [constraints, moveLabel, onGo, query, suggestMove])

  const index = items.length === 0 ? 0 : Math.min(hi, items.length - 1)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    itemRefs.current[index]?.scrollIntoView({ block: 'nearest' })
  }, [index])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setHi((value) => Math.min(items.length - 1, value + 1))
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        setHi((value) => Math.max(0, value - 1))
      } else if (event.key === 'Enter' && items[index]) {
        event.preventDefault()
        items[index].run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, items])

  let lastGroup = ''

  return (
    <div className="backdrop" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setHi(0)
          }}
          placeholder="Search drugs and views"
          aria-label="Search drugs and views"
        />
        <div className="palette-list">
          {items.length === 0 && <p className="empty">Nothing matches.</p>}
          {items.map((item, itemIndex) => {
            const header = item.group !== lastGroup
            lastGroup = item.group
            return (
              <div key={item.id}>
                {header && <div className="palette-group">{item.group}</div>}
                <button
                  type="button"
                  ref={(node) => {
                    itemRefs.current[itemIndex] = node
                  }}
                  className={itemIndex === index ? 'cmd on' : 'cmd'}
                  onMouseEnter={() => setHi(itemIndex)}
                  onClick={item.run}
                >
                  <span>{item.label}</span>
                  <small>{item.hint}</small>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
