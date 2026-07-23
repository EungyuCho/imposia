# Imposia Demo Design System

## 1. Atmosphere & Identity

The demo feels like a compact editorial production lab: warm paper controls beside a dark, instrument-like browser workspace. Its signature is the visible fold—thin rules, square controls, and mono evidence labels make pagination feel inspectable while the serif display keeps the page itself primary.

## 2. Color

### Palette

| Role | Token | Value | Usage |
| --- | --- | --- | --- |
| Surface / control | `--demo-paper` | `#f3eee3` | Left panel and controls |
| Surface / control deep | `--demo-paper-deep` | `#e5ded0` | Secondary paper surface |
| Surface / workspace | `--demo-ink` | `#101514` | Preview workspace and primary controls |
| Surface / workspace soft | `--demo-ink-soft` | `#1a211f` | Dark secondary surface |
| Text / secondary | `--demo-text-secondary` | `#4b5551` | Explanatory copy |
| Text / muted | `--demo-text-muted` | `#5f6864` | Metadata and captions |
| Border / paper | `--demo-line` | `rgb(16 21 20 / 16%)` | Paper dividers |
| Border / dark | `--demo-line-dark` | `rgb(243 238 227 / 16%)` | Workspace dividers |
| Accent / primary | `--demo-accent` | `#ef6a3b` | Focus, selected edge, active evidence |
| Accent / text | `--demo-accent-text` | `#a64020` | Paper-surface emphasis |
| Status / success | `--demo-success` | `#356a4d` | Verified integrity |
| Status / error | `--demo-danger` | `#b43b2f` | Failed integrity |
| Status / signal | `--demo-signal` | `#9cd4b6` | Active runtime signal |

### Rules

- Warm paper owns controls; near-black owns the live browser workspace.
- Orange marks focus, selection, or evidence. It is not general decoration.
- Status colors communicate a named state and always appear with text.
- New colors require a semantic role here before use.

## 3. Typography

### Scale

| Level | Token / Size | Weight | Line height | Usage |
| --- | --- | --- | --- | --- |
| Display | `--demo-type-display` / `clamp(38px, 4vw, 55px)` | 500 | `0.93` | Intro claim |
| Workspace title | `--demo-type-workspace` / `17px` | 500 | `1` | Active specimen |
| Section title | `--demo-type-title` / `15px` | 600 | `1.15` | Control titles |
| Switch | `--demo-type-switch` / `14px` | 600 | `1.2` | Primary control labels |
| Body | `--demo-type-body` / `12px` | 400 | `1.65` | Compact lab copy |
| Caption | `--demo-type-caption` / `9px` | 400–800 | `1.45` | Evidence metadata |
| Label | `--demo-type-label` / `8px` | 700–800 | `1.4` | Uppercase controls |
| Code | `--demo-type-code` / `9px` | 400 | `1.75` | API samples |

### Font Stack

- Serif: `--demo-serif` (`Iowan Old Style`, Palatino, Georgia)
- Mono: `--demo-mono` (`SFMono-Regular`, Cascadia Code, Consolas)

### Rules

- Serif carries authored or human-readable titles; mono carries measurements and runtime evidence.
- The compact demo intentionally uses sub-14px labels; they must remain high contrast and are tracked as accepted debt.
- Long evidence strings truncate or wrap inside their own cell and never widen the control panel.

## 4. Spacing & Layout

### Base Unit

Spacing derives from a 4px base using `--demo-space-1` through `--demo-space-7` (4, 8, 12, 16, 20, 24, and 28px). Named spacing tokens cover panel, section, control, and status intent.

### Grid

- Desktop shell: `330–390px` control sidebar plus a flexible preview workspace.
- Compact breakpoint: `1050px` narrows the control rail.
- Stacked breakpoint: `820px` places the scrollable control panel above the preview.
- Required QA widths: 375px, 768px, and 1280px.

### Rules

- The control panel is the scroll owner on desktop; the stacked shell owns page-level overflow below 820px.
- Evidence groups use grids so numeric values align without fixed text widths.
- Preserve the asymmetric editorial intro spacing; dense runtime controls use the 4px scale.

## 5. Components

### Control Section

- **Structure**: `section` → heading cluster + one focused control or evidence group
- **Variants**: default, integrity, export, code
- **Spacing**: `--demo-section-block`, `--demo-panel-inline`, `--demo-space-4`
- **States**: default; child controls own hover, focus, disabled, loading, and error states
- **Accessibility**: labelled by its heading; status output uses text and `aria-live`
- **Motion**: none
- **Layout**: vertical stack inside the control-panel scroll owner

