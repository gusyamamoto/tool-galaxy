# Branch-local terminal labels

Normal semantic-label handoffs retain their tuned zoom ranges. A label with no
deeper semantic role in its own descendant branch keeps its ordinary smooth
entrance, but omits the outgoing fade. This is eligibility, not a visibility
override: viewport checks, collision suppression, density hysteresis and existing
selected/hovered/searched/focused priorities still apply. Constellation lens
disclosure remains separate.

`cosmosView.terminalLabelIds(entries)` derives a disposable Set from canonical
parent IDs and semantic roles in one iterative bottom-up O(n) pass. It considers
all descendants, including same-role intermediate nodes. No stored fields or
parallel hierarchy are introduced. `rebuildHierarchyPaths()` refreshes the Set on
initial load and the existing CRUD/restore hierarchy-publication path. Thus
create, delete, Move, duplicate and loaded/imported snapshots refresh eligibility.
Zoom, pan and physics renders use Set lookups and precomputed per-role entrance
opacities; they do not traverse the hierarchy. Only terminal nodes receive a
label-opacity CSS override, removed as soon as they acquire a deeper role.
Ordinary density priority uses the resulting semantic opacity with the existing
formula and role tie break. Body styles, forces, positions, Fit and focus framing
are unchanged.

Local checks:

```powershell
node --test tests/terminal-labels.test.js tests/cosmos-view.test.js tests/label-density.test.js
python -B tests/browser-check.py --terminal-labels-only --screenshots
python -B tests/browser-check.py --semantic-handoff-only --semantic-handoff-size 150
python -B tests/browser-check.py --semantic-handoff-only --semantic-handoff-size 325
```

The isolated browser scene contains 325 ordinary bodies plus mixed-depth branches.
It checks deep-to-shallow panning without changing scale, terminal labels at every
role, overlapping-label suppression, existing priorities, no hierarchy rebuilds
during camera work, real CRUD cache invalidation, and persisted reload. Mobile
widths 360/390/430, landscape and desktop are covered. These are desktop-browser
emulations; actual phone smoothness and dense-scene legibility need device review.
