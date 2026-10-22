# Meridian

A working software interface for a morning medication-shortage decision. A pharmacy lead has until the 07:00 dispense wave to move stock across four campuses of a fictional health system, Northshore, or to leave it in place and write down why.

The prototype is the case study. The queue, the chart, and the commit are the same React app.

## Run

```bash
npm install
npm run dev
```

Open the local URL Vite prints. The queue is the front door. The case study is in the left navigation.

## Walk it

1. Read the queue. Three drugs are under a 12-hour floor.
2. Sort by Exposed. Saline jumps ahead of cisplatin. That sort is the wrong morning.
3. Open All and find albumin: six vials, cover past 72 hours, not on the open list.
4. Open cisplatin. The chart starts on Lincoln. Hover West, then pin Lincoln. The inbound lot lands after zero.
5. Shape the move. Try the deferral, then the carboplatin substitution, then the transfer. Step the transfer until West breaks the floor.
6. Insert a draft, edit it, and commit. Cisplatin should leave the critical set. Undo is on the log.
7. Open potassium, then fentanyl. One constraint is a clean-room slot. The other has no slider.

`J` and `K` move the queue. Enter opens a drug. `⌘K` searches. `⌘Enter` commits.

Notes in the left navigation explain the decisions on the screen you are looking at.

## What this is

A scenario prototype. Drug names are real. Counts, lots, campuses, and the health system are fictional. It is not clinical guidance, not a usability study, and not a deployment. The cover math — hours until a campus hits zero, including the morning wave — runs in the interface, not in a slide.

Reset a session from the decision log.
