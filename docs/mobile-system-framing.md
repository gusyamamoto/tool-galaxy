# Mobile system framing

Mobile focus frames the complete canonical family of any parent CB inside the current usable canvas, from Galaxy/Sun through Planet, Moon and deeper parents. A single canvas tap still selects without camera navigation. Explicit double-tap and hierarchy/search navigation frame that parent's family; leaf CBs keep their existing point-inspection behavior. Contents stays open, with its active page preserved, when focusing from that surface.

The bottom **Fit** button remains an overall Universe overview, including every active Galaxy and descendant. It does not change into a selected-system command. Galaxy navigation frames that Galaxy's canonical subtree. Desktop keeps its original framing path and commands.

## Previous problem

System navigation used `normalPositions`, which shortens outlying parent-relative offsets for legacy visual footprints. It then made Sun bounds symmetric around the root. That could exclude a distant real child while wasting space on the opposite side. Native-size body/label footprints were also approximated as world-space margins, followed by screen padding on top of the radius-inset `physics.bounds`. The resulting mobile composition was often unnecessarily wide or poorly centered.

## Geometry and family membership

`usableCanvasBounds` is the shared raw rectangle formed by the visual viewport, device safe-area edges, current sidebar, Compact card and settled Contents sheet edge. Safe-area values are read alongside the existing node-size style snapshot; they are not subtracted again from the sheet edge. Explicit mobile Fit/focus refreshes visual-viewport CSS values and geometry before computing the target. Portrait, landscape, browser-bar changes and keyboard offsets therefore use current bounds. No Contents sizing or interaction is changed.

Family membership uses `galaxyModel.subtreeIds`, including the focused parent itself and every canonical descendant at every depth. Framing snapshots actual current `entry.x/y` values, which are the same world coordinates rendered by the canvas and restored from storage. Manual/pinned descendants and distant dragged children remain included, even if semantic zoom currently hides their detail. Unrelated siblings/ancestors, portal references, cloud footprints and layout reservations do not inflate a family target. No world positions, constraints, forces or saved placements are changed.

## Screen-space policy

Mobile family framing projects its frozen world points and native-size body extents arithmetically. It reuses the existing body caps, overview minima, rings and normal label envelopes. Cached label dimensions, with conservative existing CSS width budgets as fallback, reserve room for names that are eligible at the candidate scale. This does not reveal labels, change density suppression or introduce Fit-only label rules.

There is one 16px screen-space gutter, reduced to 8% of the shorter usable dimension when necessary in restricted landscape space. The projected visual family is centered as a whole rather than forcing the parent to the center of asymmetric descendants. A bounded 40-step camera calculation finds a fitting scale without DOM measurements inside the iterations. Sun/Galaxy focus retains the existing maximum scales of .82/.58; deeper parents use their existing navigation/close-inspection scale as the ceiling. There is no new minimum scale: an honestly distant family can frame below .08, and wheel zoom can return to that scale.

Universe Fit retains its existing actual-world bounds and maximum scale of 1, using the shared raw mobile rectangle and one responsive screen-space gutter. The existing desktop bounds/padding path is unchanged.

If the usable rectangle is less than 120px wide or 96px tall, explicit mobile framing is deferred at the current visible camera position. This avoids an extreme flight into a sidebar/keyboard sliver. Mobile hierarchy navigation still closes Menu View as before; the resulting focus uses the newly available canvas. Where a landscape sidebar leaves sufficient room, Universe Fit uses that remaining region. Close the obstructing UI and invoke Fit/focus again to reframe.

Existing eased camera motion, cancellation and reduced-motion behavior remain. Viewport/UI changes do not create a new automatic framing loop: the next explicit Fit/focus recalculates the target.

## Validation and phone review

Camera unit tests cover projected screen-space extents, asymmetric families, distant descendants, tiny families and unusable viewports. `python -B tests/browser-check.py --mobile-fit-only --screenshots` uses disposable local data to test dense/deep families, a one-Planet system, a Sun alone, a pinned/manual distant child, Compact/Contents/sidebar states, native Sun double-tap, CB switching, orientation/resize, changed visual viewport and synthetic safe insets. It compares actual rendered rectangles to usable bounds and checks world positions, particle constraints and saved placement identity. Existing Contents, semantic-label, viewport-batching and real-body overview suites remain regression checks.

On the phone, navigate to a Sun in dense Sample data, then double-tap that Sun with Contents open on Notes/Files. Confirm that the full family fits above the sheet and the page stays selected. Repeat for a Planet/Moon with descendants, a sparse system, a deliberately distant child, portrait/landscape and changed browser-bar height. A single CB tap remains selection-only; the bottom Fit button remains Universe-wide. Physical-device checks are still needed for visual balance and actual safe-area/browser chrome behavior.
