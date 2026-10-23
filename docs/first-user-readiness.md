# First-user readiness

Fresh local storage starts with an empty Universe and the
[first-use welcome](first-use-onboarding.md), preserving normal sidebar behavior.
Its display-only example never enters the real model. The welcome appears whenever
both active and archived user Items are empty, independently of the legacy
`firstItemCreated` preference. Contextual hints use a separate tiny preference and
do not repeat after completion. The old Start here cue has been removed.
Legacy starter migration remains supported; domain schemas are unchanged.

Hierarchy rows retain a permanent disclosure grid slot. A disabled leaf disclosure
is invisible inside that slot; adding children never changes the depth column.
Body icons, nested indentation, keyboard navigation and actual ancestry remain.

Constellation rows expose + directly through the existing staged membership
picker. Their management menu contains Rename and Delete. Constellation
detail reuses the primary header + for the same membership picker, keeping it
outside the scrolling member list. There is no duplicate Add row at the bottom.
Both header controls use the existing body-action visual treatment.
Mobile Constellation detail and Contents share adaptive CSS sizing and visual
viewport values:
200px minimum, bounded by `min(max(280px,38% of visible height),60% of visible height)`.
Short viewports may have a smaller effective minimum. Long Constellation content
scrolls internally. The existing sheet ResizeObserver updates exposed canvas
bounds without refitting the camera.

Notes, Links and Location use shared `.inline-editor-fields` and
`.inline-editor-actions` wrappers. Save then Cancel are explicit, centered,
desktop contained buttons with 44px targets; mobile actions sit inline as described below. Existing handlers, validation, draft and
persistence behavior remain. Desktop empty sections expose Add file…, Add note…,
Add link… and Add location… directly; populated content retains its existing
management. Links is user-facing terminology; internal bookmark names remain.

When the mobile keyboard reduces the visual viewport, an active editor uses its
available height, fields scroll internally and the inline controls stay outside that
field scroller. Secondary title/lens chrome hides temporarily; the sheet chevron
remains. Inline controls recover the old action-row space, allowing the page tabs
to remain available in the tested short keyboard-open viewports too.
Non-editing Contents sizing and tabs remain unchanged.

During mobile Link add/edit, the composer takes priority over the saved-link list.
The list receives only remaining height and scrolls independently; optional edit
fields also scroll internally on short viewports. Shared editor focus resets the
outer content scroll and reveals the active input. An inactive Link draft does not
lock or expose its section on another page. The redundant Links heading and lens
strip temporarily yield their space to the composer; save/cancel restores them.
Feedback shares the field scroller, so it cannot displace the input/action row.
While any active-page inline editor is open, content-origin gestures belong to
editing/scrolling; the header and handle
remain intentional Compact/Contents navigation surfaces with the existing direction,
distance and multi-touch guards. Vertical content scrolling never resizes the
sheet; header gestures work independently of content scroll position.

Contents has only Compact and Contents states. Normal reading remains adaptive
up to the existing medium-height cap; excess content scrolls inside the page.
There is no additional workspace size or overflow-eligibility control.

Mobile Notes, Links and Location share contained inline checkmark/cross actions
with accessible Save/Cancel labels and 44px targets. The fields reserve a fixed
88px action column so typed text cannot run underneath the controls. Existing
handlers, validation, drafts and persistence remain; desktop keeps text buttons.

Selected Preview/Contents titles provide direct, keyboard-accessible
inline rename using the existing renameEntry validation and staged persistence.
A pointer must finish within an 8px movement tolerance; movement, cancellation
or multi-touch invalidates the tap. Title-origin swipes still belong to the sheet.
Inputs/actions own their gestures; switching CB or leaving the surface cancels
its title draft. Canvas/tree labels and Constellation titles are unchanged.
Compact rename temporarily hides its overlapping upward Contents chevron while editing
and follows the keyboard inset, leaving its field/actions directly reachable.

Normal navigation exposes Help, Backup and Account, without Sample data or a
replacement developer menu. The existing explicit `?sample=large` mode and
programmatic loader remain available to local tests/development. Sample mode
continues to isolate personal data and navigation preferences.

## Verification

Run `python -B tests/browser-check.py --first-user-readiness-only --screenshots`
for genuinely empty storage, cue retirement, existing workspace preferences,
nested alignment, direct Constellation +, adaptive growth/capping, desktop
empty/edit states, and synthetic keyboard reductions at 360/390/430px plus short
landscape. Existing bookmark, Contents, footer, Constellation, attachment,
navigation and persistence suites cover their unchanged behavior.
Run `python -B tests/browser-check.py --mobile-inline-editors-only --screenshots`
for capped long-content scrolling, inline icon actions and native title tap/swipe
rename checks at 360/390/430px and short landscape.
The readiness suite additionally covers zero, one and eight saved Links, native
Save/Cancel, editor/list-origin gestures, intentional handle collapse, persistent
Constellation header actions and short keyboard-open landscape viewports.

Physical Android review is still required for browser keyboard/toolbar movement:
create the first Galaxy, compare leaf/parent sibling alignment, add a member through
Constellation +, inspect short and long sheets, and edit a long note, existing link
and Location with the keyboard open. Save and Cancel must remain directly reachable
without Android Back. On desktop inspect four empty sections and populated data,
save/cancel each editor, and verify the file picker works without hovering.

Mobile saved Notes are clean-tap edit targets; the Add note row is only shown when empty. Scrolling, text selection and checklist controls keep their own gestures. Notes, Links and Location save silently; validation/errors remain visible. Mobile inline editors use one outer surface with transparent, unbordered 44px actions and reserved text space.
