# Docket design notes

Written before any UI code. The audience is a non-technical viewer watching a
demo: they should understand within seconds that a paper invoice went in and
checked, structured numbers came out.

## Subject and job

Docket reads invoices and receipts from small businesses and turns them
into checked data an accountant can trust. Its world is the accounts office:
columnar ledger pads, blue-black ink, the editor's blue pencil, the auditor's
red pencil, the rubber "approved" stamp. Those materials drive every visual
choice below.

Primary job of each screen:

| Screen | Job |
| --- | --- |
| Sign in | Get in with one click as a reviewer or an admin |
| Upload | Drop a file or pick a sample, nothing else competes |
| Pipeline | Show the document being read, stage by stage, live |
| Review | Prove every number by pointing at where it came from |
| Documents | Find a document by name, number or status; export approved data |
| System health | Show that the services are fast, busy and not failing |

## Palette

Light theme. The ground is the pale green of a columnar accounting pad rather
than cream or grey, and the documents sit on it as pure white sheets.

| Name | Hex | Role |
| --- | --- | --- |
| Ledger paper | `#EDF1EC` | App background, the "desk" under documents |
| Sheet | `#FFFFFF` | Documents, panels, inputs |
| Blue-black ink | `#1B2733` | Body text, headings, primary buttons |
| Ledger rule | `#C9D6CC` | Hairlines, table rules, input borders |
| Blue pencil | `#2851C8` | Selection, focus ring, links, leader lines |
| Red pencil | `#C2333A` | Flagged fields, failed checks, errors |

Supporting tones: Graphite `#5A6570` for secondary text (passes 4.5:1 on both
grounds), Stamp violet `#5A3E9E` used only for the approved stamp, and pale
tints of blue and red pencil (`#E7EDFB`, `#FBE9EA`) for highlighted rows.

## Type

- **Source Serif 4** (variable, optical sizes): page titles, document names,
  the wordmark. Set at moderate contrast and weight 600, never italic for
  emphasis. It gives the editorial, printed-form voice.
- **Public Sans**: all interface text, labels, buttons and numbers. A sturdy
  civic sans that reads like a well-made form. Amounts always use
  `font-variant-numeric: tabular-nums` so columns of rupees line up.
- **IBM Plex Mono**: only for the raw OCR text panel, where showing machine
  output literally is the point. Not used for labels.

Scale (1.25 ratio, 16px base): 12.8 / 14 / 16 / 20 / 25 / 31 / 39. Body line
height 1.5; serif titles 1.15. Labels are sentence case at 14px weight 500 in
Graphite; no all-caps, no letter-spaced eyebrows.

## Layout

App shell: a single top bar on Sheet with a bottom Ledger rule. Wordmark left,
three text links, the signed-in user and role on the right. Content is left
aligned on a 1200px column; the review screen breaks out to full width.

```
+--------------------------------------------------------------------+
| Docket   Upload  Documents  System health          Asha (reviewer) |
+--------------------------------------------------------------------+
```

Sign in: split. Left, a real sample invoice at a slight angle with three
fields already marked in blue pencil, showing the product before a word is
read. Right, two big role buttons and a small email form.

```
+-------------------------------+------------------------------+
|   [invoice sheet, marked]     |  Docket                      |
|                               |  Sign in to review documents |
|                               |  [ Continue as reviewer    ] |
|                               |  [ Continue as admin       ] |
|                               |  or use email and password   |
+-------------------------------+------------------------------+
```

Upload: one large dashed drop area (dashes in Ledger rule like a tear-off
line), then a row of sample sheets as small paper thumbnails, then "Recently
uploaded" as a ledger table.

Pipeline: the document on the desk at left with a blue scan line moving down
it while text is read; at right a numbered list of the five stages (this is a
real sequence, so numbers are earned) with live timings and an OCR progress
figure.

```
+----------------------------+---------------------------------+
|                            | 1 Uploaded            0.1 s  ✓  |
|   [sheet, scan line ---]   | 2 Reading text        64%  ...  |
|                            | 3 Extracting fields             |
|                            | 4 Validating                    |
|                            | 5 Ready for review              |
+----------------------------+---------------------------------+
```

Review (the hero is the document):

```
+------------------------------------------+-------------------------+
|                                          | Field          Value  % |
|   [sheet with boxes]  o-----------------------  Invoice no  ...    |
|                                          | Total       ₹ 4,720  ! |
|                                          | Checks: 3 of 4 passed  |
|                                          | [ Approve ]            |
+------------------------------------------+-------------------------+
```

Documents: a ledger table (rules, not cards), search input and status filter
as a row of text toggles above it, export buttons at the right.

System health: four plain figures in a row separated by rules (not cards), a
horizontal bar chart of average time per stage, an hourly throughput strip,
and a log table.

Phone width: everything stacks into one column; on review the document comes
first and the field list follows; leader lines are replaced by tap-to-scroll
and a pulse on the box.

## Signature element: blue-pencil leader lines

When a field on the right is hovered, focused or selected, a thin Blue pencil
line is drawn from that row across the gutter to the exact box on the
document where the value was read, ending in a small dot, like a proofreader's
margin note. The box itself is outlined in the same pencil. Flagged fields are
ringed in Red pencil on the sheet at all times, so problems are visible before
any interaction. Clicking a box on the document does the reverse: it selects
and focuses the field. Everything else on the screen stays quiet so this
connection is the memorable moment.

The approved state gets a small Stamp violet "Approved" stamp on the sheet with
the reviewer's name and date: the one piece of whimsy, and it carries data.

## Principles

1. The document is evidence. Every extracted value can point at its source.
2. Rules, not boxes. Structure comes from ledger hairlines and alignment, not
   from cards with shadows. Radius is 2px on inputs and buttons, 0 on sheets.
3. Problems are red pencil and specific: say which check failed and by how much.
4. Numbers are tabular and right aligned, always with the rupee sign.
5. Motion only where something changed: the scan line during OCR, the leader
   line drawing, the stamp landing. All off under reduced motion.
6. Plain copy in sentence case. Buttons say what happens: "Approve document",
   "Save correction", "Export approved as CSV".

## Review against the generic-design checklist

- Cream and terracotta: avoided. Ground is ledger green `#EDF1EC`, accent is
  blue pencil. Changed from my first instinct (warm off-white) because the
  pale green pad is specific to accounting and not a template default.
- Dark navy or neon: avoided, light theme only.
- Identical rounded SaaS cards: avoided. Lists are ledger tables; metrics are
  figures separated by rules. No soft drop shadows except a single crisp
  paper shadow under document sheets.
- All-caps eyebrows, middle-dot meta strings, "→" on buttons: not used.
  Meta lines use commas or separate columns.
- Gradient washes: none.
- Broadsheet trap: hairlines are used, but layout is a tool layout with real
  controls, generous spacing and 2px radius on controls, not dense columns.
- Monospace labels: removed from the first draft (I had planned mono GSTINs);
  mono is only for the raw OCR text where literal output is the content.
- Numbered markers: only on the pipeline, which is a true sequence.
- Single bold move: leader lines. The stamp is small and data-bearing.
