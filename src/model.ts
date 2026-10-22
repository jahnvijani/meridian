export type Severity = 'critical' | 'watch' | 'stable'
export type Status = 'open' | 'reviewed'

export type Campus = {
  id: string
  name: string
  service: string
  vials: number
  patients: number
  demand: number[]
}

export type Inbound = {
  campusId: string
  bucket: number
  qty: number
  label: string
}

export type Lot = {
  id: string
  vials: number
  status: 'Released' | 'Quarantine' | 'In transit' | 'Held'
  where: string
}

export type LinkObj = {
  id: string
  kind: string
  title: string
  meta: string
  body: string
}

export type Cross = {
  drugId: string
  campusId: string
  extraPerBucket: number
  buckets: number
}

export type Action = {
  id: string
  drugId: string
  kind: 'transfer' | 'release' | 'scale' | 'note' | 'dismiss'
  label: string
  summary: string
  draft: string
  from?: string
  to?: string
  qty?: number
  campusId?: string
  add?: number
  factor?: number
  buckets?: number
  lotId?: string
  patientsNote?: string
  sideEffect?: string
  cross?: Cross
}

export type Constraint = {
  id: string
  drug: string
  form: string
  status: Status
  kindLabel: string
  owner: string
  move: string
  question: string
  confidence: number
  confidenceWhy: string
  lockedPatients: number
  reasons: string[]
  gaps: string[]
  campuses: Campus[]
  inbound: Inbound | null
  lots: Lot[]
  links: LinkObj[]
  actions: Action[]
  recommendedActionId: string
  recorded?: { at: string; summary: string }
}

export type Effect = {
  drugId: string
  status?: Status
  transfer?: { from: string; to: string; qty: number }
  add?: { campusId: string; qty: number; lotId?: string }
  scale?: { campusId: string; factor: number; buckets?: number }
  cross?: Cross
}

export type Decision = {
  id: string
  drugId: string
  drug: string
  at: string
  author: string
  actionLabel: string
  detail: string
  rationale: string
  locked?: boolean
  effect?: Effect
}

export const FLOOR = 12
export const BUCKET_HOURS = 6

export const SCENARIO = {
  org: 'Northshore Health',
  when: 'Wed 21 Oct · 05:14',
  wave: '07:00',
  waveIn: '1h 46m',
  ehr: 'EHR 05:10',
  wholesale: 'Wholesale 03:40',
}

export function roundHours(hours: number): number {
  if (hours >= 72) return 72
  return Math.round(hours * 10) / 10
}

export function formatHours(hours: number): string {
  if (hours >= 72) return '72h+'
  return `${hours.toFixed(1)}h`
}

export function severityFor(hours: number): Severity {
  if (hours < FLOOR) return 'critical'
  if (hours < 24) return 'watch'
  return 'stable'
}

export function traceStock(
  vials: number,
  demand: number[],
  inbound?: { bucket: number; qty: number } | null,
): { points: number[]; hours: number } {
  const points = [vials]
  let stock = vials
  let hours = demand.length * BUCKET_HOURS
  let hit = false

  for (let i = 0; i < demand.length; i++) {
    if (inbound && inbound.bucket === i) stock += inbound.qty
    const use = demand[i]
    if (!hit) {
      if (stock <= 0) {
        hours = i * BUCKET_HOURS
        hit = true
      } else if (use > 0 && stock <= use) {
        hours = i * BUCKET_HOURS + (stock / use) * BUCKET_HOURS
        hit = true
      }
    }
    stock -= use
    points.push(Math.round(stock * 10) / 10)
  }

  return { points, hours }
}

export function campusHours(drug: Constraint, campus: Campus): number {
  const inbound =
    drug.inbound && drug.inbound.campusId === campus.id
      ? { bucket: drug.inbound.bucket, qty: drug.inbound.qty }
      : null
  return roundHours(traceStock(campus.vials, campus.demand, inbound).hours)
}

export function worst(drug: Constraint): { campus: Campus; hours: number } {
  let campus = drug.campuses[0]
  let hours = campusHours(drug, campus)
  for (const next of drug.campuses) {
    const h = campusHours(drug, next)
    if (h < hours) {
      campus = next
      hours = h
    }
  }
  return { campus, hours }
}

export function totalPatients(drug: Constraint): number {
  return drug.campuses.reduce((sum, campus) => sum + campus.patients, 0)
}

export function isCritical(drug: Constraint): boolean {
  return drug.status === 'open' && severityFor(worst(drug).hours) === 'critical'
}

export function isWatch(drug: Constraint): boolean {
  return drug.status === 'open' && severityFor(worst(drug).hours) === 'watch'
}

export function isOpen(drug: Constraint): boolean {
  return isCritical(drug) || isWatch(drug)
}

export function seriesFor(drug: Constraint, campusId: string): {
  name: string
  points: number[]
  hours: number
  inboundHour: number | null
  vials: number
} {
  if (campusId === 'all') {
    const length = drug.campuses[0].demand.length
    const demand = Array.from({ length }, (_, index) =>
      drug.campuses.reduce((sum, campus) => sum + campus.demand[index], 0),
    )
    const vials = drug.campuses.reduce((sum, campus) => sum + campus.vials, 0)
    const inbound = drug.inbound
      ? { bucket: drug.inbound.bucket, qty: drug.inbound.qty }
      : null
    const traced = traceStock(vials, demand, inbound)
    return {
      name: 'All campuses',
      points: traced.points,
      hours: roundHours(traced.hours),
      inboundHour: drug.inbound ? drug.inbound.bucket * BUCKET_HOURS : null,
      vials,
    }
  }

  const campus = drug.campuses.find((item) => item.id === campusId) ?? worst(drug).campus
  const inbound =
    drug.inbound && drug.inbound.campusId === campus.id
      ? { bucket: drug.inbound.bucket, qty: drug.inbound.qty }
      : null
  const traced = traceStock(campus.vials, campus.demand, inbound)
  return {
    name: campus.name,
    points: traced.points,
    hours: roundHours(traced.hours),
    inboundHour: inbound ? inbound.bucket * BUCKET_HOURS : null,
    vials: campus.vials,
  }
}

export function effectFor(action: Action, qty: number): Effect {
  const effect: Effect = { drugId: action.drugId }
  if (action.kind === 'dismiss') effect.status = 'reviewed'
  if (action.kind === 'transfer' && action.from && action.to) {
    effect.transfer = { from: action.from, to: action.to, qty }
  }
  if (action.kind === 'release' && action.campusId && action.add) {
    effect.add = { campusId: action.campusId, qty: action.add, lotId: action.lotId }
  }
  if (action.kind === 'scale' && action.campusId && action.factor) {
    effect.scale = {
      campusId: action.campusId,
      factor: action.factor,
      buckets: action.buckets,
    }
  }
  if (action.cross) effect.cross = action.cross
  return effect
}

function cloneDrug(drug: Constraint): Constraint {
  return {
    ...drug,
    campuses: drug.campuses.map((campus) => ({ ...campus, demand: [...campus.demand] })),
    inbound: drug.inbound ? { ...drug.inbound } : null,
    lots: drug.lots.map((lot) => ({ ...lot })),
    links: drug.links.map((link) => ({ ...link })),
    reasons: [...drug.reasons],
    gaps: [...drug.gaps],
  }
}

