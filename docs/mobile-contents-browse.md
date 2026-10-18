# Mobile Contents browsing

Mobile has two persistent presentation states over the existing inspector:

- **Compact:** the selected-body card. Body taps select without opening Contents. Its centered upward chevron or an upward swipe opens Contents.
- **Contents / Browse:** a content-sized sheet with a Files / Notes / Links / Location dock. Its centered downward chevron or an eligible downward swipe returns to Compact.

There is no mobile Full state or expand-to-Full control. Add, edit and save stay in Contents, on the active page and inspected body; opening a form can naturally grow the same sheet within its cap. Overflow scrolls within the page. Existing dedicated image/file viewers remain available; notes use the existing inline editor. Desktop keeps its complete inspector and original section order, actions and wording.

Contents uses intrinsic active-page height, with a 200px minimum (limited by the maximum on short screens). Its maximum retains the previous Browse height: `min(max(280px, visibleHeight × .38), visibleHeight × .60)`. Empty pages release the unused canvas; saved content and editors grow the sheet only as needed. Beyond the cap, content scrolls while the header and dock remain outside the scroller. The visual viewport/keyboard changes the available height without adding another presentation state.

Pages align their content to the top, using the same 24px heading and 44px add row. A sheet-border ResizeObserver refreshes shared usable-canvas geometry after page/body switches, content changes and late media loads; it never writes a height or triggers camera framing. There is no resize animation or continuous sizing loop. The bottom dock remains 45px including its divider, with 44px hit targets around a lighter 32px active surface and unchanged 12px labels. The sheet retains a 4px bottom gutter or the full device safe-area inset, whichever is larger. Desktop and Compact spacing are unchanged.

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

Mobile editors use generic **Save / Cancel** labels. Save, Cancel, Edit and Remove share 44px targets, 5px corners, 12px text and 8px/12px padding. A faint 1px edge, shaded surface, inset highlight and small shadow give secondary actions a contained button feel; Save has stronger surface/edge emphasis and Remove a muted destructive text color. Labels use explicit flex centering in both axes, including saved Link menu actions and populated Location controls. Action rows use an 8px gap; Google Maps remains a link. Fields are full-width, border-box and at least 16px text; the quick Link form places its field above its buttons. Other action rows wrap safely. Links keeps **Add link…** and **Paste a link…** entry wording; Location keeps **Add location…** and **Place or address**. Desktop restores its original contextual save wording and layout.

Compact and Contents share the `cb-action-button` treatment: 44px tap targets around 36px visible surfaces, with identical centered 18px SVG plus/three-dot icons, 6px pair spacing and subtle border/focus/active treatment. Mobile icon geometry does not depend on glyph baselines or letter spacing. Desktop retains its original text glyphs and styling. Names truncate before the buttons; centered sheet chevrons remain separate controls. Menu contents and semantics are unchanged.

## Gesture ownership

Gestures originate only on the compact card or inspector. The existing 10px dead zone, 1.5 axis ratio and 64px completion distance remain. A clear horizontal swipe on noninteractive Browse content selects the adjacent page without wrapping. Dock taps also reach every page; arrow keys, Home and End navigate the dock.

Buttons, links, inputs, media controls and editable fields own their gestures. The sheet chevrons are exceptions for vertical gestures only. Nested horizontal scrollers own horizontal motion. Upward motion inside open Contents scrolls or does nothing on the handle; it cannot expand to another state. Downward collapse requires relevant scrollers to be at the top, including the page scroller when starting on the handle. Ambiguous motion, multitouch, cancellation, selection/state changes and desktop input do not complete sheet gestures. Short opening/closing animations respect reduced motion.

## Bounds for later framing work

`MobileContentsSheet.canvasBounds` derives a raw available rectangle from the current visual viewport, sidebar, compact card and settled sheet geometry. `updateGraphViewport` exposes this as `usableCanvasBounds`, with Compact/Browse state and sidebar metadata, before applying the existing body-radius inset to `physics.bounds`. There is no mobile Full geometry state. Constellation overview and desktop inspector geometry remain distinct. Bounds refresh on existing viewport/UI callbacks and intrinsic sheet-size changes; sheet animations do not cache an intermediate translated edge. This adaptive-sizing change does not modify Fit.

## Validation

Unit tests cover transitions, gesture direction and geometry. The disposable local browser suite (`python -B tests/browser-check.py --contents-browse-only --screenshots`) exercises native touch events at 360, 390 and 430px, landscape, keyboard geometry, safe areas where supported, reduced motion and desktop. If native safe-area emulation is unavailable, it checks the existing stylesheet with explicitly synthetic inset values; this is not device-inset validation. It includes the A → B → C Files workflow, switching to Notes then D, page swipes, scroll guards, editor saves and canvas drag/pan/pinch. Existing body, content, menu, attachment, Constellation and zoom/performance suites provide regression coverage.

An intermittent Full-inspector attachment-error visibility check also failed against the preserved pre-Browse source: late asynchronous content growth can move the message below the visible edge after its scroll request. The attachment pipeline itself passes, and Browse error scrolling has separate coverage. Attachment behavior was left unchanged in this task.

Physical-phone review should repeat that browsing workflow, add a camera/gallery/file attachment, save each inline content type, then collapse, edit with the keyboard, scroll a long note, drag another body, pinch the exposed canvas and verify dock clearance around device safe areas. Confirm that the sheet never expands automatically. Browser emulation does not establish real-device keyboard behavior or frame rate.
