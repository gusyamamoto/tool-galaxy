# Mobile Contents browsing

Mobile has two persistent presentation states over the existing inspector:

- **Compact:** the selected-body card. Body taps select without opening Contents. Its centered upward chevron or an upward swipe opens Contents.
- **Contents / Browse:** a content-sized sheet with a Files / Notes / Links / Location dock. Its centered downward chevron or a downward header swipe returns to Compact.

Compact and Contents are the only mobile states. Add, edit and save stay on the
active page and inspected body. Contents always uses adaptive medium-height
sizing and internal overflow; there is no separate workspace control. Existing
dedicated image/file viewers remain available. Desktop keeps its complete
inspector and section order, with shared Links terminology and Save/Cancel text.

Contents uses intrinsic active-page height, with a 200px minimum (limited by the maximum on short screens). Its maximum retains the previous Browse height: `min(max(280px, visibleHeight × .38), visibleHeight × .60)`. Empty pages release the unused canvas; saved content and editors grow the sheet only as needed. Beyond the cap, content scrolls while the header and dock remain outside the scroller. The visual viewport/keyboard changes the available height without adding another presentation state.

Pages align their content to the top, using the same 24px heading and 44px add row. A sheet-border ResizeObserver refreshes shared usable-canvas geometry after page/body switches, content changes and late media loads; it never writes a height or triggers camera framing. Intrinsic adaptive sizing has no resize animation or continuous sizing loop. The bottom dock remains 45px including its divider, with 44px hit targets around a lighter 32px active surface and unchanged 12px labels. The sheet retains a 4px bottom gutter or the full device safe-area inset, whichever is larger. Desktop and Compact spacing are unchanged.

## Pages and controls

Each mobile page starts with a heading followed by the same lightweight 44px add row:

| Page | Heading | Add row |
| --- | --- | --- |
| Files | FILES | Add file… |
| Notes | NOTES | Add note… |
| Links | LINKS | Add link… |
| Location | LOCATION | Add location… |

The active Browse page persists across body selection and sheet transitions. Tapping another exposed body updates the existing inspector, title and selection without closing it. Dragging another body moves it without switching the inspected body. Canvas pan and pinch retain their existing handlers; no overlay covers the exposed canvas.

Files presents existing attachments and Media under one heading, reusing the file picker and attachment pipeline. The celestial-body Add menu still supplies Take Photo, Photo Library / Gallery and Files with their existing routing. Notes opens the existing single-note editor, including when a note already exists. Links uses the existing bookmark input with its Paste-a-link placeholder and validation. Location reuses its entry and saved-location controls. Entry forms replace their add row while active; saved content retains its existing edit/remove behavior. There are no new content types or mobile storage models.

Mobile editors use accessible **Save / Cancel** checkmark/cross actions within
the field container. Their 44px targets remain outside the text scroller in a
reserved 88px column; inputs and textareas never run underneath them. Notes,
Link add/edit and Location use the same geometry and focus treatment. Existing
validation and persistence handlers remain, and Google Maps stays a link.
Desktop retains its contained Save/Cancel text buttons. Selected mobile titles
also support inline rename through this action treatment, with an 8px clean-tap
guard and the existing rename validation. Canvas/tree labels are unchanged.

Compact and Contents share the `cb-action-button` treatment: 44px tap targets around 36px visible surfaces, with identical centered 18px SVG plus/three-dot icons, 6px pair spacing and subtle border/focus/active treatment. Mobile icon geometry does not depend on glyph baselines or letter spacing. Desktop retains its original text glyphs and styling. Names truncate before the buttons; centered sheet chevrons remain separate controls. Menu contents and semantics are unchanged.

## Gesture ownership

Gestures originate only on the compact card or inspector. The existing 10px dead zone, 1.5 axis ratio and 64px completion distance remain. A clear horizontal swipe on noninteractive Browse content selects the adjacent page without wrapping. Dock taps also reach every page; arrow keys, Home and End navigate the dock.

Buttons, links, inputs, media controls and editable fields own their gestures. The sheet chevrons are exceptions for navigation gestures only. Nested horizontal scrollers own horizontal motion. Vertical content-origin gestures always belong to scrolling, including at the top of the content. Compact's upward handle swipe opens normal Contents; normal Contents' downward header swipe returns directly to Compact. Upward Contents swipes do nothing. Selected-title tap detection yields to movement; active title editor fields/actions own their gestures. Header gestures do not depend on the separate content scroller's position. Active editors retain their field/list/blank-space gesture ownership. Ambiguous motion, multitouch, cancellation, selection/state changes and desktop input do not complete sheet gestures. Short opening/closing animations respect reduced motion.

## Bounds for later framing work

`MobileContentsSheet.canvasBounds` derives a raw available rectangle from the current visual viewport, sidebar, compact card and settled sheet geometry. `updateGraphViewport` exposes this as `usableCanvasBounds`, with Compact/Browse state and sidebar metadata, before applying the existing body-radius inset to `physics.bounds`. There is no mobile Full geometry state. Constellation overview and desktop inspector geometry remain distinct. Bounds refresh on existing viewport/UI callbacks and intrinsic sheet-size changes; sheet animations do not cache an intermediate translated edge. This adaptive-sizing change does not modify Fit.

## Validation

Unit tests cover transitions, gesture direction and geometry. The disposable local browser suite (`python -B tests/browser-check.py --contents-browse-only --screenshots`) exercises native touch events at 360, 390 and 430px, landscape, keyboard geometry, safe areas where supported, reduced motion and desktop. If native safe-area emulation is unavailable, it checks the existing stylesheet with explicitly synthetic inset values; this is not device-inset validation. It includes the A → B → C Files workflow, switching to Notes then D, page swipes, scroll guards, editor saves and canvas drag/pan/pinch. Existing body, content, menu, attachment, Constellation and zoom/performance suites provide regression coverage.

An intermittent Full-inspector attachment-error visibility check also failed against the preserved pre-Browse source: late asynchronous content growth can move the message below the visible edge after its scroll request. The attachment pipeline itself passes, and Browse error scrolling has separate coverage. Attachment behavior was left unchanged in this task.

Physical-phone review should repeat that browsing workflow, add a camera/gallery/file attachment, save each inline content type, then collapse, edit with the keyboard, scroll a long note, drag another body, pinch the exposed canvas and verify dock clearance around device safe areas. Confirm that the sheet never expands automatically. Browser emulation does not establish real-device keyboard behavior or frame rate.