function applyCross(drug: Constraint, cross: Cross): Constraint {
  const next = cloneDrug(drug)
  const campus = next.campuses.find((item) => item.id === cross.campusId)
  if (!campus) return next
  campus.demand = campus.demand.map((value, index) =>
    index < cross.buckets ? Math.round((value + cross.extraPerBucket) * 10) / 10 : value,
  )
  return next
}

function reduceDrug(drug: Constraint, effect: Effect): Constraint {
  const next = cloneDrug(drug)
  if (effect.status) next.status = effect.status
  if (effect.transfer) {
    const from = next.campuses.find((item) => item.id === effect.transfer?.from)
    const to = next.campuses.find((item) => item.id === effect.transfer?.to)
    if (from && to) {
      const qty = Math.max(0, Math.min(effect.transfer.qty, from.vials))
      from.vials -= qty
      to.vials += qty
    }
  }
  if (effect.add) {
    const campus = next.campuses.find((item) => item.id === effect.add?.campusId)
    if (campus) campus.vials += effect.add.qty
    if (effect.add.lotId) {
      const lot = next.lots.find((item) => item.id === effect.add?.lotId)
      if (lot) {
        lot.status = 'Released'
        lot.where = campus?.name ?? lot.where
      }
    }
  }
  if (effect.scale) {
    const scale = effect.scale
    const campus = next.campuses.find((item) => item.id === scale.campusId)
    if (campus) {
      campus.demand = campus.demand.map((value, index) =>
        scale.buckets === undefined || index < scale.buckets
          ? Math.round(value * scale.factor * 10) / 10
          : value,
      )
    }
  }
  return next
}

export function applyDecisions(base: Constraint[], newestFirst: Decision[]): Constraint[] {
  let all = base.map(cloneDrug)
  for (const decision of [...newestFirst].reverse()) {
    if (decision.locked || !decision.effect) continue
    const effect = decision.effect
    all = all.map((drug) => {
      if (drug.id === effect.drugId) return reduceDrug(drug, effect)
      if (effect.cross && drug.id === effect.cross.drugId) return applyCross(drug, effect.cross)
      return drug
    })
  }
  return all
}

export type PreviewRow = {
  key: string
  name: string
  meta: string
  before: number
  after: number
}

export type Preview = {
  rows: PreviewRow[]
  cross: PreviewRow | null
  sideEffect: string | null
  relatedDrugId: string | null
  changed: boolean
  headline: string
}

function droppedThroughFloor(row: PreviewRow): boolean {
  return row.before >= FLOOR && row.after < FLOOR
}

export function preview(all: Constraint[], action: Action, qty: number): Preview {
  const current = all.find((drug) => drug.id === action.drugId)
  if (!current) {
    return {
      rows: [],
      cross: null,
      sideEffect: action.sideEffect ?? null,
      relatedDrugId: action.cross?.drugId ?? null,
      changed: false,
      headline: 'No drug selected.',
    }
  }

  const effect = effectFor(action, qty)
  const next = reduceDrug(current, effect)
  const rows = current.campuses.map((campus) => {
    const afterCampus = next.campuses.find((item) => item.id === campus.id) ?? campus
    return {
      key: campus.id,
      name: campus.name,
      meta: campus.service,
      before: campusHours(current, campus),
      after: campusHours(next, afterCampus),
    }
  })

  let cross: PreviewRow | null = null
  if (effect.cross) {
    const other = all.find((drug) => drug.id === effect.cross?.drugId)
    const campus = other?.campuses.find((item) => item.id === effect.cross?.campusId)
    if (other && campus && effect.cross) {
      const otherNext = applyCross(other, effect.cross)
      const campusAfter = otherNext.campuses.find((item) => item.id === campus.id) ?? campus
      cross = {
        key: `${other.id}-${campus.id}`,
        name: `${other.drug} · ${campus.name}`,
        meta: 'Related drug',
        before: campusHours(other, campus),
        after: campusHours(otherNext, campusAfter),
      }
    }
  }

  const changed = Boolean(effect.transfer || effect.add || effect.scale || effect.cross)
  const broken = [
    ...rows.filter(droppedThroughFloor).map((row) => row.name),
    ...(cross && droppedThroughFloor(cross) ? [cross.name] : []),
  ]
  const worstBefore = Math.min(...rows.map((row) => row.before))
  const worstAfter = Math.min(...rows.map((row) => row.after))

  const worstAfterRow = rows.reduce((best, row) => (row.after < best.after ? row : best), rows[0])
  let headline = 'The floor stays intact.'
  if (action.kind === 'dismiss') headline = 'Leaves the open queue. No stock moves.'
  else if (broken.length > 0) {
    headline = `Breaks the floor at ${broken.join(' and ')}.`
    if (worstAfterRow && worstAfter < FLOOR && !broken.includes(worstAfterRow.name)) {
      headline += ` ${worstAfterRow.name} stays under it.`
    }
  } else if (worstBefore < FLOOR && worstAfter >= FLOOR) headline = 'Clears the 12-hour floor.'
  else if (worstAfter < FLOOR) headline = 'Still under the 12-hour floor.'
  else if (worstAfter - worstBefore >= 6) {
    headline = `Cover extends from ${formatHours(worstBefore)} to ${formatHours(worstAfter)}.`
  } else if (!changed) headline = 'No stock changes. The row stays on the queue.'
  else if (Math.abs(worstAfter - worstBefore) < 0.05) headline = 'Cover does not move.'

  return {
    rows,
    cross,
    sideEffect: action.sideEffect ?? null,
    relatedDrugId: action.cross?.drugId ?? null,
    changed,
    headline,
  }
}

export function minQtyToFloor(drug: Constraint, fromId: string, toId: string): number {
  const source = drug.campuses.find((campus) => campus.id === fromId)
  const dest = drug.campuses.find((campus) => campus.id === toId)
  if (!source || !dest) return 0
  const action = drug.actions.find((item) => item.kind === 'transfer' && item.from === fromId)
  if (!action) return 0
  for (let qty = 0; qty <= source.vials; qty++) {
    const result = preview([drug], { ...action, from: fromId, to: toId }, qty)
    const row = result.rows.find((item) => item.key === toId)
    if (row && row.after >= FLOOR) return qty
  }
  return -1
}

export function maxQtySafe(drug: Constraint, fromId: string, toId: string): number {
  const source = drug.campuses.find((campus) => campus.id === fromId)
  if (!source) return 0
  const action = drug.actions.find((item) => item.kind === 'transfer')
  if (!action) return source.vials
  let safe = 0
  for (let qty = 0; qty <= source.vials; qty++) {
    const result = preview([drug], { ...action, from: fromId, to: toId }, qty)
    const row = result.rows.find((item) => item.key === fromId)
    if (row && row.after >= FLOOR) safe = qty
    else break
  }
  return safe
}

