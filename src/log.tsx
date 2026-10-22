import { SEED } from './model.ts'
import type { Decision } from './model.ts'

export function Log({
  decisions,
  onOpen,
  onUndo,
  onReset,
}: {
  decisions: Decision[]
  onOpen: (id: string) => void
  onUndo: (id: string) => void
  onReset: () => void
}) {
  const items = [...decisions, ...SEED]
  return (
    <div className="view">
      <div className="view-scroll log-page">
        <h1 className="page-title">Decision log</h1>
        <p className="lede">This shift, then the night before. A dismiss stays here so the same alert cannot return unnamed.</p>
        <div className="log-list">
          {items.map((decision) => (
            <article key={decision.id} className="log-item">
              <header>
                <span className="mono">{decision.at}</span>
                <span>{decision.author}</span>
                {decision.locked ? (
                  <span className="tag">Overnight</span>
                ) : (
                  <button type="button" className="texty" onClick={() => onUndo(decision.id)}>
                    Undo
                  </button>
                )}
              </header>
              <h2>
                <button type="button" onClick={() => onOpen(decision.drugId)}>
                  {decision.drug}
                </button>
              </h2>
              <p className="log-action">{decision.actionLabel}</p>
              <p>{decision.detail}</p>
              <blockquote>{decision.rationale}</blockquote>
            </article>
          ))}
        </div>
        {decisions.length > 0 && (
          <button type="button" className="texty reset" onClick={onReset}>
            Reset this prototype
          </button>
        )}
      </div>
    </div>
  )
}
