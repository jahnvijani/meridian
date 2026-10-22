import { useState, type MouseEvent } from 'react'
import {
  chartCaption,
  formatHours,
  seriesFor,
  severityFor,
  totalPatients,
  worst,
} from './model.ts'
import type { Constraint } from './model.ts'

function Timeline({
  points,
  inboundHour,
  label,
}: {
  points: number[]
  inboundHour: number | null
  label: string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const width = 640
  const height = 176
  const pad = { l: 44, r: 16, t: 16, b: 28 }
  const maxV = Math.max(...points, 0)
  const minV = Math.min(...points, 0)
  const top = (maxV === 0 ? 1 : maxV) * 1.12
  const bottom = minV < 0 ? minV * 1.18 : 0
  const span = top - bottom || 1
  const innerW = width - pad.l - pad.r
  const innerH = height - pad.t - pad.b
  const x = (index: number) => pad.l + (index / (points.length - 1)) * innerW
  const y = (value: number) => pad.t + ((top - value) / span) * innerH
  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(point)}`).join(' ')
  const fill = `M ${x(0)} ${y(0)} ${points
    .map((point, index) => `L ${x(index)} ${y(Math.max(point, 0))}`)
    .join(' ')} L ${x(points.length - 1)} ${y(0)} Z`
  const zero = y(0)
  const ticks = [0, 2, 4, 6, 8, 12]

  function onMove(event: MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    const viewX = ratio * width
    const t = (viewX - pad.l) / innerW
    const index = Math.round(Math.max(0, Math.min(1, t)) * (points.length - 1))
    setHover(index)
  }

  const hoverX = hover == null ? 0 : (x(hover) / width) * 100

  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={label}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
      >
        {minV < 0 && (
          <rect x={pad.l} y={zero} width={innerW} height={y(bottom) - zero} fill="rgba(227, 109, 92, 0.13)" />
        )}
        <line x1={pad.l} x2={width - pad.r} y1={zero} y2={zero} stroke="rgba(232,228,216,0.28)" strokeDasharray="2 3" />
        <path d={fill} fill="rgba(232, 228, 216, 0.06)" />
        <path d={line} fill="none" stroke="#e8e4d8" strokeWidth="1.6" />
        {inboundHour != null && (
          <g>
            <line
              x1={x(inboundHour / 6)}
              x2={x(inboundHour / 6)}
              y1={pad.t}
              y2={height - pad.b}
              stroke="#e2b15a"
              strokeDasharray="3 3"
            />
            <text x={x(inboundHour / 6) + 6} y={pad.t + 11} fill="#e2b15a" fontSize="10" fontFamily="IBM Plex Mono, ui-monospace, monospace">
              +{inboundHour}h
            </text>
          </g>
        )}
        {ticks.map((index) => (
          <text
            key={index}
            x={x(index)}
            y={height - 8}
            textAnchor="middle"
            fill="#8a8478"
            fontSize="10"
            fontFamily="IBM Plex Mono, ui-monospace, monospace"
          >
            {index === 0 ? 'now' : `+${index * 6}h`}
          </text>
        ))}
        <text x={pad.l - 8} y={y(top) + 8} textAnchor="end" fill="#8a8478" fontSize="10" fontFamily="IBM Plex Mono, ui-monospace, monospace">
          {Math.round(maxV)}
        </text>
        <text x={pad.l - 8} y={zero + 3} textAnchor="end" fill="#8a8478" fontSize="10" fontFamily="IBM Plex Mono, ui-monospace, monospace">
          0
        </text>
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={height - pad.b} stroke="rgba(232,228,216,0.35)" />
            <circle cx={x(hover)} cy={y(points[hover])} r="3.5" fill="#e8e4d8" />
          </g>
        )}
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: `${Math.min(86, Math.max(8, hoverX))}%` }}>
          <div>{hover === 0 ? 'Now' : `+${hover * 6}h`}</div>
          <div>{points[hover] < 0 ? `Short ${Math.abs(points[hover])}` : `${points[hover]} vials`}</div>
        </div>
      )}
    </div>
  )
}

export function Investigate({
  drug,
  onQueue,
  onDecide,
  onLog,
}: {
  drug: Constraint
  onQueue: () => void
  onDecide: () => void
  onLog: () => void
}) {
  const node = worst(drug)
  const [pin, setPin] = useState<string>(node.campus.id)
  const [hoverCampus, setHoverCampus] = useState<string | null>(null)
  const initialLink = drug.links.find((link) => link.kind === 'Worst node') ?? drug.links[0]
  const [linkId, setLinkId] = useState(initialLink.id)
  const active = hoverCampus ?? pin
  const series = seriesFor(drug, active)
  const caption = chartCaption(series.name, series.hours, series.inboundHour)
  const link = drug.links.find((item) => item.id === linkId) ?? drug.links[0]
  const recommended = drug.actions.find((action) => action.id === drug.recommendedActionId) ?? drug.actions[0]

  return (
    <div className="view">
      <div className="view-scroll">
        <p className="crumb">
          <button type="button" onClick={onQueue}>
            Queue
          </button>
          <span>/</span>
          <span>{drug.drug}</span>
        </p>
        <div className="inv-title">
          <div>
            <h1>{drug.drug}</h1>
            <p className="subline">
              {drug.form} · {drug.owner} · {drug.kindLabel}
            </p>
          </div>
          <div className={`sev-word ${severityFor(node.hours)}`}>{severityFor(node.hours)}</div>
        </div>
        <p className="question">{drug.question}</p>
        <div className="metrics">
          <div className="metric">
            <div className="k">Worst cover</div>
            <div className={`n hrs ${severityFor(node.hours)}`}>{formatHours(node.hours)}</div>
            <div className="s">{node.campus.name}</div>
          </div>
          <div className="metric">
            <div className="k">Exposed</div>
            <div className="n">{totalPatients(drug)}</div>
            <div className="s">
              {drug.lockedPatients > 0 ? `${drug.lockedPatients} protocol-locked` : 'None protocol-locked'}
            </div>
          </div>
          <div className="metric">
            <div className="k">Inbound</div>
            <div className="n">{drug.inbound ? `+${drug.inbound.bucket * 6}h` : 'None'}</div>
            <div className="s">{drug.inbound?.label ?? 'No receipt inside the window'}</div>
          </div>
          <div className="metric">
            <div className="k">Confidence</div>
            <div className="n">{drug.confidence.toFixed(2)}</div>
            <div className="s">{drug.confidenceWhy}</div>
          </div>
        </div>

        <div className="links">
          {drug.links.map((item) => (
            <button
              key={item.id}
              type="button"
              className="link"
              aria-pressed={item.id === link.id}
              onClick={() => setLinkId(item.id)}
            >
              <div className="k">{item.kind}</div>
              <div className="link-title">{item.title}</div>
              <div className="link-meta">{item.meta}</div>
            </button>
          ))}
        </div>

        <div className="inv-grid">
          <div>
            <div className="chart-split">
              <div>
                <div className="chart-head">
                  <div>
                    <div className="k">
                      Showing {series.name}
                      {hoverCampus && hoverCampus !== pin ? ' · preview' : ''}
                      {pin === active && pin !== 'all' ? ' · pinned' : ''}
                    </div>
                    <p className="caption">{caption}</p>
                  </div>
                  <button
                    type="button"
                    className={pin === 'all' ? 'chip on' : 'chip'}
                    onClick={() => {
                      setPin('all')
                      setHoverCampus(null)
                    }}
                  >
                    All campuses
                  </button>
                </div>
                <Timeline points={series.points} inboundHour={series.inboundHour} label={caption} />
                <p className="fine-line">
                  Hours until on-hand hits zero, counting the morning wave. Vials on this view: {series.vials}.
                </p>
              </div>
              <div className="campus-list" onMouseLeave={() => setHoverCampus(null)}>
              {drug.campuses.map((campus) => {
                const hours = seriesFor(drug, campus.id).hours
                const on = pin === campus.id
                return (
                  <button
                    key={campus.id}
                    type="button"
                    className={active === campus.id ? 'campus on' : 'campus'}
                    onMouseEnter={() => setHoverCampus(campus.id)}
                    onClick={() => setPin(campus.id)}
                  >
                    <span className="campus-name">
                      {campus.name}
                      {on && <span className="pin">Pinned</span>}
                    </span>
                    <span className="campus-meta">
                      {campus.service} · {campus.patients} patients · {campus.vials} vials
                    </span>
                    <span className={`hrs ${severityFor(hours)}`}>{formatHours(hours)}</span>
                  </button>
                )
              })}
              </div>
            </div>
            <div className="lot-row">
              {drug.lots.map((lot) => (
                <div key={lot.id} className="lot" data-status={lot.status}>
                  <span className="mono">{lot.id}</span>
                  <span className="lot-status">{lot.status}</span>
                  <span className="sub">
                    {lot.vials} · {lot.where}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <aside className="evidence">
            <div className="k">Selected</div>
            <h2>{link.title}</h2>
            <p>{link.body}</p>
            <div className="k gap">Why this rank</div>
            <ul>
              {drug.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
            {drug.gaps.length > 0 && (
              <>
                <div className="k gap">Open gaps</div>
                <ul>
                  {drug.gaps.map((gap) => (
                    <li key={gap}>{gap}</li>
                  ))}
                </ul>
              </>
            )}
          </aside>
        </div>
      </div>
      <footer className="dock">
        {drug.recorded ? (
          <>
            <div>
              <div className="k">Recorded · {drug.recorded.at}</div>
              <div className="dock-title">{drug.recorded.summary}</div>
            </div>
            <div className="dock-actions">
              <button type="button" className="ghost" onClick={onDecide}>
                Add a note
              </button>
              <button type="button" className="primary" onClick={onLog}>
                View the log
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <div className="k">Suggested</div>
              <div className="dock-title">{recommended.label}</div>
            </div>
            <button type="button" className="primary" onClick={onDecide}>
              Shape the move
            </button>
          </>
        )}
      </footer>
    </div>
  )
}
