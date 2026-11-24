# Docket walkthrough narration

Read by `scripts/record-walkthrough.mts`. Everything below `# Narration` is one
`## key` section per scene. The text is what the captions show; before it goes
to the voice, the recorder respells a few words (GSTIN becomes "G S T I N",
JSON becomes "jay-son", Socket.IO becomes "Socket I O" and so on, see `SAY` in
the script). A sentence starting with `~` is caption only: it
is shown for 2.5 to 3 seconds in silence. Each other sentence is synthesised on its own so its caption appears
exactly when it is spoken.

## Feature inventory

Every item appears on screen at least once.

1. Sign in: "Continue as reviewer" and "Continue as admin" demo buttons, plus email and password form
2. Roles: reviewers review and approve; only admins see System health (nav link and route are role-gated)
3. Upload by file: drop zone or "Choose a file" (PNG, JPG, WEBP, PDF page one, up to 10 MB)
4. Too-small rejection: an image under 600 px wide is refused with a plain explanation
5. Six sample documents, each built to show a different problem
6. Recently uploaded list on the upload page
7. Live pipeline: Uploaded, Reading text (OCR % bar and scan line), Extracting fields, Validating, Ready, with real per-stage timings over Socket.IO
8. Review screen: page with a box over every value read, fields with OCR confidence
9. Field to page: hovering a field draws a leader line to its box on the page
10. Page to field: clicking a box on the page selects its field
11. Flags: low-confidence and not-found fields marked in red with an explanation
12. Line items extracted and linked to their row on the page
13. Raw OCR text toggle
14. Checks panel: GSTIN check digit (mod 36), impossible date, line items vs subtotal, CGST = SGST, GST rate, totals add up
15. Correcting a field (Enter saves), checks re-run instantly
16. History / audit trail: who changed what, from and to, when
17. Approve: gated until flagged fields are handled; approval stamp with name and date
18. Approve with a written note when a check fails because the original is misprinted
19. Documents list: status, total, what needs attention per row
20. Status filters with counts (All, Needs review, Processing, Approved, Could not read)
21. Search as you type (supplier, GSTIN, invoice number, file name)
22. Export approved data as CSV and as JSON (with line items)
23. Sign out and sign in as admin
24. System health: service status, documents in 24 h, error rate, average time, queue length
25. Average time per stage with slowest 5% tick, documents finished per hour chart
26. Recent structured service logs with service and level filters
27. Phone layout: top bar menu, document above fields, tap a field to pulse its spot on the page

## Chapter plan

| # | Chapter | Scenes | Features |
| --- | --- | --- | --- |
| – | Intro card | intro | – |
| 01 | Sign in and roles | signin, signin2 | 1, 2 |
| 02 | Upload | upload, small, samples | 3, 4, 5, 6 |
| 03 | Live OCR pipeline | pick, pipeline, pipeline2 | 7 |
| 04 | Every value points to the page | review … review5 | 8–13 |
| 05 | Automatic checks | checks … checks4 | 14 |
| 06 | Correct and approve | fix, fix2, approve, note | 15–18 |
| 07 | Find and export | docs, docs2, docs3, export, export2 | 19–22 |
| 08 | System health | admin, health, logs | 2, 23–26 |
| 09 | On a phone | phone | 27 |
| – | Recap and outro cards | recap, outro | – |

# Narration

## intro
~Hi, I'm Gaurang Prajapati. This is Docket. It reads invoices and receipts, checks the GST maths, and hands your accounts team clean, approved data.

## signin
Everything starts at sign in. There are two roles. Reviewers check and approve documents. Admins can also see how the system is running.

## signin2
There's a normal email and password form too. Passwords are hashed with bcrypt, the auth service issues a signed token, and the gateway checks the role on every request.

## upload
This is the intake page. Drop in a PNG, JPG, WEBP or PDF, up to 10 MB.

## small
If someone uploads a tiny image, Docket refuses it straight away and says why, instead of guessing at text it can't read.

## samples
There are also six sample documents. Each one tests something different: a clean scan, a paid stamp over the total, a bad GSTIN, an impossible date.

## pick
I'll pick the spice trader's invoice. Someone stamped it paid, right over the totals.

## pipeline
Now watch the pipeline. The upload goes into a job queue in Postgres. A separate OCR worker picks it up, reads the page with Tesseract, pulls out the fields, and checks them.

## pipeline2
Each step appears the moment it finishes, pushed to the browser over Socket.IO, with real timings. Nobody has to refresh.

## review
This is the review screen. The page on the left has a box over every value Docket read. The fields on the right show how sure the OCR was.

## review2
Hover any field, and a line draws to the exact spot on the page it came from. A reviewer never has to hunt for a number.

## review3
It works the other way too. Click a box on the page, and its field is selected, ready to edit.

## review4
Anything uncertain is flagged in red. The CGST was hard to read. The total is hidden under the stamp, so Docket says it wasn't found, rather than inventing one.

## review5
Line items are pulled out of the table, each linked to its row on the page. And the raw OCR text is one click away.

## checks
Reading is only half the job. Every document then goes through business checks, written as plain rules with unit tests.

## checks2
This freight bill looks fine at a glance. But the supplier's GSTIN fails its check digit. Docket recalculates it the way the tax system does, and knows it should end in J.

## checks3
And the invoice date is 31 February. That date doesn't exist.

## checks4
On this printing invoice, the three line items add up to a hundred rupees less than the printed subtotal. A person typing it in would never notice. Docket does.

## fix
Back to the spice invoice. I type in the right amounts from the paper, and each correction is saved when I press Enter.

## fix2
The checks run again instantly, and they all pass now. The history records every change: who made it, the old value, and the new one.

## approve
Now I approve it. Docket stamps it with who approved it and when, and it joins the export.

## note
If a check fails because the original bill really is misprinted, the reviewer can still approve it, but only with a written note. That note goes into the history too, for the auditors.

## docs
Every document lives in one list. Each row shows the status, the total, and what still needs attention.

## docs2
I can filter by status, for example, everything that still needs review.

## docs3
Or search by supplier, GSTIN or invoice number. Results update as I type.

## export
Approved invoices export as CSV, ready for the accounting software.

## export2
Or as JSON, with the line items included, for other systems.

## admin
Now the admin side. I sign out and come back as an admin, which unlocks the System health page. Reviewers can't open it at all.

## health
It shows each service's status, documents read today, the error rate, and how long every stage takes, including the slowest five percent.

## logs
Below are the structured logs from all three services, in one place. I can filter by service or by level to find a problem fast.

## phone
And it all works on a phone. The menu folds into a top bar, the document sits above its fields, and tapping a field highlights its spot on the page.

## recap
So that's Docket. Real OCR, every value linked back to the page, GST checks that catch real mistakes, a full audit trail, and clean exports.

## outro
~I'm Gaurang Prajapati, a full-stack developer. ~If you need a system like this, I'm available for freelance work.