### Square Action Button

- **Structure**: native `button`
- **Variants**: primary dark, quiet stop
- **Spacing**: `--demo-space-button-block`, `--demo-space-3`
- **States**: default, hover, active, focus-visible, disabled
- **Accessibility**: native keyboard behavior and visible orange focus ring
- **Motion**: `--demo-motion-control` color, background, and opacity transition
- **Layout**: inline cluster; never stretches by default

### Evidence Metric Grid

- **Structure**: labelled `dl` containing repeated `div > dt + dd`
- **Variants**: workspace summary, live-render runner
- **Spacing**: `--demo-space-2`, `--demo-space-3`, `--demo-space-4`
- **States**: empty em dash, running, complete, failed
- **Accessibility**: metric names remain visible; status is not encoded by color alone
- **Motion**: none; rapidly changing values must not animate
- **Layout**: responsive grid, collapsing to readable rows without horizontal scroll

### Live Render Runner

- **Structure**: preset `select`, start/stop actions, status output, evidence metric grid
- **Variants**: idle, running, complete, failed, cancelled
- **Spacing**: existing control and evidence tokens only
- **States**: controls disable while incompatible work is active; complete and failed states include text
- **Accessibility**: explicit label, native select/button keyboard support, polite live status, stable metric labels
- **Motion**: no metric animation; existing micro-transitions only
- **Layout**: vertical stack within the integrity control section; the panel remains its scroll owner

### Demo Case Navigation

- **Structure**: four native buttons in a labelled `nav`
- **Variants**: Live editor, Stress, Compatibility, Output
- **Spacing**: `--demo-space-2`, `--demo-space-4`, `--demo-panel-inline`
- **States**: default, hover, active, focus-visible, selected
- **Accessibility**: `aria-pressed` exposes the active case and every case remains keyboard reachable
- **Motion**: existing control color transition only
- **Layout**: two-column grid inside the control-panel scroll owner

### Live HTML Editor

- **Structure**: section heading, formatting toolbar, `contenteditable` document surface, live status, evidence metrics
- **Variants**: committed and paginating
- **Spacing**: `--demo-space-1` through `--demo-space-5`
- **States**: toolbar default/hover/active/focus; editor default/focus; status committed/updating
- **Accessibility**: titled contenteditable region, native toolbar buttons, visible focus, polite commit status
- **Motion**: none; typing and metric updates remain immediate
- **Layout**: vertical stack; the editor grows within the panel and the panel remains the scroll owner

## 6. Motion & Interaction

| Type | Duration | Easing | Usage |
| --- | --- | --- | --- |
| Micro | `--demo-motion-control` / `180ms` | `ease` | Buttons, toggles, focus feedback |
| Entry | `520ms` | `cubic-bezier(0.22, 1, 0.36, 1)` | Intro entrance only |
| Status | `--demo-motion-status-duration` / `900ms` | existing keyframe easing | Active pagination signal |

- Runtime measurements never animate; they update as text.
- `prefers-reduced-motion` disables non-essential entry motion and slows the status signal.
- New interaction motion is limited to transform and opacity unless it is an existing control color transition.

## 7. Depth & Surface

### Strategy

Borders-only. Paper and workspace are separated by tonal contrast, while internal hierarchy uses hairline borders, a three-pixel evidence edge, and sparse inset selection marks. No drop shadows are introduced.

| Type | Value | Usage |
| --- | --- | --- |
| Hairline | `--demo-border-hairline` + semantic line token | Panels, rows, controls |
| Strong | `--demo-border-strong` + `--demo-accent` | Focus ring |
| Accent edge | `--demo-border-accent` + `--demo-accent` | Selected or measured evidence |

## 8. Accessibility Constraints & Accepted Debt

### Constraints

- Target WCAG 2.2 AA for interactive controls and primary explanatory text.
- Every interactive element is keyboard reachable and has a visible focus state.
- Running, complete, and failed states include readable text; color is supplementary.
- The layout reflows to one readable column at 375px without primary-content horizontal scrolling.
- Reduced-motion preferences are respected.

### Accepted Debt

| Item | Location | Why accepted | Owner / Exit |
| --- | --- | --- | --- |
| 8–12px compact labels | Demo control panel | Existing dense instrumentation language; strong contrast and uppercase tracking preserve legibility | Revisit with the next full demo typography audit |
| No dark-mode variant for paper controls | Demo shell | The two-tone paper/workspace composition is the product signature | Revisit only if a user-selectable theme is introduced |
