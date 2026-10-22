import { BASE } from './model.ts'
import { QueueTable } from './queue.tsx'
import { toQueueRows } from './rows.ts'

const critical = toQueueRows(BASE, [])
  .filter((row) => row.severity === 'critical')
  .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))

export function CaseStudy({
  onQueue,
  onDrug,
}: {
  onQueue: () => void
  onDrug: (id: string) => void
}) {
  return (
    <div className="case">
      <div className="case-bar">
        <div className="case-inner bar-inner">
          <button type="button" className="case-mark" onClick={onQueue}>
            Meridian
          </button>
          <div className="bar-actions">
            <button type="button" className="quiet" onClick={() => onDrug('cisplatin')}>
              Start at cisplatin
            </button>
            <button type="button" className="solid" onClick={onQueue}>
              Open the prototype
            </button>
          </div>
        </div>
      </div>
      <div className="case-inner body">
        <p className="eyebrow">Software interface · product design</p>
        <h1>
          Decide the shortage
          <br />
          before the morning wave.
        </h1>
        <p className="deck">
          Meridian is a workspace for a pharmacy lead who has until 07:00 to move scarce medications across four
          campuses, or to leave them where they are and say why.
        </p>

        <div className="product stage">
          <div className="stage-bar">
            <span>Meridian · Northshore · scenario</span>
            <span>Wed 21 Oct · 05:14</span>
          </div>
          <QueueTable rows={critical} onOpen={onDrug} />
        </div>
        <p className="stage-cap">
          Three drugs miss a 12-hour floor. This is the queue, not a picture of it. Click a row to enter the tool.
        </p>

        <div className="case-layout">
          <article>
            <section>
              <h2>The moment</h2>
              <p>
                05:14. Four campuses share a dispense wave at 07:00. Ten medications are on the morning queue. Three
                of them run out at one campus before noon. The lead already has a low-stock report. It ranks by vials. Albumin,
                with six vials and days of cover, would outrank cisplatin, with eighteen vials and a therapy list that
                fails in six hours.
              </p>
              <p>
                The job is not to see the shelf. It is to choose a move, see what that move does to the other campus,
                and leave a sentence the next shift can read.
              </p>
            </section>

            <section>
              <h2>What the interface ranks</h2>
              <ol className="principles">
                <li>
                  <span>01</span>
                  <div>
                    <h3>The failing node, not the building</h3>
                    <p>
                      Cover is hours until the worst campus hits zero, using the morning wave rather than a flat burn.
                      Combined stock hides the failure, so the chart opens on the worst node. All-campus is a click,
                      not the default. Hovering another campus retargets the curve without a settings panel.
                    </p>
                  </div>
                </li>
                <li>
                  <span>02</span>
                  <div>
                    <h3>The cause, because the move depends on it</h3>
                    <p>
                      Vincristine is a quarantined lot. The move is to release a lot that already passed inspect.
                      Potassium premix is a clean-room slot. The bulk drug is on the shelf. Methotrexate is one pool
                      and two services. A transfer is the wrong shape for all three, and the queue says so before the
                      click.
                    </p>
                  </div>
                </li>
                <li>
                  <span>03</span>
                  <div>
                    <h3>The consequence, before the signature</h3>
                    <p>
                      Each path shows cover before and after. Deferring cisplatin starts does not clear the floor.
                      Substituting carboplatin breaks a drug that was only on watch, and still leaves Lincoln short.
                      The floor turns that amber. It does not disable the commit. A person can break it. They cannot
                      break it silently: the button stays quiet until a reason is written.
                    </p>
                  </div>
                </li>
              </ol>
            </section>

            <section>
              <h2>What I cut</h2>
              <ul className="cuts">
                <li>Patient names. The morning decision is a cohort. A name is a different permission and a different harm.</li>
                <li>A map. Geography does not change the move. The failing node does.</li>
                <li>Automatic allocation. The tool proposes a quantity. A person commits it, and the log keeps their sentence.</li>
              </ul>
            </section>

            <section>
              <h2>Walk it</h2>
              <ol className="walk">
                <li>Read the queue. Sort by Exposed and watch saline jump ahead of cisplatin. That sort is a liar. Rank is not.</li>
                <li>Open All and find albumin. Six vials, cover past 72 hours, and it is not on the open list.</li>
                <li>Open cisplatin. Pin Lincoln. The inbound lot is on the chart, and it lands after zero.</li>
                <li>Shape the move. Try the deferral, then the substitution, then the transfer. Step the transfer until West breaks the floor.</li>
                <li>Commit with a reason. The queue should drop cisplatin out of the critical set. Undo is on the log.</li>
                <li>Open potassium, then fentanyl. One constraint is a room. The other has no slider, because a safe is not a spreadsheet.</li>
              </ol>
              <button type="button" className="solid" onClick={() => onDrug('cisplatin')}>
                Start at cisplatin
              </button>
            </section>
          </article>

          <aside className="case-aside">
            <dl>
              <div>
                <dt>Designer</dt>
                <dd>Jahnvi Jani</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>End-to-end interface design and the working prototype</dd>
              </div>
              <div>
                <dt>Setting</dt>
                <dd>Fictional four-campus health system, morning of 21 Oct 2026</dd>
              </div>
              <div>
                <dt>Stack</dt>
                <dd>React, TypeScript, CSS. No component library. The cover math runs in the interface.</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>Scenario prototype. Not a field study and not a deployment.</dd>
              </div>
            </dl>
            <p className="aside-note">
              Informed by earlier work on medication inventory and multi-site operations forecasting. The ranking, the
              interaction, and the prototype are this project. I did not test it with hospital staff, and the counts
              are invented. Drug names are real. This is not clinical guidance.
            </p>
          </aside>
        </div>
        <footer className="case-foot">
          <span>Jahnvi Jani · 2026</span>
          <span>Fictional operational data. Not for clinical use.</span>
        </footer>
      </div>
    </div>
  )
}
