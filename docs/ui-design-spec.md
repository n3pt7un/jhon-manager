# UI/UX Design Specification

## Claude Orchestrator -- Visual Design System & Wireframes

---

## Table of Contents

1. [Design System: "Terminal Elegance"](#1-design-system-terminal-elegance)
2. [Color Palette](#2-color-palette)
3. [Typography](#3-typography)
4. [Design Principles](#4-design-principles)
5. [Page Wireframes](#5-page-wireframes)
   - [Dashboard Page](#5a-dashboard-page)
   - [Instance Page (Primary Workspace)](#5b-instance-page-primary-workspace)
   - [Task Editor Modal](#5c-task-editor-modal)
   - [Analytics Page](#5d-analytics-page)
   - [Settings Page](#5e-settings-page)
6. [Component Design Details](#6-component-design-details)
7. [Responsive Behavior](#7-responsive-behavior)
8. [Animation Specifications](#8-animation-specifications)
9. [Accessibility Considerations](#9-accessibility-considerations)
10. [Implementation Notes](#10-implementation-notes)

---

## 1. Design System: "Terminal Elegance"

### Philosophy

**Terminal Elegance** is a visual identity that fuses the raw, functional aesthetic of
developer tooling with the refinement and polish of a modern analytics dashboard. The
result should feel like a **premium IDE control panel** -- something a senior engineer
would trust for production orchestration, yet appreciate for its visual clarity and
attention to detail.

### Core Identity

| Attribute         | Description                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| **Mood**          | Professional, focused, calm authority                                       |
| **Metaphor**      | A mission-control dashboard for AI development agents                       |
| **Contrast**      | Dark canvas with precise, luminous accents -- like instrument lights at night |
| **Texture**       | Flat surfaces with subtle depth via layered backgrounds and glassmorphism   |
| **Motion**        | Restrained, purposeful micro-animations -- never decorative, always informative |

### Visual References

- **VS Code** -- Panel layering, sidebar iconography, status bar density
- **Linear** -- Clean typography, smooth transitions, restrained color use
- **Vercel Dashboard** -- Card layouts, stat presentation, monospace accents
- **Warp Terminal** -- Modern terminal aesthetic, command palette patterns
- **Grafana** -- Data-dense layouts with clear visual hierarchy

### Key Visual Signatures

1. **Layered Depth** -- Three distinct background layers create spatial hierarchy without
   resorting to heavy shadows
2. **Teal Accents** -- Electric teal (#00D4AA) serves as the singular primary accent,
   used sparingly to draw attention to active states and primary actions
3. **Monospace Moments** -- Terminal output, task IDs, timestamps, and technical metadata
   render in monospace to reinforce the developer-tool identity
4. **Status Glow** -- Running and active states use a soft color glow (box-shadow with
   status color at low opacity) to create a living, breathing feel
5. **Glass Panels** -- Elevated surfaces use subtle backdrop-filter blur to create a
   sense of floating above the base layer

---

## 2. Color Palette

### CSS Custom Properties

```css
:root {
  /* ============================================
     BACKGROUND LAYERS (darkest to lightest)
     Four-tier depth system for spatial hierarchy
     ============================================ */
  --bg-base: #0B0E14;             /* Deep navy-black -- page canvas */
  --bg-surface: #111620;          /* Raised panels -- sidebar, main areas */
  --bg-elevated: #1A1F2E;         /* Cards, modals, dropdowns */
  --bg-hover: #232A3B;            /* Hover states, selected rows */

  /* ============================================
     ACCENT -- Electric Teal (Primary)
     Used for: primary CTAs, active nav, focus rings,
     progress indicators, links
     ============================================ */
  --accent-primary: #00D4AA;          /* Primary actions, active states */
  --accent-primary-hover: #00E8BC;    /* Hovered primary actions */
  --accent-primary-dim: #00D4AA33;    /* 20% opacity -- accent backgrounds, selection */
  --accent-primary-glow: #00D4AA40;   /* 25% opacity -- box-shadow glow */

  /* ============================================
     ACCENT -- Purple (Secondary)
     Used for: secondary actions, tags, chart series #2,
     visual variety without competing with teal
     ============================================ */
  --accent-secondary: #6C5CE7;        /* Secondary accent -- purple */
  --accent-secondary-hover: #7E70F0;  /* Hovered secondary */
  --accent-secondary-dim: #6C5CE733;  /* 20% opacity -- secondary backgrounds */

  /* ============================================
     TEXT
     Three-tier hierarchy for information density
     ============================================ */
  --text-primary: #E8ECF4;        /* Main text -- headings, body, values */
  --text-secondary: #8892A6;      /* Muted text -- labels, descriptions, timestamps */
  --text-tertiary: #4A5568;       /* Disabled text, placeholder, hints */
  --text-inverse: #0B0E14;        /* Text on accent-colored backgrounds */

  /* ============================================
     STATUS COLORS
     Semantic colors for instance and task states.
     Each includes a dim variant for backgrounds.
     ============================================ */
  --status-running: #00D4AA;      /* Teal -- actively executing */
  --status-running-dim: #00D4AA1A;
  --status-queued: #F5A623;       /* Amber -- waiting in queue */
  --status-queued-dim: #F5A6231A;
  --status-completed: #4ECDC4;    /* Cyan -- successfully finished */
  --status-completed-dim: #4ECDC41A;
  --status-failed: #FF6B6B;       /* Red -- error / failure */
  --status-failed-dim: #FF6B6B1A;
  --status-idle: #8892A6;         /* Gray -- not active */
  --status-idle-dim: #8892A61A;
  --status-paused: #F5A623;       /* Amber -- intentionally paused */
  --status-paused-dim: #F5A6231A;

  /* ============================================
     BORDERS
     Three-tier border system matching background depth
     ============================================ */
  --border-subtle: #1E2535;       /* Dividers within same-level panels */
  --border-default: #2A3244;      /* Card borders, input borders */
  --border-strong: #3A4556;       /* Emphasized borders, focus adjacent */
  --border-accent: #00D4AA66;     /* Focus rings, active borders */

  /* ============================================
     SHADOWS
     Layered shadow system for elevation
     ============================================ */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.5);
  --shadow-glow-teal: 0 0 20px rgba(0, 212, 170, 0.15);
  --shadow-glow-red: 0 0 20px rgba(255, 107, 107, 0.15);

  /* ============================================
     FONTS
     UI font + monospace for terminal / code
     ============================================ */
  --font-ui: 'Geist', 'Inter', system-ui, -apple-system, sans-serif;
  --font-mono: 'Geist Mono', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;

  /* ============================================
     SPACING SCALE (4px base)
     ============================================ */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* ============================================
     BORDER RADIUS
     ============================================ */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;
  --radius-full: 9999px;

  /* ============================================
     TRANSITIONS
     ============================================ */
  --transition-fast: 150ms ease;
  --transition-default: 200ms ease;
  --transition-slow: 300ms ease;
}
```

### Color Usage Guidelines

| Context                   | Token                  | Example                            |
| ------------------------- | ---------------------- | ---------------------------------- |
| Page background           | `--bg-base`            | `<body>` background               |
| Sidebar, main panels      | `--bg-surface`         | Sidebar nav, content area          |
| Cards, modals, dropdowns  | `--bg-elevated`        | Project card, task editor modal    |
| Row hover, selected item  | `--bg-hover`           | Table row hover, selected nav item |
| Primary button            | `--accent-primary`     | "Start Instance", "Add Task"       |
| Active nav item indicator | `--accent-primary`     | Left border on active sidebar item |
| Focus ring                | `--border-accent`      | Input focus outline                |
| Headings, values          | `--text-primary`       | Page titles, stat numbers          |
| Labels, descriptions      | `--text-secondary`     | Form labels, card descriptions     |
| Disabled, placeholders    | `--text-tertiary`      | Disabled button text, input hints  |

---

## 3. Typography

### Font Stack

**UI Text -- Geist**
- Source: [Vercel Geist Font](https://vercel.com/font)
- Characteristics: Clean geometric sans-serif, optimized for UI rendering at small sizes,
  excellent x-height, clear numerals
- Fallback chain: `'Geist' -> 'Inter' -> system-ui -> -apple-system -> sans-serif`

**Monospace -- Geist Mono**
- Source: [Vercel Geist Mono](https://vercel.com/font)
- Characteristics: Matched x-height with Geist, clear distinction between similar glyphs
  (0/O, 1/l/I), programming ligatures
- Fallback chain: `'Geist Mono' -> 'JetBrains Mono' -> 'Fira Code' -> 'Cascadia Code' -> monospace`

### Type Scale

```
Level         Size    Weight    Line-Height    Letter-Spacing    Usage
─────────────────────────────────────────────────────────────────────────────
Display       32px    600       1.2            -0.02em           Page titles (Dashboard, Analytics)
Heading 1     24px    600       1.3            -0.01em           Section headings (Projects, Queue)
Heading 2     18px    500       1.4            -0.005em          Card titles, panel headers
Body          14px    400       1.5            0                 Default text, descriptions
Body Small    13px    400       1.5            0                 Secondary info, timestamps
Caption       12px    400       1.5            0.01em            Labels, badges, metadata
Overline      11px    500       1.5            0.06em            Section overlines (uppercase)
─────────────────────────────────────────────────────────────────────────────
Mono Body     13px    400       1.6            0                 Terminal output, task IDs
Mono Small    12px    400       1.6            0                 Inline code, file paths
Mono Large    14px    400       1.6            0                 Editor content, log viewer
```

### Tailwind CSS Typography Mapping

```js
// tailwind.config.js (excerpt)
module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        'display': ['32px', { lineHeight: '1.2', fontWeight: '600', letterSpacing: '-0.02em' }],
        'h1':      ['24px', { lineHeight: '1.3', fontWeight: '600', letterSpacing: '-0.01em' }],
        'h2':      ['18px', { lineHeight: '1.4', fontWeight: '500', letterSpacing: '-0.005em' }],
        'body':    ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-sm': ['13px', { lineHeight: '1.5', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '1.5', fontWeight: '400', letterSpacing: '0.01em' }],
        'overline': ['11px', { lineHeight: '1.5', fontWeight: '500', letterSpacing: '0.06em' }],
      },
    },
  },
};
```

### Font Loading Strategy

```html
<!-- Preload critical fonts to avoid FOIT -->
<link rel="preconnect" href="https://fonts.vercel.com" crossorigin />
<link rel="preload" href="/fonts/Geist-Regular.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/Geist-Medium.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/Geist-SemiBold.woff2" as="font" type="font/woff2" crossorigin />
<link rel="preload" href="/fonts/GeistMono-Regular.woff2" as="font" type="font/woff2" crossorigin />
```

```css
/* Font-face declarations with swap display */
@font-face {
  font-family: 'Geist';
  src: url('/fonts/Geist-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Geist';
  src: url('/fonts/Geist-Medium.woff2') format('woff2');
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Geist';
  src: url('/fonts/Geist-SemiBold.woff2') format('woff2');
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: 'Geist Mono';
  src: url('/fonts/GeistMono-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}
```

---

## 4. Design Principles

### 4.1 Dark Theme Only

This application operates in a **dark-theme-only** context. The target user is a developer
who will run this alongside their IDE, terminal, and other dark-themed tools. A light theme
would create jarring visual contrast and is intentionally excluded from scope.

- All color tokens are designed for dark backgrounds
- Contrast ratios are validated against WCAG AA for dark backgrounds
- No theme toggle is provided in the UI

### 4.2 Glassmorphism on Elevated Panels

Elevated surfaces (cards, modals, dropdowns, tooltips) use a subtle glassmorphism effect
to create a sense of floating above the canvas:

```css
.panel-elevated {
  background: rgba(26, 31, 46, 0.80);      /* --bg-elevated at 80% */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
}
```

Guidelines for glassmorphism usage:
- **Do use** on: modals, floating panels, command palette, tooltips, dropdown menus
- **Do not use** on: inline cards within scroll areas (performance), sidebar (static panel),
  table rows (too many elements)
- Blur radius: 12px (consistent across all elevated surfaces)
- Background opacity: 75-85% (enough to read content, enough to see depth)

### 4.3 Status Indicators with Color-Coded Glow

Instance and task states are communicated through colored dots with a soft ambient glow:

```css
/* Base status dot */
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

/* Running state -- pulsing glow */
.status-dot--running {
  background-color: var(--status-running);
  box-shadow: 0 0 8px var(--status-running),
              0 0 16px rgba(0, 212, 170, 0.3);
  animation: pulse-glow 2s ease-in-out infinite;
}

/* Queued state -- steady amber */
.status-dot--queued {
  background-color: var(--status-queued);
  box-shadow: 0 0 6px rgba(245, 166, 35, 0.4);
}

/* Completed state -- steady cyan */
.status-dot--completed {
  background-color: var(--status-completed);
  box-shadow: 0 0 6px rgba(78, 205, 196, 0.3);
}

/* Failed state -- steady red */
.status-dot--failed {
  background-color: var(--status-failed);
  box-shadow: 0 0 6px rgba(255, 107, 107, 0.4);
}

/* Idle state -- no glow */
.status-dot--idle {
  background-color: var(--status-idle);
}

/* Paused state -- steady amber, no pulse */
.status-dot--paused {
  background-color: var(--status-paused);
  box-shadow: 0 0 6px rgba(245, 166, 35, 0.3);
}

@keyframes pulse-glow {
  0%, 100% { opacity: 1; box-shadow: 0 0 8px var(--status-running), 0 0 16px rgba(0, 212, 170, 0.3); }
  50%      { opacity: 0.7; box-shadow: 0 0 12px var(--status-running), 0 0 24px rgba(0, 212, 170, 0.5); }
}
```

### 4.4 Micro-Animations (200ms ease)

All interactive state transitions use a consistent 200ms ease timing:

```css
/* Standard transition mixin */
.interactive {
  transition: all 200ms ease;
}

/* Specific transitions for performance (prefer specific props over 'all') */
.card-interactive {
  transition: transform 200ms ease,
              box-shadow 200ms ease,
              border-color 200ms ease;
}

.button-interactive {
  transition: background-color 200ms ease,
              box-shadow 200ms ease,
              transform 200ms ease;
}

.nav-item-interactive {
  transition: background-color 200ms ease,
              color 200ms ease,
              border-color 200ms ease;
}
```

Animation principles:
- **Duration**: 200ms for UI interactions, 300ms for entrances/exits, 150ms for micro-feedback
- **Easing**: `ease` for most transitions, `ease-out` for entrances, `ease-in` for exits
- **Property**: Always transition specific properties, never `all` in production
- **Reduce motion**: Respect `prefers-reduced-motion` -- disable animations, keep instant state changes

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

### 4.5 Terminal Output Rendering

Terminal output is the core data display of the application. It must render with true
monospace fidelity and full ANSI color support:

- **Renderer**: xterm.js (v5+) with WebGL renderer for performance
- **Font**: Geist Mono at 13px, line-height 1.6
- **Background**: `--bg-base` (#0B0E14) for seamless integration with app canvas
- **ANSI colors**: Full 256-color support via xterm.js built-in parsing
- **Scrollback**: 10,000 lines default (configurable)
- **Selection**: Native xterm.js selection with copy-on-select
- **Links**: Auto-detect URLs and file paths, render as clickable
- **Search**: Ctrl+F opens xterm.js search addon

```typescript
// xterm.js configuration
const terminalOptions: ITerminalOptions = {
  theme: {
    background: '#0B0E14',
    foreground: '#E8ECF4',
    cursor: '#00D4AA',
    cursorAccent: '#0B0E14',
    selectionBackground: '#00D4AA33',
    black: '#0B0E14',
    red: '#FF6B6B',
    green: '#00D4AA',
    yellow: '#F5A623',
    blue: '#6C5CE7',
    magenta: '#E879F9',
    cyan: '#4ECDC4',
    white: '#E8ECF4',
    brightBlack: '#4A5568',
    brightRed: '#FF8A8A',
    brightGreen: '#00E8BC',
    brightYellow: '#FFB84D',
    brightBlue: '#8B7CF0',
    brightMagenta: '#F0A0FF',
    brightCyan: '#6EE7E0',
    brightWhite: '#FFFFFF',
  },
  fontFamily: "'Geist Mono', 'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 13,
  lineHeight: 1.6,
  cursorBlink: true,
  cursorStyle: 'block',
  scrollback: 10000,
  allowProposedApi: true,
};
```

---

## 5. Page Wireframes

### 5a. Dashboard Page

The dashboard is the landing page. It provides a global overview of all projects and
their Claude Code instances, with key statistics at a glance.

**Layout**: Sidebar + header + stats bar + project grid

```
+-----------------------------------------------------------------------------------+
|  SIDEBAR          |  HEADER                                                       |
|  (fixed, 240px)   |  Claude Orchestrator                    [Search] [?] [Avatar] |
|                   +---------------------------------------------------------------+
|  +--------------+ |  STATS BAR                                                    |
|  | * Dashboard  | |  +-------------+ +-------------+ +-------------+ +-----------+|
|  |   Instances  | |  | * 4 Active  | | [] 12 Queued| | # 47 Done   | | $ $3.82   ||
|  |   Analytics  | |  |  Instances  | |    Tasks    | |    Today    | |   Today   ||
|  |   Settings   | |  +-------------+ +-------------+ +-------------+ +-----------+|
|  +--------------+ +---------------------------------------------------------------+
|                   |  PROJECTS                                         [+ Project] |
|  PROJECTS         |                                                               |
|  +--------------+ |  +---------------------------+ +---------------------------+  |
|  | > Project A  | |  | Project A                 | | Project B                 |  |
|  | > Project B  | |  | "Frontend redesign"       | | "API migration"           |  |
|  | > Project C  | |  |                           | |                           |  |
|  +--------------+ |  | +-------+ +-------+       | | +-------+ +-------+      |  |
|                   |  | |Inst-1 | |Inst-2 |       | | |Inst-1 | |Inst-2 |      |  |
|  QUICK ACTIONS    |  | |* Run  | |~ Idle |       | | |! Fail | |* Run  |      |  |
|  +--------------+ |  | |14m 32s| |       |       | | |Error  | |2m 10s |      |  |
|  | + New Inst.  | |  | |85 tok | |       |       | | |       | |210 tok|      |  |
|  | + New Task   | |  | +-------+ +-------+       | | +-------+ +-------+      |  |
|  +--------------+ |  |                           | |                           |  |
|                   |  | Tasks: 3 queued, 1 running | | Tasks: 0 queued, 1 run   |  |
|                   |  +---------------------------+ +---------------------------+  |
|                   |                                                               |
|                   |  +---------------------------+ +---------------------------+  |
|                   |  | Project C                 | | + New Project             |  |
|                   |  | "Infrastructure setup"    | |                           |  |
|                   |  |                           | |   Click to create a new   |  |
|                   |  | +-------+                 | |   project and add Claude  |  |
|                   |  | |Inst-1 |                 | |   Code instances.         |  |
|                   |  | |~ Idle |                 | |                           |  |
|                   |  | |       |                 | |         [+ Create]        |  |
|                   |  | +-------+                 | |                           |  |
|                   |  |                           | |                           |  |
|                   |  | Tasks: 5 queued, 0 run    | |                           |  |
|                   |  +---------------------------+ +---------------------------+  |
+-----------------------------------------------------------------------------------+
```

**Dashboard Components Breakdown**:

| Component          | Description                                                      |
| ------------------ | ---------------------------------------------------------------- |
| **Sidebar**        | Fixed 240px, `--bg-surface`, top logo, nav links with icons, project list, quick actions |
| **Header**         | 56px height, project breadcrumbs, global search (Ctrl+K), help, user avatar |
| **Stats Bar**      | 4 stat cards in a row, each showing icon + value + label. Uses `--bg-elevated` cards |
| **Project Grid**   | CSS Grid, `repeat(auto-fill, minmax(380px, 1fr))`, gap 16px     |
| **Project Card**   | Title, description, nested instance tiles, task summary footer   |
| **Instance Tile**  | Compact: status dot + name + duration/token count. Click to navigate to Instance Page |
| **New Project Card**| Dashed border, muted text, call-to-action button                |

**Stats Bar Detail**:
```
+------------------------------------------+
|  [icon]                                  |
|  4 Active Instances        +12% vs yday  |
|  ████████░░ 4 of 10 slots               |
+------------------------------------------+
```
Each stat card shows:
- Icon (left-aligned, accent-colored)
- Primary value (large, `--text-primary`, font-weight 600)
- Label (below value, `--text-secondary`, caption size)
- Optional trend indicator (right side, green up / red down)
- Optional mini progress bar (bottom)

---

### 5b. Instance Page (Primary Workspace)

The instance page is the primary workspace where users interact with a single Claude Code
instance. It features a split-pane layout with terminal output on the left and task
management on the right.

**Layout**: Top control bar + split pane (resizable)

```
+-----------------------------------------------------------------------------------+
|  SIDEBAR  |  INSTANCE HEADER BAR                                                  |
|           +-----------------------------------------------------------------------+
|  (...)    |  [<-]  Project A / Instance 1            * Running  14m 32s            |
|           |                                                                       |
|           |  Model: claude-sonnet-4-20250514    Dir: ~/projects/frontend              |
|           |  SSH: user@192.168.1.10            PID: 48291                          |
|           |                                                                       |
|           |  [ * Start ] [ || Pause ] [ [] Stop ] [ <> Restart ]   [Settings gear]|
|           +--------------------------------------------+--------------------------+
|           |  TERMINAL OUTPUT (xterm.js)                | TASK QUEUE               |
|           |  +-----------------------------------------+| +-----------------------+|
|           |  |                                         || | RUNNING               ||
|           |  |  $ claude --model sonnet "Fix the       || | +-------------------+ ||
|           |  |    authentication bug in login.tsx"      || | | #127 Fix auth bug | ||
|           |  |                                         || | | Priority: High    | ||
|           |  |  I'll analyze the authentication        || | | Turn 3/10         | ||
|           |  |  issue in login.tsx...                  || | | 14m 32s elapsed   | ||
|           |  |                                         || | | [View] [Cancel]   | ||
|           |  |  Let me first look at the current       || | +-------------------+ ||
|           |  |  implementation:                        || |                       ||
|           |  |                                         || | QUEUED (3)     [+ Add]||
|           |  |  ```typescript                          || | +-------------------+ ||
|           |  |  // login.tsx                           || | | = #128 Update     | ||
|           |  |  export const LoginForm = () => {       || | |   API endpoints   | ||
|           |  |    const [error, setError] = ...        || | |   Priority: Med   | ||
|           |  |  ```                                    || | +-------------------+ ||
|           |  |                                         || | +-------------------+ ||
|           |  |  I can see the issue. The token         || | | = #129 Write      | ||
|           |  |  validation is not checking...          || | |   unit tests      | ||
|           |  |                                         || | |   Priority: Low   | ||
|           |  |  [cursor blinks]                        || | +-------------------+ ||
|           |  |                                         || | +-------------------+ ||
|           |  |                                         || | | = #130 Refactor   | ||
|           |  |                                         || | |   error handling  | ||
|           |  |                                         || | |   Priority: Med   | ||
|           |  |                                         || | +-------------------+ ||
|           |  |                                         || |                       ||
|           |  |                                         || | COMPLETED (12)  [v]   ||
|           |  |                                         || | +-------------------+ ||
|           |  |                                         || | | # #126 Setup CI  | ||
|           |  |                                         || | |   3m 12s | 1.2k  | ||
|           |  |                                         || | +-------------------+ ||
|           |  |                                         || | | # #125 Fix typos | ||
|           |  +-----------------------------------------+| | |   1m 45s | 800   | ||
|           |  [Clear] [Export] [Search: Ctrl+F] [Wrap]  | | +-------------------+ ||
|           |                                            | | (10 more...)          ||
|           |                                            | |                       ||
|           |                                            | | [+ Add Task]          ||
|           |                                            | | [Bulk Import]         ||
|           +--------------------------------------------+-+-----------------------+|
+-----------------------------------------------------------------------------------+
```

**Instance Page Components Breakdown**:

| Component               | Description                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| **Instance Header Bar** | Breadcrumb nav, status badge with timer, model/dir/SSH info, action buttons |
| **Terminal Panel**       | xterm.js renderer, full ANSI color, 60% default width           |
| **Terminal Toolbar**     | Bottom bar: Clear, Export (.txt), Search toggle, Word Wrap toggle |
| **Task Queue Panel**     | Right panel, 40% default width, three sections                  |
| **Running Task Card**    | Highlighted with accent border, shows turn count, timer, cancel option |
| **Queued Tasks**         | Draggable list (drag handle on left), reorderable, shows priority |
| **Completed Tasks**      | Collapsible section, shows duration + token count, click to expand full log |
| **Split Divider**        | 4px draggable divider between terminal and queue panels          |

**Instance Control Buttons**:
```
Active states based on instance status:

  Status: IDLE
  [ * Start ]  [ || Pause ]  [ [] Stop ]  [ <> Restart ]
    enabled      disabled      disabled      disabled

  Status: RUNNING
  [ * Start ]  [ || Pause ]  [ [] Stop ]  [ <> Restart ]
    disabled      enabled      enabled       enabled

  Status: PAUSED
  [ * Resume ]  [ || Pause ]  [ [] Stop ]  [ <> Restart ]
    enabled       disabled      enabled       enabled
```

**Queued Task Drag Behavior**:
```
  Before drag:             During drag:              After drop:
  +------------------+    +------------------+      +------------------+
  | = Task A         |    | = Task A         |      | = Task A         |
  +------------------+    +------------------+      +------------------+
  +------------------+                               +------------------+
  | = Task B         |    +~~~~~~~~~~~~~~~~~~~~+     | = Task C         | <- moved
  +------------------+    | ~ Task C (dragging)|     +------------------+
  +------------------+    | ~ scale(1.02)      |     +------------------+
  | = Task C         |    | ~ shadow-lg        |     | = Task B         |
  +------------------+    +~~~~~~~~~~~~~~~~~~~~+     +------------------+
                          +------------------+
                          | = Task B         |
                          +------------------+
```

---

### 5c. Task Editor Modal

The task editor modal is used for creating new tasks and editing existing queued tasks.
It features a Monaco editor for the prompt and configuration options.

**Layout**: Centered modal overlay with form

```
+-----------------------------------------------------------------------------------+
|                                                                                   |
|         +-------------------------------------------------------+                 |
|         |  TASK EDITOR                                    [X]   |                 |
|         +-------------------------------------------------------+                 |
|         |                                                       |                 |
|         |  Prompt                                               |                 |
|         |  +---------------------------------------------------+|                 |
|         |  | (Monaco Editor - monospace, syntax highlighting)   ||                 |
|         |  |                                                   ||                 |
|         |  | Fix the authentication bug in login.tsx.          ||                 |
|         |  | The token validation should check for expiry      ||                 |
|         |  | before attempting to refresh. Also update the     ||                 |
|         |  | error messages to be more user-friendly.          ||                 |
|         |  |                                                   ||                 |
|         |  |                                                   ||                 |
|         |  |                                                   ||                 |
|         |  |                                         Ln 4 Col 1||                 |
|         |  +---------------------------------------------------+|                 |
|         |                                                       |                 |
|         |  +------------------------+ +------------------------+|                 |
|         |  | Priority               | | Max Turns              ||                 |
|         |  | [v] Medium           | | | [  10               ]  ||                 |
|         |  +------------------------+ +------------------------+|                 |
|         |                                                       |                 |
|         |  +---------------------------------------------------+|                 |
|         |  | [ ] Schedule this task                             ||                 |
|         |  +---------------------------------------------------+|                 |
|         |                                                       |                 |
|         |  (When schedule toggle is ON:)                        |                 |
|         |  +---------------------------------------------------+|                 |
|         |  | Cron Expression                                   ||                 |
|         |  | [ 0 9 * * 1-5                                   ] ||                 |
|         |  |                                                   ||                 |
|         |  | Next runs:                                        ||                 |
|         |  |   Mon Feb  9, 2026 at 09:00 AM                   ||                 |
|         |  |   Tue Feb 10, 2026 at 09:00 AM                   ||                 |
|         |  |   Wed Feb 11, 2026 at 09:00 AM                   ||                 |
|         |  +---------------------------------------------------+|                 |
|         |                                                       |                 |
|         |  +---------------------------------------------------+|                 |
|         |  |                    [Cancel]  [Save Task]          ||                 |
|         |  +---------------------------------------------------+|                 |
|         +-------------------------------------------------------+                 |
|                                                                                   |
+-----------------------------------------------------------------------------------+
  ^                         ^
  |-- Backdrop: bg-base     |-- Modal: bg-elevated
      at 60% opacity             backdrop-filter: blur(12px)
                                  max-width: 640px
                                  border: 1px solid var(--border-subtle)
                                  border-radius: var(--radius-xl)
```

**Task Editor Components**:

| Component             | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| **Modal Overlay**     | Fixed full-screen, `bg-base` at 60% opacity, click-outside-to-close |
| **Modal Container**   | Max-width 640px, centered, `bg-elevated`, glassmorphism, radius-xl |
| **Header**            | "Task Editor" title + close button (X icon)                       |
| **Prompt Editor**     | Monaco Editor instance, markdown mode, min-height 200px, resizable vertically |
| **Priority Dropdown** | Select: Critical / High / Medium / Low. Default: Medium           |
| **Max Turns Input**   | Number input, min 1, max 50, default 10                           |
| **Schedule Toggle**   | Checkbox/switch: "Schedule this task"                              |
| **Cron Input**        | Text input, shown when schedule is ON, validates cron syntax       |
| **Next Runs Preview** | Computed from cron expression, shows next 3 scheduled times        |
| **Action Buttons**    | Cancel (secondary) + Save Task (primary, accent-primary)           |

**Priority Color Coding**:
```
Critical  ->  --status-failed   (#FF6B6B)  Red dot
High      ->  --status-queued   (#F5A623)  Amber dot
Medium    ->  --accent-secondary (#6C5CE7)  Purple dot
Low       ->  --text-secondary  (#8892A6)  Gray dot
```

---

### 5d. Analytics Page

The analytics page provides usage statistics, cost tracking, and activity visualization
across all projects and instances.

**Layout**: Stats cards + chart grid + activity heatmap

```
+-----------------------------------------------------------------------------------+
|  SIDEBAR  |  ANALYTICS                                          [Date Range: 7d]  |
|           +-----------------------------------------------------------------------+
|           |                                                                       |
|  (...)    |  SUMMARY STATS                                                        |
|           |  +-------------+ +-------------+ +-------------+ +-------------------+|
|           |  | Tokens In   | | Tokens Out  | | Est. Cost   | | Success Rate      ||
|           |  | 1,247,832   | | 489,201     | | $12.47      | | 94.2%             ||
|           |  | +8.3% 7d    | | +5.1% 7d    | | -2.1% 7d    | | +1.8% 7d          ||
|           |  +-------------+ +-------------+ +-------------+ +-------------------+|
|           |                                                                       |
|           |  +------------------------------------------+ +----------------------+|
|           |  | TOKEN USAGE OVER TIME           [7d|30d] | | COST BY PROJECT      ||
|           |  |                                          | |                      ||
|           |  |  1.5M +                                  | |  Proj A  ████████ $5 ||
|           |  |       |        ...*...                   | |  Proj B  █████   $3  ||
|           |  |  1.0M +     ..*      *..                 | |  Proj C  ███     $2  ||
|           |  |       |   .*            *.               | |  Proj D  ██      $1  ||
|           |  |  0.5M + .*               *..             | |  Other   █      $0.5 ||
|           |  |       |*                    *...*        | |                      ||
|           |  |    0  +----+----+----+----+----+----+    | |                      ||
|           |  |       Mon  Tue  Wed  Thu  Fri  Sat  Sun  | |                      ||
|           |  |                                          | |                      ||
|           |  |  --- Input tokens  --- Output tokens     | |                      ||
|           |  +------------------------------------------+ +----------------------+|
|           |                                                                       |
|           |  +------------------------------------------------------------------+|
|           |  | ACTIVITY HEATMAP                                        2026      ||
|           |  |                                                                  ||
|           |  |      Jan          Feb          Mar          Apr          May      ||
|           |  | Mon  ## ## ## ##  ## ## ## ##  ## ## ## ##  ## ## ## ##  ## ## ##  ||
|           |  | Tue  ## ## ## ##  ## ## ## ##  ## ## ## ##  ## ## ## ##  ## ## ##  ||
|           |  | Wed  ## ## ## ##  ## ## ## ##  ## ## ## ##  ## ## ## ##  ## ## ##  ||
|           |  | Thu  ## ## ## ##  ## ## ## ##  ## ## ## ##  ## ## ## ##  ## ## ##  ||
|           |  | Fri  ## ## ## ##  ## ## ## ##  ## ## ## ##  ## ## ## ##  ## ## ##  ||
|           |  | Sat  .  .  .  .   .  .  .  .   .  .  .  .   .  .  .  .   .  .   ||
|           |  | Sun  .  .  .  .   .  .  .  .   .  .  .  .   .  .  .  .   .  .   ||
|           |  |                                                                  ||
|           |  |  Less [ . ][ # ][ ##][ ##][ ##] More       142 tasks this year   ||
|           |  +------------------------------------------------------------------+|
|           |                                                                       |
|           |  +------------------------------------------------------------------+|
|           |  | RECENT TASK COMPLETIONS                                          ||
|           |  | +--------+----------+---------+--------+--------+---------+      ||
|           |  | | Task   | Instance | Status  | Tokens | Cost   | Duration|      ||
|           |  | +--------+----------+---------+--------+--------+---------+      ||
|           |  | | #127   | Proj-A-1 | # Done  | 2,401  | $0.08  | 14m 32s |      ||
|           |  | | #126   | Proj-A-1 | # Done  | 1,203  | $0.04  | 3m 12s  |      ||
|           |  | | #125   | Proj-B-2 | ! Fail  | 892    | $0.03  | 1m 45s  |      ||
|           |  | | #124   | Proj-C-1 | # Done  | 3,100  | $0.10  | 22m 05s |      ||
|           |  | +--------+----------+---------+--------+--------+---------+      ||
|           |  +------------------------------------------------------------------+|
|           |                                                                       |
+-----------------------------------------------------------------------------------+
```

**Analytics Components**:

| Component              | Description                                                      |
| ---------------------- | ---------------------------------------------------------------- |
| **Date Range Selector**| Segmented control: 24h / 7d / 30d / 90d / Custom                |
| **Summary Stat Cards** | 4-column grid. Each: icon, value (display size), label, trend %  |
| **Token Usage Chart**  | Line chart (Recharts). Two series: input (teal) + output (purple). X: time, Y: token count |
| **Cost by Project**    | Horizontal bar chart. Sorted descending. Project name + bar + value |
| **Activity Heatmap**   | GitHub-style contribution grid. Color intensity = task count/day |
| **Recent Tasks Table** | Sortable table, status badge, linked to instance page            |

**Chart Color Assignments**:
```
Token Input Series   ->  --accent-primary     (#00D4AA)  Teal line
Token Output Series  ->  --accent-secondary   (#6C5CE7)  Purple line
Cost Bars            ->  --accent-primary     (#00D4AA)  Teal bars
Heatmap Scale        ->  --bg-hover to --accent-primary  (4-step gradient)
```

**Heatmap Color Scale**:
```css
.heatmap-0 { background: var(--bg-surface); }       /* No activity */
.heatmap-1 { background: #00D4AA33; }               /* Low (1-2 tasks) */
.heatmap-2 { background: #00D4AA66; }               /* Medium (3-5 tasks) */
.heatmap-3 { background: #00D4AA99; }               /* High (6-10 tasks) */
.heatmap-4 { background: var(--accent-primary); }   /* Very high (11+ tasks) */
```

---

### 5e. Settings Page

The settings page manages SSH configurations, global application settings, and
instance defaults.

**Layout**: Sectioned form with card-based groups

```
+-----------------------------------------------------------------------------------+
|  SIDEBAR  |  SETTINGS                                                             |
|           +-----------------------------------------------------------------------+
|           |                                                                       |
|  (...)    |  SSH CONFIGURATIONS                                        [+ Add]    |
|           |  +------------------------------------------------------------------+|
|           |  | +--------------------------------------------------------------+ ||
|           |  | | Production Server                                    [Edit]  | ||
|           |  | | Host: 192.168.1.10  |  User: deploy  |  Port: 22            | ||
|           |  | | Key: ~/.ssh/id_ed25519  |  Status: * Connected               | ||
|           |  | +--------------------------------------------------------------+ ||
|           |  | +--------------------------------------------------------------+ ||
|           |  | | Staging Server                                       [Edit]  | ||
|           |  | | Host: 192.168.1.20  |  User: deploy  |  Port: 22            | ||
|           |  | | Key: ~/.ssh/id_rsa      |  Status: ~ Disconnected           | ||
|           |  | +--------------------------------------------------------------+ ||
|           |  +------------------------------------------------------------------+|
|           |                                                                       |
|           |  GLOBAL DEFAULTS                                                      |
|           |  +------------------------------------------------------------------+|
|           |  |                                                                  ||
|           |  |  Default Model                                                   ||
|           |  |  [ claude-sonnet-4-20250514                              [v] ]       ||
|           |  |                                                                  ||
|           |  |  Default Max Turns                                               ||
|           |  |  [ 10                                                      ]     ||
|           |  |                                                                  ||
|           |  |  Terminal Scrollback Lines                                        ||
|           |  |  [ 10000                                                   ]     ||
|           |  |                                                                  ||
|           |  |  Auto-start Next Task                                            ||
|           |  |  [x] Automatically start the next queued task when current       ||
|           |  |      task completes successfully                                 ||
|           |  |                                                                  ||
|           |  |  Notification Preferences                                        ||
|           |  |  [x] Task completed     [x] Task failed                          ||
|           |  |  [ ] Task started       [x] Instance stopped unexpectedly        ||
|           |  |                                                                  ||
|           |  +------------------------------------------------------------------+|
|           |                                                                       |
|           |  COST TRACKING                                                        |
|           |  +------------------------------------------------------------------+|
|           |  |                                                                  ||
|           |  |  Monthly Budget Alert ($)                                        ||
|           |  |  [ 50.00                                                   ]     ||
|           |  |                                                                  ||
|           |  |  Token Pricing (per 1M tokens)                                   ||
|           |  |  Input:  [ $3.00      ]    Output: [ $15.00     ]                ||
|           |  |                                                                  ||
|           |  +------------------------------------------------------------------+|
|           |                                                                       |
|           |  DANGER ZONE                                                          |
|           |  +------------------------------------------------------------------+|
|           |  |  [Stop All Instances]   [Clear All Task History]   [Reset App]   ||
|           |  +------------------------------------------------------------------+|
|           |                                                                       |
|           |                                    [Cancel Changes]  [Save Settings]  |
|           |                                                                       |
+-----------------------------------------------------------------------------------+
```

**Settings Sections**:

| Section              | Contents                                                         |
| -------------------- | ---------------------------------------------------------------- |
| **SSH Configs**      | List of SSH configurations. Each card shows host, user, port, key path, connection status. Add/Edit/Delete/Test Connection actions. |
| **Global Defaults**  | Default model selector, max turns, scrollback lines, auto-start toggle, notification checkboxes |
| **Cost Tracking**    | Monthly budget threshold for alerts, per-model token pricing     |
| **Danger Zone**      | Destructive actions with red border, confirmation dialogs required |

---

## 6. Component Design Details

### 6.1 Status Badges

Status badges combine a color-coded dot with a text label. Used inline with instance
names, task titles, and table rows.

```
Variants:

  * Running     (teal dot with pulse glow + "Running" text)
  ~ Idle        (gray dot, no glow + "Idle" text)
  [] Queued     (amber dot with soft glow + "Queued" text)
  # Completed   (cyan dot with soft glow + "Completed" text)
  ! Failed      (red dot with soft glow + "Failed" text)
  || Paused     (amber dot, no pulse + "Paused" text)
```

```css
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px 2px 6px;
  border-radius: var(--radius-full);
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
}

/* Running variant */
.status-badge--running {
  color: var(--status-running);
  background: var(--status-running-dim);
}

/* Failed variant */
.status-badge--failed {
  color: var(--status-failed);
  background: var(--status-failed-dim);
}

/* (Other variants follow the same pattern) */
```

### 6.2 Cards

Cards are the primary container for grouped content. Used for project cards, stat cards,
settings sections, and task items.

```css
.card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: var(--space-6);
  transition: transform 200ms ease,
              box-shadow 200ms ease,
              border-color 200ms ease;
}

/* Interactive card (clickable, e.g., project card) */
.card--interactive:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
  border-color: var(--border-default);
}

/* Card with accent border (e.g., running task) */
.card--accent {
  border-left: 3px solid var(--accent-primary);
}

/* Card header */
.card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-4);
}

.card__title {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-primary);
}

.card__description {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: var(--space-1);
}
```

### 6.3 Buttons

Three button variants serve distinct interaction purposes.

```
+---------------------+  +---------------------+  +---------------------+
| [*] Start Instance  |  |    Cancel            |  |    Delete Instance  |
|     PRIMARY         |  |     SECONDARY        |  |     DESTRUCTIVE     |
+---------------------+  +---------------------+  +---------------------+
  accent-primary bg        bg-elevated bg           status-failed bg
  text-inverse text        text-secondary text      white text
  shadow-glow-teal         border-default           shadow-glow-red
```

```css
/* Base button */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 8px 16px;
  border-radius: var(--radius-md);
  font-family: var(--font-ui);
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition: background-color 200ms ease,
              box-shadow 200ms ease,
              transform 200ms ease;
  border: 1px solid transparent;
  outline: none;
}

.btn:focus-visible {
  box-shadow: 0 0 0 2px var(--bg-base),
              0 0 0 4px var(--accent-primary);
}

.btn:active {
  transform: scale(0.98);
}

/* Primary -- accent-primary background */
.btn--primary {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border-color: var(--accent-primary);
}

.btn--primary:hover {
  background: var(--accent-primary-hover);
  box-shadow: var(--shadow-glow-teal);
}

/* Secondary -- bg-elevated background */
.btn--secondary {
  background: var(--bg-elevated);
  color: var(--text-secondary);
  border-color: var(--border-default);
}

.btn--secondary:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-strong);
}

/* Destructive -- red background */
.btn--destructive {
  background: var(--status-failed);
  color: #FFFFFF;
  border-color: var(--status-failed);
}

.btn--destructive:hover {
  background: #FF8A8A;
  box-shadow: var(--shadow-glow-red);
}

/* Ghost -- no background, used for icon buttons */
.btn--ghost {
  background: transparent;
  color: var(--text-secondary);
  border-color: transparent;
}

.btn--ghost:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Button sizes */
.btn--sm { padding: 4px 10px; font-size: 12px; }
.btn--md { padding: 8px 16px; font-size: 13px; }   /* default */
.btn--lg { padding: 10px 20px; font-size: 14px; }

/* Icon-only button */
.btn--icon {
  padding: 8px;
  aspect-ratio: 1;
}
```

### 6.4 Input Fields

Form inputs use a consistent dark treatment with accent-colored focus states.

```css
/* Text input / number input / textarea */
.input {
  width: 100%;
  padding: 8px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: var(--font-ui);
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  transition: border-color 200ms ease,
              box-shadow 200ms ease;
}

.input::placeholder {
  color: var(--text-tertiary);
}

.input:hover {
  border-color: var(--border-strong);
}

.input:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-primary-dim);
}

/* Error state */
.input--error {
  border-color: var(--status-failed);
}

.input--error:focus {
  box-shadow: 0 0 0 3px rgba(255, 107, 107, 0.2);
}

/* Monospace input (cron expressions, file paths) */
.input--mono {
  font-family: var(--font-mono);
  font-size: 13px;
}

/* Select / dropdown */
.select {
  appearance: none;
  padding-right: 32px;
  background-image: url("data:image/svg+xml,..."); /* chevron-down icon */
  background-repeat: no-repeat;
  background-position: right 8px center;
  /* Inherits all .input styles */
}
```

### 6.5 Modals

Modals use a centered overlay with glassmorphism effect on the panel.

```css
/* Overlay backdrop */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(11, 14, 20, 0.60);       /* --bg-base at 60% */
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  animation: fade-in 200ms ease;
}

/* Modal panel */
.modal-panel {
  background: rgba(26, 31, 46, 0.85);        /* --bg-elevated at 85% */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xl);
  padding: var(--space-8);
  max-width: 640px;
  width: 90vw;
  max-height: 85vh;
  overflow-y: auto;
  box-shadow: var(--shadow-lg);
  animation: modal-enter 300ms ease;
}

/* Modal header */
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-6);
}

.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

/* Modal footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
  margin-top: var(--space-8);
  padding-top: var(--space-6);
  border-top: 1px solid var(--border-subtle);
}

@keyframes modal-enter {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}
```

### 6.6 Toast Notifications

Toast notifications appear in the bottom-right corner, auto-dismiss after 5 seconds,
and use a status-colored left border for quick visual classification.

```
  Bottom-right stack:

  +--------------------------------------------------+
  |  ____                                             |
  | |####|  Task #127 completed successfully    [X]   |
  | |####|  Instance Proj-A-1 -- 14m 32s              |
  |  ^^^^                                             |
  +--------------------------------------------------+
    ^--- Left border: 4px solid --status-completed

  +--------------------------------------------------+
  |  ____                                             |
  | |####|  Task #125 failed                    [X]   |
  | |####|  Error: Process exited with code 1         |
  |  ^^^^                                             |
  +--------------------------------------------------+
    ^--- Left border: 4px solid --status-failed
```

```css
/* Toast container -- fixed bottom-right */
.toast-container {
  position: fixed;
  bottom: var(--space-6);
  right: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  z-index: 100;
  pointer-events: none;
}

/* Individual toast */
.toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-5);
  background: var(--bg-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  min-width: 320px;
  max-width: 420px;
  animation: toast-enter 300ms ease;
}

/* Status-colored left border */
.toast--success { border-left: 4px solid var(--status-completed); }
.toast--error   { border-left: 4px solid var(--status-failed); }
.toast--warning { border-left: 4px solid var(--status-queued); }
.toast--info    { border-left: 4px solid var(--accent-primary); }

/* Toast title */
.toast__title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

/* Toast description */
.toast__description {
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 2px;
}

/* Toast close button */
.toast__close {
  margin-left: auto;
  color: var(--text-tertiary);
  cursor: pointer;
  transition: color 200ms ease;
}

.toast__close:hover {
  color: var(--text-primary);
}

/* Toast enter animation */
@keyframes toast-enter {
  from {
    opacity: 0;
    transform: translateX(100%);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Toast exit animation */
@keyframes toast-exit {
  from {
    opacity: 1;
    transform: translateX(0);
    max-height: 100px;
  }
  to {
    opacity: 0;
    transform: translateX(100%);
    max-height: 0;
    padding: 0;
    margin: 0;
  }
}
```

### 6.7 Sidebar Navigation

The sidebar provides persistent navigation across all pages.

```css
/* Sidebar container */
.sidebar {
  position: fixed;
  top: 0;
  left: 0;
  width: 240px;
  height: 100vh;
  background: var(--bg-surface);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  z-index: 40;
  overflow-y: auto;
}

/* Sidebar logo/brand */
.sidebar__brand {
  padding: var(--space-5) var(--space-5);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.sidebar__brand-icon {
  width: 28px;
  height: 28px;
  color: var(--accent-primary);
}

.sidebar__brand-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

/* Nav item */
.sidebar__nav-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 8px 16px;
  margin: 2px 8px;
  border-radius: var(--radius-md);
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 200ms ease,
              color 200ms ease;
}

.sidebar__nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Active nav item */
.sidebar__nav-item--active {
  background: var(--accent-primary-dim);
  color: var(--accent-primary);
  font-weight: 500;
}

/* Nav item icon */
.sidebar__nav-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

/* Section label */
.sidebar__section-label {
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-tertiary);
  padding: var(--space-4) var(--space-5) var(--space-2);
}

/* Project list item with status dot */
.sidebar__project-item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: 6px 16px 6px 24px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: var(--radius-md);
  margin: 1px 8px;
  transition: background-color 200ms ease,
              color 200ms ease;
}

.sidebar__project-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
```

### 6.8 Tables

Data tables for analytics and task history.

```css
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.table thead th {
  text-align: left;
  padding: var(--space-3) var(--space-4);
  font-weight: 500;
  font-size: 12px;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  border-bottom: 1px solid var(--border-default);
  white-space: nowrap;
}

.table tbody td {
  padding: var(--space-3) var(--space-4);
  color: var(--text-primary);
  border-bottom: 1px solid var(--border-subtle);
  vertical-align: middle;
}

.table tbody tr {
  transition: background-color 200ms ease;
}

.table tbody tr:hover {
  background: var(--bg-hover);
}

/* Monospace cells (task IDs, token counts) */
.table .cell-mono {
  font-family: var(--font-mono);
  font-size: 12px;
}
```

### 6.9 Split Pane

The resizable split pane for the instance page.

```css
.split-pane {
  display: flex;
  height: calc(100vh - 160px);  /* Subtract header + instance bar */
  overflow: hidden;
}

.split-pane__left {
  flex: 1 1 60%;
  min-width: 400px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.split-pane__divider {
  flex: 0 0 4px;
  background: var(--border-subtle);
  cursor: col-resize;
  transition: background-color 200ms ease;
  position: relative;
}

.split-pane__divider:hover,
.split-pane__divider--dragging {
  background: var(--accent-primary);
}

/* Wider hit target for easier grabbing */
.split-pane__divider::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  right: -4px;
}

.split-pane__right {
  flex: 1 1 40%;
  min-width: 300px;
  overflow-y: auto;
  padding: var(--space-4);
  background: var(--bg-surface);
  border-left: 1px solid var(--border-subtle);
}
```

---

## 7. Responsive Behavior

### Design Philosophy

Claude Orchestrator is a **desktop-first** application. The primary use case is a developer
sitting at a workstation with a wide display, likely alongside an IDE. However, the
interface should gracefully adapt to narrower viewports for tablet use and occasional
mobile check-ins.

### Breakpoints

```css
/* Tailwind default breakpoints, customized */
/* sm:  640px  -- Mobile landscape / small tablet */
/* md:  768px  -- Tablet portrait */
/* lg: 1024px  -- Tablet landscape / small desktop */
/* xl: 1280px  -- Standard desktop */
/* 2xl: 1536px -- Wide desktop */
```

### Responsive Rules

```
+-------------------+----------------+------------------------------------------------+
| Breakpoint        | Width          | Layout Changes                                 |
+-------------------+----------------+------------------------------------------------+
| Desktop (xl+)     | >= 1280px      | Full layout: sidebar + main content area       |
|                   |                | Split pane side-by-side (60/40)                |
|                   |                | Stats bar: 4-column grid                       |
|                   |                | Project grid: 2-3 columns                      |
+-------------------+----------------+------------------------------------------------+
| Small Desktop (lg)| 1024-1279px    | Sidebar collapses to icon-only (56px)          |
|                   |                | Split pane: 55/45 ratio                        |
|                   |                | Stats bar: 4-column grid (tighter)             |
|                   |                | Project grid: 2 columns                        |
+-------------------+----------------+------------------------------------------------+
| Tablet (md)       | 768-1023px     | Sidebar: off-canvas (hamburger toggle)         |
|                   |                | Split pane: stacked (terminal on top, queue    |
|                   |                |   below, each scrollable)                      |
|                   |                | Stats bar: 2x2 grid                            |
|                   |                | Project grid: 1 column                         |
+-------------------+----------------+------------------------------------------------+
| Mobile (sm)       | < 768px        | Sidebar: off-canvas overlay                    |
|                   |                | Split pane: stacked, full-width                |
|                   |                | Stats bar: 2x2 grid, compact values            |
|                   |                | Instance controls: horizontal scroll           |
|                   |                | Project grid: 1 column, full-width cards       |
|                   |                | Terminal: full-width, reduced scrollback        |
+-------------------+----------------+------------------------------------------------+
```

### Sidebar Collapse Behavior

```
  Desktop (>= 1280px):          Small Desktop (1024-1279px):     Tablet/Mobile (< 1024px):

  +------------------+          +------+                         +---+
  | [Logo] Claude    |          | [Lo] |                         | = | <- Hamburger
  |   Orchestrator   |          |      |                         +---+
  +------------------+          +------+                            |
  |                  |          |      |                         +--+---+
  | * Dashboard      |          | [*]  |                         | OFF- |
  |   Instances      |          | [I]  |                         | CANVAS|
  |   Analytics      |          | [A]  |                         | SLIDE |
  |   Settings       |          | [S]  |                         | PANEL |
  +------------------+          +------+                         +------+
  |                  |          |      |
  | PROJECTS         |          | PRJ  |
  |  > Project A     |          | [>A] |
  |  > Project B     |          | [>B] |
  +------------------+          +------+
  |                  |
  | + New Instance   |
  | + New Task       |
  +------------------+

  Width: 240px                  Width: 56px                      Width: 0px (overlay: 280px)
```

### Split Pane Stacking

On viewports narrower than 1024px, the instance page split pane switches from
horizontal (side-by-side) to vertical (stacked):

```
  Desktop (side-by-side):                Tablet/Mobile (stacked):

  +------------------------+----------+  +------------------------------------+
  | TERMINAL               | TASK     |  | TERMINAL (collapsible, 50vh max)   |
  |                        | QUEUE    |  |                                    |
  |                        |          |  | $ claude --model sonnet ...        |
  | $ claude --model ...   | Running  |  |   I'll analyze the issue...        |
  |   I'll analyze...      | #127     |  |                                    |
  |                        |          |  +------------------------------------+
  |                        | Queued   |  | TASK QUEUE (scrollable)            |
  |                        | #128     |  |                                    |
  |                        | #129     |  | Running: #127 Fix auth bug         |
  |                        |          |  | Queued: #128, #129, #130           |
  |                        | Done     |  | Completed: 12 tasks               |
  |                        | (12)     |  |                                    |
  +------------------------+----------+  +------------------------------------+
```

---

## 8. Animation Specifications

### 8.1 Page Transitions

Route changes use a simple fade to avoid disorientation while maintaining snappiness.

```css
/* Page wrapper */
.page-transition-enter {
  opacity: 0;
}

.page-transition-enter-active {
  opacity: 1;
  transition: opacity 200ms ease;
}

.page-transition-exit {
  opacity: 1;
}

.page-transition-exit-active {
  opacity: 0;
  transition: opacity 200ms ease;
}
```

React implementation with `framer-motion`:

```tsx
// PageWrapper.tsx
import { motion, AnimatePresence } from 'framer-motion';

const pageVariants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2, ease: 'easeOut' } },
  exit:    { opacity: 0, transition: { duration: 0.15, ease: 'easeIn' } },
};

export function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}
```

### 8.2 Card Hover

Interactive cards (project cards, instance tiles) lift slightly on hover.

```css
.card--interactive {
  transition: transform 200ms ease,
              box-shadow 200ms ease,
              border-color 200ms ease;
}

.card--interactive:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  border-color: var(--border-default);
}

.card--interactive:active {
  transform: translateY(0);
  box-shadow: var(--shadow-sm);
}
```

### 8.3 Status Dot Pulse

The running-state status dot pulses to indicate active execution.

```css
.status-dot--running {
  animation: status-pulse 2s ease-in-out infinite;
}

@keyframes status-pulse {
  0% {
    box-shadow: 0 0 4px rgba(0, 212, 170, 0.4),
                0 0 8px rgba(0, 212, 170, 0.2);
    transform: scale(1);
  }
  50% {
    box-shadow: 0 0 8px rgba(0, 212, 170, 0.6),
                0 0 20px rgba(0, 212, 170, 0.3);
    transform: scale(1.15);
  }
  100% {
    box-shadow: 0 0 4px rgba(0, 212, 170, 0.4),
                0 0 8px rgba(0, 212, 170, 0.2);
    transform: scale(1);
  }
}
```

### 8.4 Task Queue Drag

While dragging a queued task, it scales slightly and gains a prominent shadow.

```css
/* Task item during drag */
.task-item--dragging {
  transform: scale(1.02);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  border-color: var(--accent-primary);
  z-index: 10;
  cursor: grabbing;
  transition: none; /* Disable transitions during drag for immediate feedback */
}

/* Drop target indicator */
.task-item--drop-target::before {
  content: '';
  position: absolute;
  top: -2px;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--accent-primary);
  border-radius: 2px;
  animation: drop-indicator-pulse 1s ease-in-out infinite;
}

@keyframes drop-indicator-pulse {
  0%, 100% { opacity: 0.6; }
  50%      { opacity: 1.0; }
}

/* Task item settle after drop */
.task-item--settling {
  transition: transform 200ms ease,
              box-shadow 200ms ease;
}
```

### 8.5 Toast Enter/Exit

Toasts slide in from the right and slide out when dismissed.

```css
/* Enter */
@keyframes toast-slide-in {
  from {
    opacity: 0;
    transform: translateX(calc(100% + 24px));
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

/* Exit */
@keyframes toast-slide-out {
  from {
    opacity: 1;
    transform: translateX(0);
  }
  to {
    opacity: 0;
    transform: translateX(calc(100% + 24px));
  }
}

.toast-entering {
  animation: toast-slide-in 300ms ease forwards;
}

.toast-exiting {
  animation: toast-slide-out 200ms ease forwards;
}
```

### 8.6 Loading States

Skeleton loading for cards and data regions while content is being fetched.

```css
/* Skeleton shimmer */
.skeleton {
  background: linear-gradient(
    90deg,
    var(--bg-elevated) 25%,
    var(--bg-hover) 50%,
    var(--bg-elevated) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-md);
}

@keyframes skeleton-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* Skeleton variants */
.skeleton--text {
  height: 14px;
  width: 60%;
  margin-bottom: 8px;
}

.skeleton--title {
  height: 20px;
  width: 40%;
  margin-bottom: 12px;
}

.skeleton--card {
  height: 200px;
  width: 100%;
}
```

### 8.7 Full Animation Reference Table

| Element              | Trigger        | Property                   | Duration | Easing   | Notes                      |
| -------------------- | -------------- | -------------------------- | -------- | -------- | -------------------------- |
| Page transition      | Route change   | opacity                    | 200ms    | ease     | Fade in/out                |
| Card hover           | Mouse enter    | transform, box-shadow      | 200ms    | ease     | translateY(-2px)           |
| Card press           | Mouse down     | transform                  | 100ms    | ease     | translateY(0)              |
| Status dot pulse     | Running state  | box-shadow, transform      | 2000ms   | ease-in-out | Infinite loop           |
| Button hover         | Mouse enter    | background, box-shadow     | 200ms    | ease     | Color shift + glow         |
| Button press         | Mouse down     | transform                  | 100ms    | ease     | scale(0.98)                |
| Nav item hover       | Mouse enter    | background, color          | 200ms    | ease     | Background reveal          |
| Input focus          | Focus event    | border-color, box-shadow   | 200ms    | ease     | Accent ring appears        |
| Modal enter          | Open trigger   | opacity, transform         | 300ms    | ease     | Scale + fade in            |
| Modal overlay        | Open trigger   | opacity                    | 200ms    | ease     | Backdrop fade              |
| Toast enter          | Notification   | opacity, transform         | 300ms    | ease     | Slide in from right        |
| Toast exit           | Auto/dismiss   | opacity, transform         | 200ms    | ease     | Slide out to right         |
| Task drag            | Drag start     | transform, box-shadow      | instant  | --       | scale(1.02) + shadow       |
| Task settle          | Drop           | transform, box-shadow      | 200ms    | ease     | Return to normal           |
| Drop indicator       | Drag over      | opacity                    | 1000ms   | ease-in-out | Pulse loop              |
| Skeleton shimmer     | Loading state  | background-position        | 1500ms   | ease-in-out | Infinite loop           |
| Split pane resize    | Drag divider   | flex-basis                 | instant  | --       | No transition during drag  |
| Sidebar collapse     | Breakpoint     | width                      | 200ms    | ease     | 240px -> 56px              |
| Sidebar slide        | Toggle         | transform                  | 300ms    | ease-out | Mobile off-canvas          |
| Tooltip              | Mouse enter    | opacity, transform         | 150ms    | ease     | Fade + slight Y offset     |
| Dropdown open        | Click          | opacity, transform         | 150ms    | ease-out | Scale from top             |

---

## 9. Accessibility Considerations

While the application is dark-theme-only and developer-focused, accessibility standards
must still be met.

### Color Contrast

All text/background combinations must meet WCAG AA contrast ratios (4.5:1 for normal text,
3:1 for large text):

| Combination                              | Ratio   | Pass? |
| ---------------------------------------- | ------- | ----- |
| `--text-primary` (#E8ECF4) on `--bg-base` (#0B0E14)     | 14.2:1  | AA    |
| `--text-primary` (#E8ECF4) on `--bg-surface` (#111620)  | 11.8:1  | AA    |
| `--text-primary` (#E8ECF4) on `--bg-elevated` (#1A1F2E) | 9.1:1   | AA    |
| `--text-secondary` (#8892A6) on `--bg-base` (#0B0E14)   | 5.8:1   | AA    |
| `--text-secondary` (#8892A6) on `--bg-elevated` (#1A1F2E)| 4.5:1  | AA    |
| `--text-tertiary` (#4A5568) on `--bg-base` (#0B0E14)    | 2.8:1   | Fail* |
| `--accent-primary` (#00D4AA) on `--bg-base` (#0B0E14)   | 9.5:1   | AA    |
| `--text-inverse` (#0B0E14) on `--accent-primary` (#00D4AA)| 9.5:1 | AA    |

*`--text-tertiary` is intentionally below ratio for disabled/hint content. Disabled
elements are not required to meet contrast ratios per WCAG, but should not carry
critical information.

### Keyboard Navigation

- All interactive elements are focusable and operable via keyboard
- Focus rings use `--border-accent` (visible, 3px box-shadow)
- Tab order follows visual layout (sidebar -> header -> main content)
- Modal traps focus within when open
- Escape closes modals, dropdowns, and toasts
- Terminal panel passes keyboard events to xterm.js when focused
- Drag-and-drop has keyboard alternatives (arrow keys to reorder tasks)

### Screen Reader Support

- All images and icons have `aria-label` or are `aria-hidden`
- Status badges include `role="status"` and `aria-live="polite"`
- Dynamic content updates use `aria-live` regions
- Modal uses `role="dialog"` with `aria-labelledby` and `aria-describedby`
- Navigation uses `role="navigation"` with `aria-label`

### Motion Sensitivity

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 10. Implementation Notes

### Technology Mapping

| Design Concept         | Implementation                                                |
| ---------------------- | ------------------------------------------------------------- |
| Color tokens           | CSS custom properties in `globals.css` + Tailwind config      |
| Typography             | Tailwind `fontSize` extension + `@font-face` in CSS           |
| Component styling      | Tailwind utility classes + shadcn/ui components               |
| Glassmorphism          | Tailwind `backdrop-blur-xl` + custom `bg-opacity` classes     |
| Animations             | Framer Motion for page/modal + CSS animations for micro       |
| Terminal               | xterm.js with WebGL addon, FitAddon, SearchAddon              |
| Charts                 | Recharts (line, bar) + custom SVG for heatmap                 |
| Drag and drop          | @dnd-kit/core + @dnd-kit/sortable                             |
| Code editor            | Monaco Editor (React wrapper: @monaco-editor/react)           |
| Split pane             | react-resizable-panels or custom implementation               |
| Toast notifications    | sonner (Tailwind-native toast library)                        |
| Icons                  | Lucide React (consistent with shadcn/ui)                      |

### Tailwind Configuration Checklist

```js
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0B0E14',
          surface: '#111620',
          elevated: '#1A1F2E',
          hover: '#232A3B',
        },
        accent: {
          primary: '#00D4AA',
          'primary-dim': '#00D4AA33',
          secondary: '#6C5CE7',
          'secondary-dim': '#6C5CE733',
        },
        text: {
          primary: '#E8ECF4',
          secondary: '#8892A6',
          tertiary: '#4A5568',
          inverse: '#0B0E14',
        },
        status: {
          running: '#00D4AA',
          queued: '#F5A623',
          completed: '#4ECDC4',
          failed: '#FF6B6B',
          idle: '#8892A6',
          paused: '#F5A623',
        },
        border: {
          subtle: '#1E2535',
          default: '#2A3244',
          strong: '#3A4556',
          accent: '#00D4AA66',
        },
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
        xl: '12px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.3)',
        md: '0 4px 12px rgba(0, 0, 0, 0.4)',
        lg: '0 8px 24px rgba(0, 0, 0, 0.5)',
        'glow-teal': '0 0 20px rgba(0, 212, 170, 0.15)',
        'glow-red': '0 0 20px rgba(255, 107, 107, 0.15)',
      },
      animation: {
        'status-pulse': 'status-pulse 2s ease-in-out infinite',
        'skeleton-shimmer': 'skeleton-shimmer 1.5s ease-in-out infinite',
        'toast-in': 'toast-slide-in 300ms ease forwards',
        'toast-out': 'toast-slide-out 200ms ease forwards',
        'modal-in': 'modal-enter 300ms ease',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'), // For shadcn/ui animations
  ],
};
```

### File Structure for Design System

```
frontend/src/
├── styles/
│   ├── globals.css          # CSS custom properties, @font-face, base resets
│   ├── animations.css       # @keyframes definitions
│   └── terminal-theme.css   # xterm.js theme overrides
├── components/
│   └── ui/                  # shadcn/ui components (customized to match design system)
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       ├── select.tsx
│       ├── dialog.tsx       # Modal
│       ├── toast.tsx        # Toast notifications (via sonner)
│       ├── badge.tsx        # Status badges
│       ├── skeleton.tsx     # Loading skeletons
│       └── tooltip.tsx
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   ├── PageWrapper.tsx  # Animation wrapper
│   │   └── SplitPane.tsx
│   ├── terminal/
│   │   ├── TerminalPanel.tsx
│   │   └── TerminalToolbar.tsx
│   ├── tasks/
│   │   ├── TaskQueue.tsx
│   │   ├── TaskCard.tsx
│   │   ├── TaskEditorModal.tsx
│   │   └── DraggableTaskList.tsx
│   ├── dashboard/
│   │   ├── StatsBar.tsx
│   │   ├── ProjectGrid.tsx
│   │   ├── ProjectCard.tsx
│   │   └── InstanceTile.tsx
│   └── analytics/
│       ├── SummaryStats.tsx
│       ├── TokenUsageChart.tsx
│       ├── CostByProjectChart.tsx
│       └── ActivityHeatmap.tsx
└── lib/
    └── cn.ts                # clsx + tailwind-merge utility
```

---

## Appendix: Icon Reference

All icons sourced from [Lucide](https://lucide.dev/), 18px default size, 1.5px stroke.

| Usage                 | Icon Name          | Context                          |
| --------------------- | ------------------ | -------------------------------- |
| Dashboard nav         | `LayoutDashboard`  | Sidebar navigation               |
| Instances nav         | `Terminal`         | Sidebar navigation               |
| Analytics nav         | `BarChart3`        | Sidebar navigation               |
| Settings nav          | `Settings`         | Sidebar navigation               |
| Start instance        | `Play`             | Instance controls                |
| Pause instance        | `Pause`            | Instance controls                |
| Stop instance         | `Square`           | Instance controls                |
| Restart instance      | `RotateCcw`        | Instance controls                |
| Add task              | `Plus`             | Task queue actions               |
| Delete / remove       | `Trash2`           | Destructive actions              |
| Edit                  | `Pencil`           | Edit task / settings             |
| Drag handle           | `GripVertical`     | Draggable task items             |
| Search                | `Search`           | Global search, terminal search   |
| Close                 | `X`                | Modal close, toast dismiss       |
| Chevron expand        | `ChevronDown`      | Collapsible sections             |
| External link         | `ExternalLink`     | Open in new tab                  |
| Copy                  | `Copy`             | Copy to clipboard                |
| Download / export     | `Download`         | Export terminal output           |
| Clock / timer         | `Clock`            | Task duration, schedule          |
| Activity              | `Activity`         | Stats, active instances          |
| Tokens                | `Coins`            | Token count displays             |
| Cost                  | `DollarSign`       | Cost displays                    |
| Success               | `CheckCircle`      | Completed state                  |
| Error                 | `AlertCircle`      | Failed state                     |
| Warning               | `AlertTriangle`    | Warning states                   |
| Info                  | `Info`             | Informational toasts             |
| SSH / connection      | `Link`             | SSH configuration                |
| Project / folder      | `FolderOpen`       | Project references               |
| User / avatar         | `User`             | User menu                        |
| Help                  | `HelpCircle`       | Help menu                        |
