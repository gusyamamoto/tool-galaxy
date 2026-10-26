# Optional When and Due (Phase 2)

Time is metadata on existing canonical hierarchy entries, not another event
store. Snapshot/backup version stays 5. Missing fields and explicit `null` mean
no date; new edits remove an optional field when its value is cleared. Existing
data needs no migration. Universe is an application context, never a dated entry.

## Canonical values

Normal Items, including Galaxies and arbitrary-depth celestial bodies:

```js
when: {startDate: "2026-11-12", endDate: null, time: null}
when: {startDate: "2026-10-28", endDate: null, time: "14:30"}
when: {startDate: "2026-11-12", endDate: "2026-11-25", time: null}
```

Individual Tasks (direct children of a Task List):

```js
due: {date: "2026-10-29", time: null}
due: {date: "2026-10-29", time: "23:59"}
```

Fields are required within a populated value; extra keys, arrays, strings and
other shapes are rejected. Calendar dates are strict Gregorian `YYYY-MM-DD`,
years 0001–9999, with real month lengths and leap years. Clock values are `null`
or strict 24-hour `HH:MM` (00:00–23:59). A range must end on or after it starts
and must have `time: null`. Equal start/end dates are allowed.

`galaxyModel.temporal` owns canonical validation and localized display. Selected
calendar and clock strings are saved literally, with no instant, offset or
timezone conversion. Display constructs calendar dates from numeric components
at local noon. Clock formatting uses an independent fixed UTC reference purely
to localize the literal clock, so a DST gap cannot change 02:30 to 03:30. This
reference is never stored or combined with the calendar date as an instant.

## Role changes and operations

The current model derives Task status from the parent Task List. Existing Move
supports moving a leaf into/out of a Task List. Both optional fields are
therefore valid on non-Task-List records: a role-changing Move retains dormant
metadata, just as the current model retains completion metadata. Only When is
exposed/edited for a normal Item and only Due for a Task. The fields are never
converted into one another. Moving back exposes the original value again.
Task Lists cannot own populated When or Due values, and show no date control.

Full Copy/Paste deep-copies both fields, including individual Task Due values.
Move preserves both fields exactly. Duplicate Structure uses its existing
allowlist and deliberately omits both fields throughout the copied subtree,
including template Task copies. Archive/unarchive preserves the original
records and their dates. Delete uses the existing subtree/attachment cleanup.

## Editing, persistence and safety

The top of the existing contents scroller contains one secondary When/Due row, with edit and
remove controls. A shared small native date/time dialog handles both roles.
On mobile the secondary row temporarily hides while another content composer
is active, preserving the existing space for its fields and Save/Cancel controls.
Task creation can use that same dialog to set an optional draft Due value;
Canceling Task creation saves nothing, and creation saves name and Due together.
There is no new content tab, sidebar section or canvas date rendering.

`saveEntryTime` uses the application command queue and repository `updateTime`;
the repository evaluates the live snapshot inside its existing exclusive write
lock. Validation precedes commit, and UI publication follows successful commit.
Failures keep the draft/error visible and do not publish optimistic dates.
Stale writes retain the existing Reload contract. No timers, physics callbacks,
render loops, notification logic or search filters were added.

Raw local load and Restore use the canonical validator before normalization.
Malformed dates activate the existing corruption-preservation guard; original
raw data and attachments remain available for recovery. Existing F1–F9 stale
write, local-first, failure, journaling, Restore, object URL, capacity and orphan
audit paths remain responsible for their existing contracts. The normal
snapshot serializer explicitly retains both fields; Backup/Restore includes
them in the existing canonical metadata, with no Time-specific backup format.

The experimental cloud projection independently validates the same shape and
retains both fields in `attributes_json` (parity tested against the model).
Task role/completion fields are retained as well, so dated Tasks round-trip.
The additive `202610250001_time_metadata.sql` migration extends the existing
private validator, without new tables, public RPCs, commands, revision handling
or auth changes. It must accompany a future cloud provisioning/update; nothing
is deployed by this change. Existing older data remains accepted.

## Future consumers and manual review

Upcoming/Calendar can discover dated entries directly from the canonical map,
derive each current role from its parent, and consume the appropriate field.
Dormant fields must not create a second event. No global aggregation, date
search/filtering, calendar view, timezone resolution, recurrence, reminders or
external calendar synchronization is implemented here.

- Desktop Item: open Contents on an Item/Galaxy; Add date, save a date, add a
  time, switch to a date-only range, edit, Cancel an edit, remove, re-add, reload.
- Desktop Task: create a Task with no Due; create another with optional Due;
  open its Contents, add/edit/remove date and time, re-add, reload. Confirm the
  Task List itself has no date control and completion still works.
- Android Chrome and iPhone Safari (also Chrome if used): open both editors,
  exercise native date/time pickers, Save/Cancel, rotate, and verify all fields
  and actions remain reachable with system picker/keyboard visible. Confirm
  narrow portrait has no horizontal overflow. Reload and re-open each object.
- Operations: move a dated Item and Task, full Copy/Paste each, Duplicate
  Structure and check dates are absent, archive/unarchive the Galaxy, then
  Backup/Restore. Originals and full copies retain exact dates; templates do not.
- Two tabs: load the same workspace in both, save a date in one, try an edit in
  the older tab, confirm Reload is required, then reload and verify both values.

Automated Chromium viewport checks supplement physical native-picker testing;
they do not certify iPhone/Android system picker or keyboard behavior.

Focused validation commands:

```powershell
node --test tests/time-data.test.js
python -B tests/browser-check.py --time-data-only --screenshots
python -B tests/time_metadata_database_test.py --pg-bin '<complete PostgreSQL bin directory>'
```

The last command provisions and removes its own temporary loopback-only cluster
with synthetic identities; it never connects to an existing database or cloud.