export function stampFor(offset: number): string {
  const minutes = 5 * 60 + 14 + offset
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `Wed 21 Oct · ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function touchesStock(decision: Decision): boolean {
  const effect = decision.effect
  if (!effect) return false
  return Boolean(effect.transfer || effect.add || effect.scale || effect.cross)
}

function campus(
  id: string,
  name: string,
  service: string,
  vials: number,
  patients: number,
  demand: number[],
): Campus {
  return { id, name, service, vials, patients, demand }
}

export const BASE: Constraint[] = [
  {
    id: 'cisplatin',
    drug: 'Cisplatin',
    form: '1 mg/mL vial',
    status: 'open',
    kindLabel: 'Supplier delay',
    owner: 'Oncology',
    move: 'West → Lincoln',
    question: 'Will Lincoln oncology miss a therapy window before lot CIS-218 arrives?',
    confidence: 0.86,
    confidenceWhy: 'Dispense history closed at 01:10. The inbound ETA is the supplier’s, and it slipped once overnight.',
    lockedPatients: 9,
    reasons: [
      'Lincoln runs out during the morning wave. West, Lakeside, and Children’s do not.',
      'Nine Lincoln patients are on cisplatin-locked germ-cell protocols. Carboplatin does not cover them.',
      'Lot CIS-218 lands at +36h, after Lincoln has already hit zero.',
    ],
    gaps: [
      'West may add an afternoon clinic that is not on the book yet.',
      'The wholesale feed has been stale since 03:40, so the ETA can slip again.',
    ],
    inbound: { campusId: 'lincoln', bucket: 6, qty: 48, label: 'CIS-218 · +36h' },
    campuses: [
      campus('lincoln', 'Lincoln', 'Oncology', 18, 14, [17, 15, 12, 10, 8, 7, 6, 6, 5, 5, 4, 4]),
      campus('west', 'West', 'Oncology', 40, 4, [6, 5, 5, 4, 4, 4, 3, 3, 3, 2, 2, 2]),
      campus('lakeside', 'Lakeside', 'Oncology', 16, 3, [3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1]),
      campus('childrens', "Children's", 'Oncology', 9, 2, [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
    ],
    lots: [
      { id: 'CIS-220', vials: 83, status: 'Released', where: 'Split across campuses' },
      { id: 'CIS-218', vials: 48, status: 'In transit', where: 'Accord · Lincoln dock' },
    ],
    links: [
      {
        id: 'supplier',
        kind: 'Supplier',
        title: 'Accord',
        meta: 'Delayed',
        body: 'The last three cisplatin lots averaged 29 hours late. This ETA has already moved once, from +24h to +36h.',
      },
      {
        id: 'lot',
        kind: 'Lot',
        title: 'CIS-218',
        meta: '48 vials · in transit',
        body: 'Allocated to Lincoln. It does not count as on-hand. If the dock scan slips past 17:00 tomorrow, the next wave is uncovered too.',
      },
      {
        id: 'protocol',
        kind: 'Protocol',
        title: 'Germ-cell, BEP',
        meta: '9 patients',
        body: 'These nine stays are protocol-locked to cisplatin. A carboplatin switch is a different regimen, not a brand substitution.',
      },
      {
        id: 'node',
        kind: 'Worst node',
        title: 'Lincoln',
        meta: '14 patients today',
        body: 'The failure is local. System on-hand looks comfortable and still leaves this infusion list short before noon.',
      },
    ],
    actions: [
      {
        id: 'transfer',
        drugId: 'cisplatin',
        kind: 'transfer',
        label: 'Transfer West → Lincoln',
        summary: 'Move vials into the campus that actually runs out.',
        draft: 'Moving West stock to Lincoln so the protocol-locked list clears noon. West add-ons get another look at 14:00.',
        from: 'west',
        to: 'lincoln',
        qty: 16,
      },
      {
        id: 'defer',
        drugId: 'cisplatin',
        kind: 'scale',
        label: 'Defer four Lincoln starts',
        summary: 'Slip four non-urgent starts to tomorrow. The protocol-locked nine stay.',
        draft: 'Deferring four non-urgent Lincoln starts by one day. The nine BEP patients are not in that set.',
        campusId: 'lincoln',
        factor: 0.71,
        buckets: 4,
        patientsNote: 'Four starts can move. Nine cannot.',
      },
      {
        id: 'substitute',
        drugId: 'cisplatin',
        kind: 'scale',
        label: 'Substitute carboplatin where eligible',
        summary: 'Switch only the patients who are not protocol-locked.',
        draft: 'Switching the eligible Lincoln patients to carboplatin. The nine protocol-locked patients stay, and Lakeside carboplatin takes the draw.',
        campusId: 'lincoln',
        factor: 0.64,
        patientsNote: 'Five Lincoln patients can switch. Nine cannot.',
        sideEffect: 'This draws on carboplatin, which is already on the morning queue.',
        cross: { drugId: 'carboplatin', campusId: 'lakeside', extraPerBucket: 3, buckets: 3 },
      },
    ],
    recommendedActionId: 'transfer',
  },
  {
    id: 'vincristine',
    drug: 'Vincristine',
    form: '1 mg/mL vial',
    status: 'open',
    kindLabel: 'Lot quarantine',
    owner: 'Heme',
    move: 'Release VNC-438',
    question: "Can Children's start its day-2 holds if lot VNC-441 stays quarantined?",
    confidence: 0.93,
    confidenceWhy: 'The quarantine is a scanned hold, not a forecast. Visual inspect on VNC-438 was signed at 04:40.',
    lockedPatients: 6,
    reasons: [
      "Available vials at Children's run out inside the wave. The quarantined lot is not in that count.",
      'VNC-438 passed inspect at 04:40 and is sitting in the Lakeside release cage.',
      'Six patients are mid-protocol. Skipping the day is the harm this row is here to prevent.',
    ],
    gaps: ['The particulate result on VNC-441 will not post until the lab opens at 08:00.'],
    inbound: null,
    campuses: [
      campus('childrens', "Children's", 'Heme', 5, 8, [6, 5, 4, 3, 3, 2, 2, 2, 2, 1, 1, 1]),
      campus('lincoln', 'Lincoln', 'Heme', 12, 3, [3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1]),
      campus('lakeside', 'Lakeside', 'Heme', 8, 1, [2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
      campus('west', 'West', 'Heme', 7, 2, [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
    ],
    lots: [
      { id: 'VNC-441', vials: 14, status: 'Quarantine', where: "Children's · particulate check" },
      { id: 'VNC-438', vials: 12, status: 'Held', where: 'Lakeside release cage' },
      { id: 'VNC-390', vials: 32, status: 'Released', where: 'Split across campuses' },
    ],
    links: [
      {
        id: 'quarantine',
        kind: 'Lot',
        title: 'VNC-441',
        meta: 'Quarantine · 14 vials',
        body: "Counted by the night shift and then held. It still shows on the wholesaler invoice, which is why a quantity report overstates Children's.",
      },
      {
        id: 'held',
        kind: 'Lot',
        title: 'VNC-438',
        meta: 'Held · inspect signed',
        body: 'Visual inspect passed at 04:40. It is not available stock until someone releases it out of the cage and onto the failing campus.',
      },
      {
        id: 'protocol',
        kind: 'Protocol',
        title: 'Day-2 holds',
        meta: '6 patients',
        body: "These are continuation holds, not new starts. Delaying them is possible and it is the worse clinical harm.",
      },
      {
        id: 'node',
        kind: 'Worst node',
        title: "Children's",
        meta: '8 patients today',
        body: 'The other campuses are fine. A system transfer from Lincoln would move a problem that a local release already solves.',
      },
    ],
    actions: [
      {
        id: 'release',
        drugId: 'vincristine',
        kind: 'release',
        label: "Release VNC-438 to Children's",
        summary: 'The held lot passed inspect. Put it on the campus that is short.',
        draft: "Releasing VNC-438 to Children's. VNC-441 stays quarantined until the lab posts.",
        campusId: 'childrens',
        add: 12,
        lotId: 'VNC-438',
        patientsNote: '12 held vials become available. The quarantined lot stays out.',
      },
      {
        id: 'delay',
        drugId: 'vincristine',
        kind: 'scale',
        label: 'Delay the day-2 holds',
        summary: 'Push continuation holds out of the wave. This is the worse harm.',
        draft: 'Delaying day-2 holds out of the morning wave. Chosen over releasing a lot that already passed inspect.',
        campusId: 'childrens',
        factor: 0.5,
        buckets: 3,
        patientsNote: 'Six mid-protocol patients slip.',
      },
    ],
    recommendedActionId: 'release',
  },
  {
    id: 'methotrexate',
    drug: 'Methotrexate',
    form: '25 mg/mL vial',
    status: 'open',
    kindLabel: 'Shared service',
    owner: 'Rheum / Onc',
    move: 'Defer rheum starts',
    question: 'Who waits if oncology and rheumatology draw the same Lincoln pool today?',
    confidence: 0.78,
    confidenceWhy: 'The oncology book is final. Rheumatology still has two unconfirmed add-ons in the count.',
    lockedPatients: 8,
    reasons: [
      'High-dose oncology and rheumatology starts draw on one Lincoln pool.',
      'Oncology cannot slip. Six rheumatology starts can move a day.',
      'Lakeside has stock, and it is the Monday clinic’s entire week.',
    ],
    gaps: ['Two rheumatology add-ons are unconfirmed and still counted in the burn.'],
    inbound: null,
    campuses: [
      campus('lincoln', 'Lincoln', 'Shared pool', 20, 14, [14, 18, 10, 8, 6, 5, 4, 4, 3, 3, 2, 2]),
      campus('lakeside', 'Lakeside', 'Rheum clinic', 22, 4, [4, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1]),
      campus('west', 'West', 'Oncology', 8, 2, [2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
    ],
    lots: [
      { id: 'MTX-110', vials: 50, status: 'Released', where: 'Lincoln pool and Lakeside' },
    ],
    links: [
      {
        id: 'onc',
        kind: 'Service',
        title: 'Oncology',
        meta: '8 visits · protected',
        body: 'High-dose visits are already sequenced with leucovorin timing. They are not a deferral candidate.',
      },
      {
        id: 'rheum',
        kind: 'Service',
        title: 'Rheumatology',
        meta: '6 starts · can slip',
        body: 'New starts, not rescue doses. Moving them one day is the cut that changes Lincoln’s burn.',
      },
      {
        id: 'monday',
        kind: 'Campus',
        title: 'Lakeside',
        meta: 'Monday clinic',
        body: 'This stock is not spare in any sense but the vial count. It covers a clinic that does not run again until Monday.',
      },
      {
        id: 'pool',
        kind: 'Pool',
        title: 'Lincoln',
        meta: 'One physical stock',
        body: 'The two services do not have separate shelves. A priority rule is the allocation.',
      },
    ],
    actions: [
      {
        id: 'defer',
        drugId: 'methotrexate',
        kind: 'scale',
        label: 'Defer six rheumatology starts',
        summary: 'Keep the oncology book. Move the starts that can slip.',
        draft: 'Deferring six rheumatology starts by 24 hours. Oncology visits stay on today’s book.',
        campusId: 'lincoln',
        factor: 0.55,
        patientsNote: 'Eight oncology visits stay. Six rheumatology starts move.',
      },
      {
        id: 'transfer',
        drugId: 'methotrexate',
        kind: 'transfer',
        label: 'Transfer Lakeside → Lincoln',
        summary: 'Borrow from the Monday clinic instead of deferring starts.',
        draft: 'Transferring Lakeside methotrexate to the Lincoln pool. Monday clinic cover is the cost.',
        from: 'lakeside',
        to: 'lincoln',
        qty: 12,
      },
    ],
    recommendedActionId: 'defer',
  },
  {
    id: 'lidocaine',
    drug: 'Lidocaine',
    form: '2% · 5 mL syringe',
    status: 'open',
    kindLabel: 'Supplier delay',
    owner: 'ED',
    move: 'Hold elective blocks',
    question: 'Does the inbound at +18h land before the ED trays run out?',
    confidence: 0.84,
    confidenceWhy: 'Tray counts were scanned at 04:50. The inbound appointment is confirmed; the dock window is not.',
    lockedPatients: 0,
    reasons: [
      'Lincoln ED clears the 12-hour floor and still stocks out before the truck.',
      'Two elective blocks account for the gap between now and the inbound.',
      'A transfer also bridges the gap, and it moves stock the truck is about to replace.',
    ],
    gaps: ['The dock window is a range. +18h is the start of it, not a scan.'],
    inbound: { campusId: 'lincoln', bucket: 3, qty: 24, label: 'Inbound · +18h' },
    campuses: [
      campus('lincoln', 'Lincoln', 'ED', 20, 11, [8, 8, 12, 6, 5, 4, 4, 3, 3, 2, 2, 2]),
      campus('west', 'West', 'OR', 36, 6, [4, 4, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1]),
      campus('lakeside', 'Lakeside', 'ED', 12, 3, [2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1]),
    ],
    lots: [
      { id: 'LID-88', vials: 68, status: 'Released', where: 'Tray stock' },
      { id: 'LID-91', vials: 24, status: 'In transit', where: 'Due +18h · Lincoln' },
    ],
    links: [
      {
        id: 'inbound',
        kind: 'Inbound',
        title: '+18h',
        meta: '24 syringes',
        body: 'Confirmed on the wholesaler order. It arrives after Lincoln’s current burn hits zero, unless the morning demand is cut or stock is moved.',
      },
      {
        id: 'blocks',
        kind: 'Schedule',
        title: 'Two elective blocks',
        meta: 'Can move',
        body: 'Neither block is trauma or labor. Holding them is a schedule change, not a clinical substitution.',
      },
      {
        id: 'ed',
        kind: 'Service',
        title: 'Lincoln ED',
        meta: 'Trays protected',
        body: 'Emergency trays are the stock this row is defending. Elective use is what puts them at risk before the truck.',
      },
      {
        id: 'west',
        kind: 'Campus',
        title: 'West OR',
        meta: 'Donor, if needed',
        body: 'West can give syringes. The truck makes that transfer temporary, which is a reason to prefer the hold.',
      },
    ],
    actions: [
      {
        id: 'hold',
        drugId: 'lidocaine',
        kind: 'scale',
        label: 'Hold two elective blocks',
        summary: 'Cut the morning burn so the inbound lands before zero.',
        draft: 'Holding two elective blocks so Lincoln ED reaches the +18h inbound without a transfer.',
        campusId: 'lincoln',
        factor: 0.45,
        buckets: 2,
        patientsNote: 'Emergency trays stay first. Two elective blocks wait.',
      },
      {
        id: 'transfer',
        drugId: 'lidocaine',
        kind: 'transfer',
        label: 'Transfer West → Lincoln',
        summary: 'Bridge with borrowed stock instead of moving the schedule.',
        draft: 'Transferring West lidocaine to Lincoln ED to bridge the inbound. Elective blocks stay on the board.',
        from: 'west',
        to: 'lincoln',
        qty: 10,
      },
    ],
    recommendedActionId: 'hold',
  },
  {
    id: 'amoxicillin',
    drug: 'Amoxicillin-clavulanate',
    form: '400 mg/5 mL suspension',
    status: 'open',
    kindLabel: 'Backorder',
    owner: 'Outpatient',
    move: 'Switch eligible fills',
    question: 'Which pediatric fills can follow the approved switch, and which cannot?',
    confidence: 0.7,
    confidenceWhy: 'Outpatient demand is inferred from yesterday’s fills. The wholesale feed has been stale since 03:40.',
    lockedPatients: 24,
    reasons: [
      'Suspension is on manufacturer backorder. Tablets do not serve this list.',
      'An approved switch to amoxicillin covers 40 of 64 fills. Bites and a respiratory subset stay.',
      'Patient count is the highest on the board. Cover is not. Ranking by volume would put this above cisplatin.',
    ],
    gaps: ['Tomorrow’s clinic templates are not posted. The 64 is a floor, not a cap.'],
    inbound: { campusId: 'lincoln', bucket: 8, qty: 80, label: 'Backorder · +48h' },
    campuses: [
      campus('lincoln', 'Lincoln', 'Outpatient', 30, 40, [12, 12, 12, 8, 6, 5, 4, 4, 3, 3, 2, 2]),
      campus('childrens', "Children's", 'Outpatient', 22, 16, [4, 4, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1]),
      campus('west', 'West', 'Outpatient', 14, 8, [3, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1]),
    ],
    lots: [
      { id: 'AMX-12', vials: 66, status: 'Released', where: 'Outpatient pharmacies' },
      { id: 'AMX-14', vials: 80, status: 'In transit', where: 'Backorder · +48h' },
    ],
    links: [
      {
        id: 'switch',
        kind: 'Protocol',
        title: 'Approved switch',
        meta: '40 of 64 fills',
        body: 'Pharmacy and infectious disease signed the switch last month. It is not a judgment call made at the counter this morning.',
      },
      {
        id: 'stay',
        kind: 'Exception',
        title: 'Do not switch',
        meta: '24 fills',
        body: 'Bites, and the respiratory cases the protocol lists by name, stay on clavulanate. The queue should not hide them inside the 64.',
      },
      {
        id: 'feed',
        kind: 'Feed',
        title: 'Wholesale',
        meta: 'Stale since 03:40',
        body: 'Suspension availability is the noisiest number on this board. Confidence stays lower until the 05:00 pull actually lands.',
      },
      {
        id: 'node',
        kind: 'Worst node',
        title: 'Lincoln outpatient',
        meta: '40 fills',
        body: 'This is a fill list, not an infusion list. The harm of waiting is real and it is not the same harm as a missed cisplatin window.',
      },
    ],
    actions: [
      {
        id: 'switch',
        drugId: 'amoxicillin',
        kind: 'scale',
        label: 'Switch the 40 eligible fills',
        summary: 'Use the protocol that is already signed. Keep the 24 exceptions.',
        draft: 'Switching the 40 eligible fills to amoxicillin. Twenty-four exceptions stay on clavulanate.',
        campusId: 'lincoln',
        factor: 0.45,
        patientsNote: '24 fills are excluded from the switch.',
      },
      {
        id: 'hold',
        drugId: 'amoxicillin',
        kind: 'note',
        label: 'Leave the list unchanged',
        summary: 'Record that the switch was considered and not used.',
        draft: 'Leaving the clavulanate list as written. Revisit when the wholesale feed refreshes.',
      },
    ],
    recommendedActionId: 'switch',
  },
  {
    id: 'potassium',
    drug: 'Potassium chloride',
    form: '10 mEq premix bag',
    status: 'open',
    kindLabel: 'Clean-room slot',
    owner: 'Central',
    move: 'Wait for 11:00 slot',
    question: 'Can premix cover the wards until the 11:00 compounding slot?',
    confidence: 0.9,
    confidenceWhy: 'Premix on-hand was counted at 05:00. The clean-room book is tomorrow’s schedule, already posted.',
    lockedPatients: 0,
    reasons: [
      'Bulk potassium is on the shelf. Empty premix bags are the constraint.',
      'The next clean-room slot is 11:00. The dispense wave is 07:00.',
      'Every campus is short of bags for the same reason. A transfer relocates the problem.',
    ],
    gaps: ['If the 11:00 slot slips, this row becomes a real stockout and needs a different move.'],
    inbound: null,
    campuses: [
      campus('lincoln', 'Lincoln', 'Wards', 16, 18, [6, 6, 6, 5, 4, 4, 3, 3, 2, 2, 2, 2]),
      campus('west', 'West', 'Wards', 14, 9, [3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1]),
      campus('lakeside', 'Lakeside', 'Wards', 11, 6, [2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1]),
    ],
    lots: [
      { id: 'KCL-BAG', vials: 41, status: 'Released', where: 'Premix, all campuses' },
      { id: 'KCL-BULK', vials: 120, status: 'Released', where: 'Bulk vials · not dispensable as premix' },
    ],
    links: [
      {
        id: 'bulk',
        kind: 'Stock',
        title: 'Bulk vials',
        meta: 'On the shelf',
        body: 'A quantity report that includes bulk will show this drug as healthy. The wards cannot hang a bulk vial.',
      },
      {
        id: 'room',
        kind: 'Capacity',
        title: 'Clean room',
        meta: 'Next slot 11:00',
        body: 'The slot is already 70% booked. This row is asking for sequence, not for a purchase order.',
      },
      {
        id: 'wave',
        kind: 'Demand',
        title: '07:00 wave',
        meta: 'Elective replacements',
        body: 'Part of the morning burn is scheduled replacement, not stat. That part can wait for the slot.',
      },
      {
        id: 'node',
        kind: 'Worst node',
        title: 'Lincoln wards',
        meta: '18 patients',
        body: 'Lincoln is first. West and Lakeside follow for the same reason, so borrowing between them does not help.',
      },
    ],
    actions: [
      {
        id: 'sequence',
        drugId: 'potassium',
        kind: 'scale',
        label: 'Move elective replacements to 11:00',
        summary: 'Hold the premix that stat orders will need. Compound the rest at the slot.',
        draft: 'Sequencing elective potassium replacements to the 11:00 clean-room slot. Stat orders keep current premix.',
        campusId: 'lincoln',
        factor: 0.5,
        buckets: 2,
        patientsNote: 'No transfer. The other campuses are short of bags too.',
      },
      {
        id: 'note',
        drugId: 'potassium',
        kind: 'note',
        label: 'Leave the sequence alone',
        summary: 'Accept the tighter morning and keep the slot as posted.',
        draft: 'Not moving the elective replacements. Premix stays first-come until the 11:00 slot.',
      },
    ],
    recommendedActionId: 'sequence',
  },
  {
    id: 'saline',
    drug: 'Sodium chloride',
    form: '0.9% · 1000 mL',
    status: 'open',
    kindLabel: 'Volume',
    owner: 'Central',
    move: 'Sequence elective hydration',
    question: 'Which elective hydration can move to the afternoon without touching emergency and infusion?',
    confidence: 0.74,
    confidenceWhy: 'Ward usage is steady. Same-day surgery added two rooms this week and the burn may still be low.',
    lockedPatients: 0,
    reasons: [
      'This is a volume problem. No campus is a donor; they move together.',
      'Emergency, labor, and infusion are not the flexible part. Elective hydration is.',
      'The patient count is large. The cover still sits above the drugs that miss a therapy window today.',
    ],
    gaps: ['Two added surgery rooms may not be fully in the demand series yet.'],
    inbound: { campusId: 'lincoln', bucket: 4, qty: 200, label: 'Wholesale · +24h' },
    campuses: [
      campus('lincoln', 'Lincoln', 'House-wide', 80, 40, [30, 28, 24, 16, 12, 10, 8, 8, 6, 6, 4, 4]),
      campus('west', 'West', 'House-wide', 70, 30, [16, 14, 12, 10, 8, 6, 6, 4, 4, 4, 3, 3]),
      campus('lakeside', 'Lakeside', 'House-wide', 48, 25, [10, 8, 8, 6, 5, 4, 4, 3, 3, 2, 2, 2]),
      campus('childrens', "Children's", 'House-wide', 36, 20, [6, 5, 5, 4, 4, 3, 3, 2, 2, 2, 1, 1]),
    ],
    lots: [
      { id: 'NS-1L', vials: 234, status: 'Released', where: 'All campuses' },
      { id: 'NS-PO', vials: 200, status: 'In transit', where: 'Wholesale · +24h' },
    ],
    links: [
      {
        id: 'flex',
        kind: 'Demand',
        title: 'Elective hydration',
        meta: 'Movable',
        body: 'Pre-procedure hydration for afternoon cases can shift with the case. Emergency and infusion cannot.',
      },
      {
        id: 'volume',
        kind: 'Pattern',
        title: 'No donor campus',
        meta: 'System moves together',
        body: 'A transfer from West to Lincoln wins a few hours and recreates the same row tomorrow at West.',
      },
      {
        id: 'rank',
        kind: 'Rank',
        title: 'High volume, later zero',
        meta: 'Above the floor',
        body: 'If this board were sorted by patients, saline would outrank cisplatin. That is the wrong morning.',
      },
      {
        id: 'inbound',
        kind: 'Inbound',
        title: '+24h',
        meta: '200 bags',
        body: 'The truck helps tomorrow. It does not change which cases should move this afternoon.',
      },
    ],
    actions: [
      {
        id: 'sequence',
        drugId: 'saline',
        kind: 'scale',
        label: 'Move elective hydration later',
        summary: 'Shift the flexible cases so Lincoln reaches the +24h delivery.',
        draft: 'Moving elective hydration out of the morning draw. Emergency, labor, and infusion stay as scheduled.',
        campusId: 'lincoln',
        factor: 0.6,
        buckets: 2,
        patientsNote: 'Lincoln is the worst node. The other campuses are the same pattern, one step behind.',
      },
      {
        id: 'note',
        drugId: 'saline',
        kind: 'note',
        label: 'Do not resequence',
        summary: 'Cover is above the floor. Record the choice to leave it.',
        draft: 'Leaving saline on the current schedule. Cover stays above the floor through the wave.',
      },
    ],
    recommendedActionId: 'sequence',
  },
  {
    id: 'zosyn',
    drug: 'Piperacillin-tazobactam',
    form: '4.5 g vial',
    status: 'open',
    kindLabel: 'Demand spike',
    owner: 'ICU',
    move: 'Hold for cultures',
    question: 'Is the overnight spike real enough to move stock, or is it two cultures that may de-escalate?',
    confidence: 0.66,
    confidenceWhy: 'Two ICU starts are culture-pending. The burn treats both as full courses until someone says otherwise.',
    lockedPatients: 0,
    reasons: [
      'Cover is above the floor. The spike is two overnight admissions, not a supplier failure.',
      'Both patients can de-escalate by late morning. Moving stock on that guess is hard to undo.',
      'Confidence is the lowest on the board. That is the reason the recommended move is to wait.',
    ],
    gaps: ['Cultures are due by 11:00. A third ICU start before then should reopen the choice.'],
    inbound: null,
    campuses: [
      campus('lincoln', 'Lincoln', 'ICU', 18, 7, [6, 6, 7, 5, 4, 3, 3, 2, 2, 2, 2, 1]),
      campus('west', 'West', 'ICU', 16, 4, [3, 3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1]),
      campus('lakeside', 'Lakeside', 'ICU', 10, 2, [2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
    ],
    lots: [{ id: 'PIP-45', vials: 44, status: 'Released', where: 'ICU satellites' }],
    links: [
      {
        id: 'cultures',
        kind: 'Signal',
        title: 'Two pending cultures',
        meta: 'Due 11:00',
        body: 'The model counts a full course for each. If both narrow, this row leaves the board without a transfer.',
      },
      {
        id: 'confidence',
        kind: 'Model',
        title: '0.66',
        meta: 'Lowest on the queue',
        body: 'Low confidence is not a decoration. It is why a legal-looking transfer is the wrong default.',
      },
      {
        id: 'icu',
        kind: 'Service',
        title: 'Lincoln ICU',
        meta: '7 patients',
        body: 'Five are on established courses. The uncertainty is concentrated in two new starts.',
      },
      {
        id: 'donor',
        kind: 'Campus',
        title: 'West ICU',
        meta: 'Possible donor',
        body: 'West can give vials. Doing it before 11:00 spends a favor the cultures may make unnecessary.',
      },
    ],
    actions: [
      {
        id: 'hold',
        drugId: 'zosyn',
        kind: 'note',
        label: 'Hold until 11:00 cultures',
        summary: 'Do not move stock on a spike that may de-escalate.',
        draft: 'No transfer. Recheck at 11:00 when the two pending cultures post. A third ICU start before then reopens this.',
      },
      {
        id: 'transfer',
        drugId: 'zosyn',
        kind: 'transfer',
        label: 'Transfer West → Lincoln anyway',
        summary: 'Move vials now if the wait is not acceptable.',
        draft: 'Transferring West piperacillin-tazobactam to Lincoln ICU before cultures. The spike may still de-escalate.',
        from: 'west',
        to: 'lincoln',
        qty: 6,
      },
    ],
    recommendedActionId: 'hold',
  },
  {
    id: 'fentanyl',
    drug: 'Fentanyl',
    form: '50 mcg/mL',
    status: 'open',
    kindLabel: 'Chain of custody',
    owner: 'OR',
    move: 'Witness count only',
    question: 'Is there a shortage, or only a count that has to be witnessed?',
    confidence: 0.97,
    confidenceWhy: 'Safe counts were witnessed at 04:20. This number is a count, not a forecast.',
    lockedPatients: 0,
    reasons: [
      'The count matches. Cover is inside the day and above the floor.',
      'A transfer between safes is a two-person procedure. This screen cannot complete it.',
      'The row stays on the queue until the morning lead confirms the trays, so it is not mistaken for a stockout.',
    ],
    gaps: ['None on quantity. The open item is the witness, not the vial.'],
    inbound: null,
    campuses: [
      campus('west', 'West', 'OR', 10, 5, [3, 3, 3, 4, 2, 2, 2, 1, 1, 1, 1, 1]),
      campus('lincoln', 'Lincoln', 'OR', 16, 4, [2, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1]),
    ],
    lots: [
      { id: 'FEN-W', vials: 10, status: 'Released', where: 'West OR safe' },
      { id: 'FEN-L', vials: 16, status: 'Released', where: 'Lincoln OR safe' },
    ],
    links: [
      {
        id: 'count',
        kind: 'Count',
        title: 'Witnessed 04:20',
        meta: 'Matches',
        body: 'Night lead and the OR charge signed the count. There is no variance to investigate.',
      },
      {
        id: 'rule',
        kind: 'Control',
        title: 'Two-person move',
        meta: 'Not on this screen',
        body: 'Moving a controlled substance needs a witness at the safe. A commit here cannot be that signature.',
      },
      {
        id: 'trays',
        kind: 'Use',
        title: 'Emergency trays',
        meta: 'Protected',
        body: 'Trays stay stocked. Elective blocks draw second. That rule is already in effect; this row confirms it.',
      },
      {
        id: 'why',
        kind: 'Queue',
        title: 'Why it is listed',
        meta: 'So it is not “solved” by a slider',
        body: 'A shortage board that offers a transfer for every row will eventually be used on a drug that does not allow one.',
      },
    ],
    actions: [
      {
        id: 'confirm',
        drugId: 'fentanyl',
        kind: 'note',
        label: 'Confirm trays, no transfer',
        summary: 'Record the witness status. Leave the safes as they are.',
        draft: 'Count matches the 04:20 witness. No transfer. Emergency trays stay protected.',
        patientsNote: 'A move between safes has to happen at the safe, with a second person.',
      },
    ],
    recommendedActionId: 'confirm',
  },
  {
    id: 'carboplatin',
    drug: 'Carboplatin',
    form: '10 mg/mL vial',
    status: 'open',
    kindLabel: 'Tight alternative',
    owner: 'Oncology',
    move: 'Hold as backup',
    question: 'If cisplatin patients switch here, which campus breaks first?',
    confidence: 0.88,
    confidenceWhy: 'On-hand is this morning’s count. The risk is not current burn. It is a switch that has not been ordered.',
    lockedPatients: 0,
    reasons: [
      'Lakeside is the tight campus. It is also the stock a cisplatin switch would draw on.',
      'Nothing on today’s carboplatin book misses the floor.',
      'The row exists so the cisplatin decision can see its neighbor before it borrows.',
    ],
    gaps: ['No switch is ordered yet. The extra burn appears only if cisplatin takes that path.'],
    inbound: null,
    campuses: [
      campus('lakeside', 'Lakeside', 'Oncology', 18, 6, [7, 6, 8, 5, 4, 3, 3, 2, 2, 2, 1, 1]),
      campus('lincoln', 'Lincoln', 'Oncology', 24, 5, [4, 4, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1]),
      campus('west', 'West', 'Oncology', 12, 2, [2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1]),
    ],
    lots: [{ id: 'CAR-10', vials: 54, status: 'Released', where: 'Oncology pharmacies' }],
    links: [
      {
        id: 'neighbor',
        kind: 'Neighbor',
        title: 'Cisplatin',
        meta: 'Protocol-locked overlap',
        body: 'Carboplatin is the substitute people reach for. It is not equivalent for the nine germ-cell patients, and it is not free for the rest.',
      },
      {
        id: 'node',
        kind: 'Worst node',
        title: 'Lakeside',
        meta: 'Tight, not failing',
        body: 'Above the floor this morning. A modest extra draw in the next 18 hours is enough to push it through.',
      },
      {
        id: 'use',
        kind: 'Book',
        title: 'Own patients',
        meta: '13 across campuses',
        body: 'This drug has its own book. Treating it as spare cisplatin stock double-commits the same vials.',
      },
      {
        id: 'hold',
        kind: 'Posture',
        title: 'Hold',
        meta: 'Until cisplatin is decided',
        body: 'The useful act is to keep this row visible while cisplatin is open, then dismiss it if the transfer path is taken.',
      },
    ],
    actions: [
      {
        id: 'hold',
        drugId: 'carboplatin',
        kind: 'note',
        label: 'Hold until cisplatin is decided',
        summary: 'Do not volunteer this stock. Keep the row on the queue.',
        draft: 'Holding carboplatin as a visible constraint while the cisplatin move is open. Not transferring.',
      },
      {
        id: 'dismiss',
        drugId: 'carboplatin',
        kind: 'dismiss',
        label: 'Dismiss from the queue',
        summary: 'The cisplatin path did not borrow. This row can leave.',
        draft: 'Dismissing carboplatin. The cisplatin decision did not draw on it.',
      },
    ],
    recommendedActionId: 'hold',
  },
  {
    id: 'albumin',
    drug: 'Albumin',
    form: '25% · 50 mL',
    status: 'open',
    kindLabel: 'Slow burn',
    owner: 'Central',
    move: 'Dismiss',
    question: 'Is a small vial count the same thing as a short morning?',
    confidence: 0.95,
    confidenceWhy: 'Usage is stable across eight weeks. There is no inbound and no quarantine in play.',
    lockedPatients: 0,
    reasons: [
      'Six vials at Lincoln look worse than cisplatin’s eighteen if you sort by quantity.',
      'The burn is slow. Cover runs past the 72-hour window.',
      'It stays on All so that comparison is available, and off the open queue so it does not compete with the wave.',
    ],
    gaps: ['A bleeding protocol added today would change this. Nothing on the book suggests one.'],
    inbound: null,
    campuses: [
      campus('lincoln', 'Lincoln', 'House', 6, 3, [0.4, 0.3, 0.3, 0.3, 0.3, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2]),
      campus('west', 'West', 'House', 5, 1, [0.3, 0.2, 0.2, 0.2, 0.2, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1]),
    ],
    lots: [{ id: 'ALB-25', vials: 11, status: 'Released', where: 'Lincoln and West' }],
    links: [
      {
        id: 'count',
        kind: 'Count',
        title: '6 vials',
        meta: 'Lincoln',
        body: 'This is the number a low-stock report would shout about. It is the wrong number for this morning.',
      },
      {
        id: 'burn',
        kind: 'Burn',
        title: 'Slow',
        meta: 'Past 72h',
        body: 'Hours-to-zero, using the wave, is the rank. Vials show up once the drug is opened, where they can be read next to the curve.',
      },
      {
        id: 'queue',
        kind: 'Queue',
        title: 'Not on Open',
        meta: 'On All',
        body: 'The open queue is the set that can miss the floor or the truck. Albumin is neither.',
      },
      {
        id: 'dismiss',
        kind: 'Act',
        title: 'Dismiss',
        meta: 'Optional',
        body: 'Dismissing it records that someone looked. Leaving it on All is also fine.',
      },
    ],
    actions: [
      {
        id: 'dismiss',
        drugId: 'albumin',
        kind: 'dismiss',
        label: 'Dismiss from the morning',
        summary: 'Record that the low count was seen and is not a wave problem.',
        draft: 'Dismissing albumin. Six vials, cover past 72 hours. Not a morning move.',
      },
    ],
    recommendedActionId: 'dismiss',
  },
  {
    id: 'epinephrine',
    drug: 'Epinephrine',
    form: '1 mg/mL syringe',
    status: 'reviewed',
    kindLabel: 'Recorded',
    owner: 'ED',
    move: 'Recorded overnight',
    question: 'Did the overnight transfer leave both EDs above the floor?',
    confidence: 0.9,
    confidenceWhy: 'The transfer was scanned into both satellites at 22:40. This is no longer a forecast.',
    lockedPatients: 0,
    reasons: [
      'West ED was under the floor after two codes. Lakeside sent 40 syringes at 22:14.',
      'Both campuses now clear the day.',
      'The row stays in the log so the morning lead does not repeat it.',
    ],
    gaps: [],
    inbound: null,
    campuses: [
      campus('west', 'West', 'ED', 48, 6, [4, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1, 1]),
      campus('lakeside', 'Lakeside', 'ED', 22, 3, [2, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
      campus('lincoln', 'Lincoln', 'ED', 30, 4, [3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1]),
    ],
    lots: [{ id: 'EPI-1', vials: 100, status: 'Released', where: 'ED satellites' }],
    links: [
      {
        id: 'move',
        kind: 'Decision',
        title: '40 syringes',
        meta: 'Lakeside → West',
        body: 'Committed by the night lead at 22:14. The stock in this view is the stock after that move.',
      },
      {
        id: 'west',
        kind: 'Campus',
        title: 'West ED',
        meta: 'Recovered',
        body: 'Two codes drew the trays down. The transfer put the day back above the floor.',
      },
      {
        id: 'lakeside',
        kind: 'Campus',
        title: 'Lakeside ED',
        meta: 'Still covered',
        body: 'The donor campus was checked against the same floor. It stayed above it.',
      },
      {
        id: 'log',
        kind: 'Log',
        title: 'Do not repeat',
        meta: 'Morning inherits the note',
        body: 'Without the log, the 05:14 queue would propose the same transfer to a person who did not hear the huddle.',
      },
    ],
    actions: [
      {
        id: 'note',
        drugId: 'epinephrine',
        kind: 'note',
        label: 'Leave the overnight move',
        summary: 'No further transfer.',
        draft: 'Overnight transfer stands. No further epinephrine move this morning.',
      },
    ],
    recommendedActionId: 'note',
    recorded: {
      at: 'Tue 20 Oct · 22:14',
      summary: '40 syringes · Lakeside → West',
    },
  },
  {
    id: 'ceftriaxone',
    drug: 'Ceftriaxone',
    form: '1 g vial',
    status: 'reviewed',
    kindLabel: 'Dismissed',
    owner: 'Medicine',
    move: 'Dismissed overnight',
    question: 'Was the overnight alert a shortage, or a model counting discharged patients?',
    confidence: 0.8,
    confidenceWhy: 'The night lead reconciled the book against the census at 01:02. Discharged patients were still on the burn.',
    lockedPatients: 0,
    reasons: [
      'The model counted patients who had already left.',
      'On-hand covers the remaining book through the window.',
      'The dismiss is a decision. Otherwise the same alert returns at 05:14 with no memory.',
    ],
    gaps: [],
    inbound: null,
    campuses: [
      campus('lincoln', 'Lincoln', 'Medicine', 40, 9, [4, 4, 3, 3, 3, 2, 2, 2, 2, 1, 1, 1]),
      campus('west', 'West', 'Medicine', 28, 5, [3, 2, 2, 2, 2, 1, 1, 1, 1, 1, 1, 1]),
    ],
    lots: [{ id: 'CEF-1', vials: 68, status: 'Released', where: 'Medicine satellites' }],
    links: [
      {
        id: 'model',
        kind: 'Model',
        title: 'Discharged patients',
        meta: 'Removed at 01:02',
        body: 'The burn had not dropped them. The night lead did. That correction is why this row is quiet.',
      },
      {
        id: 'cover',
        kind: 'Cover',
        title: 'Above the floor',
        meta: 'Remaining book',
        body: 'What is left on the census is covered. The alert was the model, not the shelf.',
      },
      {
        id: 'memory',
        kind: 'Log',
        title: 'Dismissed',
        meta: 'With a reason',
        body: 'A dismiss without a sentence would look like an ignore. The sentence says the census was wrong.',
      },
      {
        id: 'morning',
        kind: 'Queue',
        title: 'Not reopened',
        meta: 'Reviewed',
        body: 'Reviewed rows stay out of the open queue unless a new decision puts them back.',
      },
    ],
    actions: [
      {
        id: 'note',
        drugId: 'ceftriaxone',
        kind: 'note',
        label: 'Keep the dismiss',
        summary: 'No new move.',
        draft: 'Overnight dismiss stands. Census correction still looks right.',
      },
    ],
    recommendedActionId: 'note',
    recorded: {
      at: 'Wed 21 Oct · 01:02',
      summary: 'Dismissed · model counted discharges',
    },
  },
]

export const SEED: Decision[] = [
  {
    id: 'seed-epi',
    drugId: 'epinephrine',
    drug: 'Epinephrine',
    at: 'Tue 20 Oct · 22:14',
    author: 'Night lead',
    actionLabel: 'Transfer Lakeside → West',
    detail: '40 syringes. West back above the floor. Lakeside stayed above it.',
    rationale: 'West ED trays were under the floor after two codes. Lakeside could give 40 and stay covered.',
    locked: true,
  },
  {
    id: 'seed-cef',
    drugId: 'ceftriaxone',
    drug: 'Ceftriaxone',
    at: 'Wed 21 Oct · 01:02',
    author: 'Night lead',
    actionLabel: 'Dismissed',
    detail: 'No stock moved. Alert traced to discharged patients still on the burn.',
    rationale: 'Reconciled the book against the census. On-hand covers the patients who are still here.',
    locked: true,
  },
]

export function drugById(list: Constraint[], id: string): Constraint | undefined {
  return list.find((drug) => drug.id === id)
}

export function chartCaption(name: string, hours: number, inboundHour: number | null): string {
  if (hours >= 72) return `${name} stays covered across the 72-hour window.`
  const base = `${name} hits zero at ${formatHours(hours)}.`
  if (inboundHour == null) return base
  if (inboundHour > hours + 0.05) {
    return `${base} Inbound at +${inboundHour}h lands after the stockout.`
  }
  return `${base} Inbound at +${inboundHour}h lands while stock remains.`
}
