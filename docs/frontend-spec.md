# Claude Orchestrator -- Frontend Specification

## 1. Overview

The Claude Orchestrator frontend is a single-page application built with **React 18**, **TypeScript 5.5**, and **Vite 5**. It provides a real-time management interface for orchestrating multiple Claude Code instances, organizing them into projects, queuing tasks, scheduling automated runs, and visualizing usage analytics.

### Core Technology Stack

| Layer              | Technology                          | Purpose                                      |
|--------------------|-------------------------------------|----------------------------------------------|
| UI Framework       | React 18.3                          | Component rendering, concurrent features     |
| Language           | TypeScript 5.5                      | Static typing, interfaces, strict mode       |
| Build Tool         | Vite 5.x                            | Dev server with HMR, production bundling     |
| Styling            | Tailwind CSS 3.4 + shadcn/ui        | Utility-first CSS, accessible primitives     |
| Routing            | React Router v7                     | Nested routes, loaders, lazy loading         |
| Server State       | TanStack React Query 5.x            | Cache, refetch, optimistic updates           |
| Client State       | Zustand 5.x                         | Lightweight stores for UI and connection      |
| Real-time          | Native WebSocket + custom hooks     | Live instance output, status updates         |
| Terminal           | xterm.js 5.5                        | Full terminal emulator in-browser            |
| Charts             | Recharts 2.12                       | Token usage, cost breakdowns, activity maps  |
| Drag & Drop        | dnd-kit 6.x / sortable 8.x         | Task queue reordering                        |
| Code Editing       | Monaco Editor (React) 4.6           | Task content editing with markdown support   |

### Design Principles

- **Real-time first**: Every data surface updates via WebSocket push. Polling is used only as a fallback when the socket is reconnecting.
- **Optimistic UI**: Mutations (task reorder, status change, config update) are applied locally before server confirmation, with automatic rollback on failure.
- **Progressive disclosure**: The dashboard shows aggregate health; drilling into a project reveals instances; drilling into an instance reveals its terminal and task queue.
- **Accessible by default**: All interactive components use shadcn/ui primitives built on Radix UI, which supply ARIA attributes, keyboard navigation, and focus management out of the box.

---

## 2. Project Structure

```
frontend/
├── src/
│   ├── main.tsx                           # React DOM root, providers, router mount
│   ├── App.tsx                            # Top-level route layout, Suspense boundaries
│   ├── index.css                          # Tailwind directives + CSS custom properties
│   │
│   ├── components/
│   │   ├── ui/                            # shadcn/ui primitives (Button, Dialog, Card,
│   │   │                                  #   DropdownMenu, Input, Label, Select, Sheet,
│   │   │                                  #   Skeleton, Tabs, Toast, Tooltip, etc.)
│   │   │
│   │   ├── layout/
│   │   │   ├── AppShell.tsx               # Root layout: sidebar + header + main content
│   │   │   ├── Sidebar.tsx                # Collapsible nav with project tree
│   │   │   ├── Header.tsx                 # Breadcrumbs, global search, user menu
│   │   │   └── StatusBar.tsx              # Bottom bar: WS status, active instances count
│   │   │
│   │   ├── projects/
│   │   │   ├── ProjectCard.tsx            # Summary card shown on dashboard
│   │   │   ├── ProjectForm.tsx            # Create/edit project dialog
│   │   │   └── ProjectSettings.tsx        # Environment variables, default config
│   │   │
│   │   ├── instances/
│   │   │   ├── InstancePanel.tsx          # Split-pane view: terminal + task queue
│   │   │   ├── InstanceCard.tsx           # Compact instance representation in lists
│   │   │   ├── InstanceConfig.tsx         # Model selection, max tokens, system prompt
│   │   │   ├── InstanceControls.tsx       # Start / Stop / Restart / Kill buttons
│   │   │   └── InstanceTerminal.tsx       # xterm.js wrapper with search + scrollback
│   │   │
│   │   ├── tasks/
│   │   │   ├── TaskQueue.tsx              # Full queue with drag-and-drop sections
│   │   │   ├── TaskCard.tsx               # Individual task row with status badge
│   │   │   ├── TaskEditor.tsx             # Monaco-powered content editor
│   │   │   ├── TaskBulkAdd.tsx            # Paste/import multiple tasks at once
│   │   │   └── TaskResult.tsx             # Collapsible result viewer (markdown render)
│   │   │
│   │   ├── schedules/
│   │   │   ├── ScheduleList.tsx           # Table of all schedules with toggle switches
│   │   │   ├── ScheduleForm.tsx           # Cron expression builder + task template
│   │   │   └── CronPreview.tsx            # Human-readable cron + next 5 fire times
│   │   │
│   │   └── analytics/
│   │       ├── UsageDashboard.tsx          # Aggregate charts container
│   │       ├── TokenChart.tsx              # Line/area chart of token consumption
│   │       ├── CostBreakdown.tsx           # Stacked bar chart by model/project
│   │       └── ActivityHeatmap.tsx         # GitHub-style heatmap of task activity
│   │
│   ├── pages/
│   │   ├── DashboardPage.tsx              # Global overview: project cards, stats, alerts
│   │   ├── ProjectPage.tsx                # Single project: instances list, settings tabs
│   │   ├── InstancePage.tsx               # Single instance: InstancePanel full-screen
│   │   ├── SchedulesPage.tsx              # All schedules management
│   │   ├── AnalyticsPage.tsx              # UsageDashboard + date range selectors
│   │   └── SettingsPage.tsx               # Global settings: API keys, defaults, themes
│   │
│   ├── hooks/
│   │   ├── useWebSocket.ts               # Core WS connection with auto-reconnect
│   │   ├── useInstanceStream.ts           # Subscribe to instance-specific output
│   │   ├── useTaskQueue.ts               # Task CRUD with optimistic updates
│   │   └── useDashboardUpdates.ts        # Global status + metrics subscription
│   │
│   ├── stores/
│   │   ├── appStore.ts                    # UI state: sidebar collapsed, active modals
│   │   └── connectionStore.ts             # WebSocket readiness, reconnect attempts
│   │
│   ├── lib/
│   │   ├── api.ts                         # Axios instance with interceptors
│   │   ├── queryClient.ts                 # TanStack Query client configuration
│   │   └── utils.ts                       # cn() helper, formatters, constants
│   │
│   └── types/
│       └── index.ts                       # Shared TypeScript interfaces and enums
│
├── tailwind.config.ts                     # Theme tokens, custom plugin config
├── vite.config.ts                         # Aliases, proxy, build options
├── tsconfig.json                          # Strict mode, path aliases
├── package.json                           # Dependencies, scripts
└── Dockerfile                             # Multi-stage production build
```

### Directory Conventions

- **`components/ui/`** -- Only contains shadcn/ui generated primitives. These are never modified directly; customisation happens through the `className` prop and Tailwind.
- **`components/<domain>/`** -- Domain-specific components. Each file exports a single named component. Co-located test files use the `.test.tsx` suffix.
- **`pages/`** -- One component per route. Pages compose domain components, wire up data fetching via React Query hooks, and handle URL parameter parsing.
- **`hooks/`** -- Custom hooks that encapsulate side effects, subscriptions, or complex derived state. Each hook is in its own file and re-exported from `hooks/index.ts`.
- **`stores/`** -- Zustand stores. Each store is a single file exporting a `use<Name>Store` hook.
- **`lib/`** -- Pure utilities and configuration singletons. No React imports.
- **`types/`** -- Shared interfaces. Domain-specific types that are only used in one component can be co-located with that component instead.

---

## 3. Component Specifications

### 3.1 Layout Components

#### AppShell

The root layout component that wraps every page. It provides the persistent sidebar, header, and status bar.

```typescript
// components/layout/AppShell.tsx

interface AppShellProps {
  children: React.ReactNode;
}
```

**Key behaviors:**

- Reads `sidebarCollapsed` from `appStore` to toggle between a 64 px icon-only sidebar and a 280 px expanded sidebar.
- Applies a CSS grid layout: `grid-template-columns: auto 1fr` / `grid-template-rows: 56px 1fr 32px`.
- The sidebar, header, and status bar are always rendered; `children` fills the main content area.
- On viewports narrower than 1024 px, the sidebar becomes an overlay `Sheet` (shadcn/ui) triggered from the header hamburger button.

**State management:** Reads from `appStore` (sidebar state, active modal). Does not manage server state.

**Child components:**

| Component   | Slot              | Description                                    |
|-------------|-------------------|------------------------------------------------|
| `Sidebar`   | Left column       | Navigation tree, project list, quick actions   |
| `Header`    | Top row           | Breadcrumbs, global search, notification bell  |
| `StatusBar` | Bottom row        | WebSocket indicator, active instance count     |

```typescript
// Simplified render structure
export function AppShell({ children }: AppShellProps) {
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);

  return (
    <div className="grid h-screen grid-rows-[56px_1fr_32px] grid-cols-[auto_1fr]">
      <Sidebar collapsed={sidebarCollapsed} className="row-span-3" />
      <Header />
      <main className="overflow-auto p-6">{children}</main>
      <StatusBar />
    </div>
  );
}
```

---

#### Sidebar

```typescript
interface SidebarProps {
  collapsed: boolean;
  className?: string;
}
```

**Key behaviors:**

- Renders a vertical navigation list: Dashboard, Schedules, Analytics, Settings (always visible).
- Below the static links, renders a collapsible "Projects" section fetched via `useQuery(['projects'])`.
- Each project expands to show its instances as nested links.
- Active route is highlighted using `useLocation()` matching.
- A "New Project" button at the bottom opens `ProjectForm` in a dialog.
- The collapse toggle is a chevron button at the top that calls `appStore.toggleSidebar()`.

**State management:**

- `appStore.sidebarCollapsed` -- UI toggle.
- React Query -- `['projects']` query for the project tree data.

---

#### Header

```typescript
interface HeaderProps {
  className?: string;
}
```

**Key behaviors:**

- Renders breadcrumbs derived from the current route via `useMatches()`.
- Contains a global search `Command` palette (shadcn/ui) triggered by `Cmd+K` / `Ctrl+K`.
- Shows a notification bell with unread count badge.
- User avatar dropdown with theme toggle and logout.

---

#### StatusBar

```typescript
interface StatusBarProps {
  className?: string;
}
```

**Key behaviors:**

- Displays a colored dot indicating WebSocket connection state: green (connected), yellow (reconnecting), red (disconnected). Reads from `connectionStore`.
- Shows the count of currently running instances from `useDashboardUpdates`.
- Shows the most recent event timestamp.

---

### 3.2 Instance Components

#### InstancePanel

The primary workspace for interacting with a single Claude instance. Uses a resizable split-pane layout.

```typescript
interface InstancePanelProps {
  instanceId: string;
}
```

**Key behaviors:**

- Splits the viewport into two resizable panes (default 60% / 40%) using a CSS `resize` handle or a lightweight splitter library.
- Left pane: `InstanceTerminal` (live output stream).
- Right pane: `TaskQueue` (current tasks with drag-and-drop).
- A toolbar at the top contains `InstanceControls` (start/stop/restart) and `InstanceConfig` (accessible via a settings icon that opens a slide-over).
- Split orientation flips to vertical on viewports narrower than 768 px.

**State management:**

- React Query -- `['instances', instanceId]` for instance metadata and status.
- `useInstanceStream(instanceId)` -- WebSocket subscription for terminal data.
- `useTaskQueue(instanceId)` -- Task list and mutations.

**Child components:**

| Component           | Location           | Description                          |
|---------------------|--------------------|--------------------------------------|
| `InstanceControls`  | Toolbar            | Action buttons with confirmation     |
| `InstanceTerminal`  | Left pane          | xterm.js terminal emulator           |
| `TaskQueue`         | Right pane         | Drag-and-drop task list              |
| `InstanceConfig`    | Slide-over (Sheet) | Model params and system prompt       |

```typescript
export function InstancePanel({ instanceId }: InstancePanelProps) {
  const { data: instance } = useQuery({
    queryKey: ['instances', instanceId],
    queryFn: () => api.getInstance(instanceId),
  });

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <h2 className="text-lg font-semibold">{instance?.name}</h2>
        <InstanceControls instanceId={instanceId} status={instance?.status} />
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon">
              <Settings className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent>
            <InstanceConfig instanceId={instanceId} />
          </SheetContent>
        </Sheet>
      </div>

      {/* Split Pane */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-[3] min-w-0">
          <InstanceTerminal instanceId={instanceId} />
        </div>
        <div className="w-1 cursor-col-resize bg-border hover:bg-primary/20" />
        <div className="flex-[2] min-w-0 overflow-auto">
          <TaskQueue instanceId={instanceId} />
        </div>
      </div>
    </div>
  );
}
```

---

#### InstanceTerminal

Integrates xterm.js to render a full terminal emulator displaying real-time Claude instance output.

```typescript
interface InstanceTerminalProps {
  instanceId: string;
  className?: string;
}
```

**Key behaviors:**

- Initializes an `xterm.Terminal` instance on mount with the following addons:
  - `FitAddon` -- auto-sizes to the container.
  - `SearchAddon` -- supports `Ctrl+F` in-terminal search with match highlighting.
  - `WebLinksAddon` -- makes URLs in output clickable.
  - `Unicode11Addon` -- correct glyph widths for international text.
- Subscribes to the instance output stream via `useInstanceStream(instanceId)`.
- Each incoming chunk is written directly to `terminal.write(data)`, preserving ANSI escape codes for colored output (Claude Code output includes ANSI colors for diffs, file paths, and status messages).
- Scrollback buffer is set to **10,000 lines** by default, configurable through instance settings.
- A floating toolbar in the top-right corner provides:
  - Search toggle (`Ctrl+F`).
  - Clear terminal button (local only; does not affect the server-side log).
  - Download raw log as `.txt`.
  - Scroll-to-bottom button (appears only when the user has scrolled up).
- The terminal container is wrapped in a `ResizeObserver` that calls `fitAddon.fit()` on dimension changes.
- On unmount, the terminal instance and all addons are disposed to prevent memory leaks.

**State management:**

- Local refs (`useRef`) for the `Terminal` instance and addon objects.
- `useInstanceStream(instanceId)` for the data feed.
- No Zustand or React Query involvement -- all state is local to the terminal.

```typescript
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';

export function InstanceTerminal({ instanceId, className }: InstanceTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;

    const terminal = new Terminal({
      cursorBlink: false,
      disableStdin: true,          // Read-only output display
      scrollback: 10_000,
      fontSize: 13,
      fontFamily: '"JetBrains Mono", "Fira Code", monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e4e4e7',
        cursor: '#e4e4e7',
        selectionBackground: '#3f3f46',
      },
      convertEol: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(new WebLinksAddon());

    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    return () => {
      terminal.dispose();
    };
  }, []);

  // Subscribe to instance output
  useInstanceStream(instanceId, {
    onData: (chunk: string) => {
      terminalRef.current?.write(chunk);
    },
  });

  // Resize handling
  useEffect(() => {
    if (!containerRef.current || !fitAddonRef.current) return;

    const observer = new ResizeObserver(() => {
      fitAddonRef.current?.fit();
    });
    observer.observe(containerRef.current);

    return () => observer.disconnect();
  }, []);

  return (
    <div className={cn('relative h-full bg-[#0a0a0a]', className)}>
      <div ref={containerRef} className="h-full w-full" />
      <TerminalToolbar
        onSearch={() => {/* toggle search UI */}}
        onClear={() => terminalRef.current?.clear()}
        onScrollToBottom={() => terminalRef.current?.scrollToBottom()}
      />
    </div>
  );
}
```

---

#### InstanceControls

```typescript
interface InstanceControlsProps {
  instanceId: string;
  status?: InstanceStatus;
}

type InstanceStatus = 'idle' | 'running' | 'paused' | 'error' | 'starting' | 'stopping';
```

**Key behaviors:**

- Renders a button group whose available actions depend on `status`:
  - `idle` / `error` -- **Start** (green play icon).
  - `running` -- **Pause**, **Stop** (with confirmation dialog), **Restart**.
  - `paused` -- **Resume**, **Stop**.
  - `starting` / `stopping` -- All buttons disabled, spinner shown.
- Each action calls the corresponding API mutation via `useMutation` from React Query.
- Stop and Restart show an `AlertDialog` confirmation.

---

#### InstanceConfig

```typescript
interface InstanceConfigProps {
  instanceId: string;
}
```

**Key behaviors:**

- A form rendered inside a `Sheet` slide-over panel.
- Fields include:
  - **Name** -- text input.
  - **Model** -- select dropdown (`claude-sonnet-4-20250514`, `claude-opus-4-0-20250514`, etc.).
  - **Max tokens** -- number input with preset buttons (1024, 4096, 8192, 16384).
  - **System prompt** -- multiline textarea.
  - **Working directory** -- text input with filesystem browse button.
  - **Environment variables** -- key/value pair editor (add/remove rows).
- Submits via `useMutation` with `['instances', instanceId]` query invalidation on success.
- Uses `react-hook-form` with `zod` schema validation.

---

#### InstanceCard

```typescript
interface InstanceCardProps {
  instance: Instance;
  onClick?: () => void;
}
```

**Key behaviors:**

- A compact card used in project views and the dashboard.
- Displays: name, status badge (color-coded), model, current task summary (truncated), uptime.
- Clicking navigates to `/instances/:id`.
- A context menu (right-click or three-dot button) provides quick actions: Start, Stop, Duplicate, Delete.

---

### 3.3 Task Components

#### TaskQueue

Displays the full task queue for an instance, organized into status sections with drag-and-drop reordering.

```typescript
interface TaskQueueProps {
  instanceId: string;
}
```

**Key behaviors:**

- Fetches tasks via `useTaskQueue(instanceId)` which returns `{ tasks, addTask, removeTask, reorderTasks, updateTask }`.
- Groups tasks into three collapsible sections:
  1. **Running** (0 or 1 task) -- highlighted with a pulsing border.
  2. **Queued** -- ordered list, supports drag-and-drop reorder.
  3. **Completed** -- reverse chronological, collapsed by default.
- Drag-and-drop is implemented with `@dnd-kit/core` and `@dnd-kit/sortable`:
  - Only queued tasks are draggable.
  - Dropping triggers `reorderTasks(newOrder)` which performs an optimistic update.
  - Smooth animated transitions via `@dnd-kit`'s built-in CSS transform strategy.
- An "Add Task" button at the top opens `TaskEditor` in a dialog.
- A "Bulk Add" button opens `TaskBulkAdd` for pasting multiple tasks.
- Each task is rendered as a `TaskCard`.

**State management:**

- `useTaskQueue` hook (wraps React Query mutations with optimistic update logic).
- `@dnd-kit` context (`DndContext`, `SortableContext`) is local to this component.

```typescript
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';

export function TaskQueue({ instanceId }: TaskQueueProps) {
  const { tasks, reorderTasks, addTask } = useTaskQueue(instanceId);

  const running = tasks.filter((t) => t.status === 'running');
  const queued = tasks.filter((t) => t.status === 'queued');
  const completed = tasks.filter((t) => t.status === 'completed');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = queued.findIndex((t) => t.id === active.id);
    const newIndex = queued.findIndex((t) => t.id === over.id);

    reorderTasks({ oldIndex, newIndex });
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h3 className="font-semibold">Task Queue</h3>
        <div className="flex gap-1">
          <TaskBulkAdd instanceId={instanceId} onAdd={addTask} />
          <TaskEditor instanceId={instanceId} onSave={addTask} />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-2 space-y-4">
        {/* Running Section */}
        {running.length > 0 && (
          <section>
            <h4 className="text-xs font-medium text-muted-foreground mb-1">
              Running
            </h4>
            {running.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </section>
        )}

        {/* Queued Section -- Drag & Drop */}
        <section>
          <h4 className="text-xs font-medium text-muted-foreground mb-1">
            Queued ({queued.length})
          </h4>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={queued.map((t) => t.id)}
              strategy={verticalListSortingStrategy}
            >
              {queued.map((task) => (
                <TaskCard key={task.id} task={task} sortable />
              ))}
            </SortableContext>
          </DndContext>
        </section>

        {/* Completed Section */}
        <Collapsible>
          <CollapsibleTrigger className="text-xs font-medium text-muted-foreground">
            Completed ({completed.length})
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-1 mt-1">
            {completed.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
```

---

#### TaskCard

```typescript
interface TaskCardProps {
  task: Task;
  sortable?: boolean;
}
```

**Key behaviors:**

- When `sortable` is true, wraps content with `useSortable()` from `@dnd-kit/sortable` and renders a drag handle (grip icon).
- Displays: priority badge (P1--P4 with color coding), title (truncated), status icon, token usage (if completed), duration.
- Clicking the card expands it inline to show the full task description and, if completed, a `TaskResult` component.
- A dropdown menu provides: Edit, Duplicate, Move to Top, Cancel, Delete.
- Running tasks show an animated progress indicator.

```typescript
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

export function TaskCard({ task, sortable = false }: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: task.id,
    disabled: !sortable,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-2 rounded-md border p-2 bg-card',
        task.status === 'running' && 'border-primary animate-pulse-subtle',
      )}
    >
      {sortable && (
        <button
          className="cursor-grab text-muted-foreground"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      )}
      <PriorityBadge priority={task.priority} />
      <span className="flex-1 truncate text-sm">{task.title}</span>
      <StatusIcon status={task.status} />
    </div>
  );
}
```

---

#### TaskEditor

A dialog containing a Monaco editor for authoring task content, plus controls for priority and execution limits.

```typescript
interface TaskEditorProps {
  instanceId: string;
  task?: Task;                         // If provided, edit mode; otherwise create mode
  onSave: (task: TaskInput) => void;
}

interface TaskInput {
  title: string;
  content: string;                     // Markdown task description / prompt
  priority: 1 | 2 | 3 | 4;
  maxTurns?: number;
  tags?: string[];
}
```

**Key behaviors:**

- Opens as a full-width `Dialog` (max-width 800 px).
- The main area is a Monaco editor instance configured for Markdown language mode:
  - Minimap disabled.
  - Word wrap enabled.
  - Line numbers on.
  - Theme matched to the application theme (dark/light).
  - Custom Markdown snippets for common task patterns (e.g., "Fix bug in...", "Add feature...").
- Above the editor: a title input field.
- Below the editor: a row of controls:
  - **Priority selector** -- four radio-style buttons labelled P1 (Critical), P2 (High), P3 (Medium), P4 (Low), each with a distinct color.
  - **Max turns** -- number input (default empty = unlimited). Limits how many conversation turns Claude will use for this task.
  - **Tags** -- comma-separated tag input with autocomplete from existing tags.
- The "Save" button validates (title required, content required) and calls `onSave`.

```typescript
import Editor from '@monaco-editor/react';

export function TaskEditor({ instanceId, task, onSave }: TaskEditorProps) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [content, setContent] = useState(task?.content ?? '');
  const [priority, setPriority] = useState<1 | 2 | 3 | 4>(task?.priority ?? 3);
  const [maxTurns, setMaxTurns] = useState<number | undefined>(task?.maxTurns);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-3 w-3" /> Add Task
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[800px] h-[600px] flex flex-col">
        <DialogHeader>
          <DialogTitle>{task ? 'Edit Task' : 'New Task'}</DialogTitle>
        </DialogHeader>

        <Input
          placeholder="Task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mb-2"
        />

        <div className="flex-1 min-h-0 border rounded-md overflow-hidden">
          <Editor
            defaultLanguage="markdown"
            value={content}
            onChange={(val) => setContent(val ?? '')}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              wordWrap: 'on',
              lineNumbers: 'on',
              fontSize: 13,
              padding: { top: 8 },
              scrollBeyondLastLine: false,
            }}
          />
        </div>

        <div className="flex items-center gap-4 pt-2">
          <div className="flex items-center gap-1">
            <Label className="text-xs">Priority:</Label>
            {([1, 2, 3, 4] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={priority === p ? 'default' : 'outline'}
                className={cn(
                  'h-7 w-10 text-xs',
                  priority === p && priorityColors[p],
                )}
                onClick={() => setPriority(p)}
              >
                P{p}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Label className="text-xs">Max Turns:</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={maxTurns ?? ''}
              onChange={(e) =>
                setMaxTurns(e.target.value ? Number(e.target.value) : undefined)
              }
              className="h-7 w-20 text-xs"
              placeholder="Unlimited"
            />
          </div>

          <div className="ml-auto">
            <Button
              onClick={() => onSave({ title, content, priority, maxTurns })}
              disabled={!title.trim() || !content.trim()}
            >
              {task ? 'Update' : 'Create'} Task
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

---

#### TaskBulkAdd

```typescript
interface TaskBulkAddProps {
  instanceId: string;
  onAdd: (tasks: TaskInput[]) => void;
}
```

**Key behaviors:**

- Opens a dialog with a large textarea for pasting multiple tasks.
- Supports two input formats:
  1. **Line-separated** -- each line becomes a task title (content defaults to the title).
  2. **JSON array** -- `[{ "title": "...", "content": "...", "priority": 3 }]`.
- A format selector toggle switches between the two modes.
- A preview section shows parsed tasks as a list before confirmation.
- "Add All" button submits all parsed tasks in a single batch mutation.

---

#### TaskResult

```typescript
interface TaskResultProps {
  result: TaskResultData;
}

interface TaskResultData {
  output: string;           // Markdown-formatted result
  tokensUsed: number;
  duration: number;         // seconds
  exitStatus: 'success' | 'error' | 'timeout' | 'cancelled';
}
```

**Key behaviors:**

- Renders the `output` as sanitized Markdown using `react-markdown` with syntax highlighting for code blocks.
- Shows metadata chips: token count, duration, exit status.
- A "Copy" button copies the raw output to clipboard.
- Collapsible by default when shown inside `TaskCard`.

---

### 3.4 Project Components

#### ProjectCard

```typescript
interface ProjectCardProps {
  project: Project;
}
```

**Key behaviors:**

- Dashboard card showing: project name, description (truncated), instance count, running/idle breakdown, total tasks today.
- A colored status stripe along the left edge: green (all healthy), yellow (some errors), red (all errored).
- Clicking navigates to `/projects/:id`.

---

#### ProjectForm

```typescript
interface ProjectFormProps {
  project?: Project;       // Edit mode if provided
  onClose: () => void;
}
```

**Key behaviors:**

- Dialog form for creating or editing a project.
- Fields: name, description, default model, default working directory, tags.
- Uses `react-hook-form` + `zod` validation.
- On submit, calls `POST /api/projects` or `PATCH /api/projects/:id`.

---

#### ProjectSettings

```typescript
interface ProjectSettingsProps {
  projectId: string;
}
```

**Key behaviors:**

- Tabbed interface within the `ProjectPage`:
  - **General** -- name, description, tags.
  - **Defaults** -- default model, default system prompt, max tokens.
  - **Environment** -- key-value editor for env vars inherited by all instances.
  - **Danger Zone** -- archive project, delete project (with confirmation).

---

### 3.5 Schedule Components

#### ScheduleList

```typescript
interface ScheduleListProps {
  schedules: Schedule[];
}
```

**Key behaviors:**

- A table listing all schedules with columns: Name, Cron Expression, Target (project/instance), Next Run, Last Run, Status, Enabled toggle.
- The Enabled toggle calls `PATCH /api/schedules/:id` to enable/disable.
- Row click opens `ScheduleForm` in edit mode.
- Search/filter bar at the top.

---

#### ScheduleForm

```typescript
interface ScheduleFormProps {
  schedule?: Schedule;
  onClose: () => void;
}
```

**Key behaviors:**

- Dialog form for creating or editing a schedule.
- Fields:
  - **Name** -- text input.
  - **Cron expression** -- either manual input or a visual builder (dropdowns for minute, hour, day, month, weekday).
  - **Target** -- project or instance selector.
  - **Task template** -- embedded `TaskEditor` (Monaco) for the task that will be created on each trigger.
- Includes a live `CronPreview` below the cron input.

---

#### CronPreview

```typescript
interface CronPreviewProps {
  expression: string;
}
```

**Key behaviors:**

- Uses `cronstrue` to convert the cron expression into a human-readable string (e.g., "Every weekday at 9:00 AM").
- Displays the next 5 fire times calculated with `cron-parser` and formatted with `date-fns`.
- Shows a validation error if the expression is invalid.

```typescript
import cronstrue from 'cronstrue';
import { parseExpression } from 'cron-parser';
import { format } from 'date-fns';

export function CronPreview({ expression }: CronPreviewProps) {
  const preview = useMemo(() => {
    try {
      const human = cronstrue.toString(expression);
      const interval = parseExpression(expression);
      const nextRuns = Array.from({ length: 5 }, () =>
        format(interval.next().toDate(), 'PPpp'),
      );
      return { human, nextRuns, error: null };
    } catch {
      return { human: null, nextRuns: [], error: 'Invalid cron expression' };
    }
  }, [expression]);

  if (preview.error) {
    return <p className="text-sm text-destructive">{preview.error}</p>;
  }

  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium">{preview.human}</p>
      <ul className="text-muted-foreground">
        {preview.nextRuns.map((run, i) => (
          <li key={i}>{run}</li>
        ))}
      </ul>
    </div>
  );
}
```

---

### 3.6 Analytics Components

#### UsageDashboard

The top-level container for the analytics page. Composes all chart components with shared date range and filter controls.

```typescript
interface UsageDashboardProps {
  className?: string;
}
```

**Key behaviors:**

- A date range picker at the top (using shadcn/ui `Calendar` + `Popover`) defaults to the last 30 days.
- Filter dropdowns: by project, by model, by instance.
- Queries usage data via `useQuery(['usage', { dateRange, filters }])`.
- Renders a responsive grid of chart components:
  - `TokenChart` (span 2 columns).
  - `CostBreakdown` (span 1 column).
  - `ActivityHeatmap` (full width).
- Each chart has a loading skeleton while data is fetching.

---

#### TokenChart

```typescript
interface TokenChartProps {
  data: TokenUsagePoint[];
  dateRange: [Date, Date];
}

interface TokenUsagePoint {
  date: string;           // ISO date
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}
```

**Key behaviors:**

- Renders a Recharts `ComposedChart` with:
  - An `Area` for input tokens (blue, semi-transparent fill).
  - An `Area` for output tokens (green, semi-transparent fill).
  - Stacked `Bar` for cache read/write tokens.
- Custom tooltip showing exact numbers formatted with `Intl.NumberFormat`.
- X-axis formatted with `date-fns` (adaptive: hours if < 2 days, days if < 60 days, weeks otherwise).
- A legend below the chart with toggle checkboxes to show/hide individual series.
- Responsive: uses `ResponsiveContainer` to fill parent width.

```typescript
import {
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';

export function TokenChart({ data, dateRange }: TokenChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Token Usage</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => format(new Date(d), 'MMM d')}
              className="text-xs"
            />
            <YAxis
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              className="text-xs"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            <Area
              type="monotone"
              dataKey="inputTokens"
              name="Input"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.15}
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="outputTokens"
              name="Output"
              stroke="#22c55e"
              fill="#22c55e"
              fillOpacity={0.15}
              strokeWidth={2}
            />
            <Bar
              dataKey="cacheReadTokens"
              name="Cache Read"
              fill="#a855f7"
              opacity={0.7}
              barSize={12}
            />
            <Bar
              dataKey="cacheWriteTokens"
              name="Cache Write"
              fill="#f59e0b"
              opacity={0.7}
              barSize={12}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
```

---

#### CostBreakdown

```typescript
interface CostBreakdownProps {
  data: CostDataPoint[];
}

interface CostDataPoint {
  date: string;
  costs: Record<string, number>;    // key = model name, value = cost in USD
}
```

**Key behaviors:**

- Stacked bar chart showing daily cost broken down by model.
- Each model gets a consistent color from a predefined palette.
- Tooltip shows per-model cost and total for the day.
- A summary row below the chart shows: total cost for the selected period, average daily cost, projected monthly cost.

---

#### ActivityHeatmap

```typescript
interface ActivityHeatmapProps {
  data: ActivityDay[];
}

interface ActivityDay {
  date: string;           // ISO date
  count: number;          // Number of tasks completed
}
```

**Key behaviors:**

- GitHub-contribution-style heatmap rendered as an SVG grid.
- Each cell represents one day, colored on a 5-level intensity scale (gray for 0, light green to dark green).
- Hovering a cell shows a tooltip with the date and exact count.
- Scrollable horizontally to show up to 12 months of data.
- Month labels along the top, day-of-week labels along the left.

```typescript
export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  function getIntensity(count: number): string {
    if (count === 0) return 'fill-muted';
    const ratio = count / maxCount;
    if (ratio < 0.25) return 'fill-green-200 dark:fill-green-900';
    if (ratio < 0.5) return 'fill-green-400 dark:fill-green-700';
    if (ratio < 0.75) return 'fill-green-500 dark:fill-green-500';
    return 'fill-green-700 dark:fill-green-400';
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Task Activity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <svg width={/* computed */} height={/* computed */}>
            {data.map((day, i) => (
              <Tooltip key={day.date}>
                <TooltipTrigger asChild>
                  <rect
                    x={/* column */}
                    y={/* row */}
                    width={12}
                    height={12}
                    rx={2}
                    className={cn('transition-colors', getIntensity(day.count))}
                  />
                </TooltipTrigger>
                <TooltipContent>
                  {format(new Date(day.date), 'PPP')}: {day.count} tasks
                </TooltipContent>
              </Tooltip>
            ))}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## 4. State Management

### 4.1 Zustand Stores

#### appStore

Manages ephemeral UI state that does not belong to any server resource.

```typescript
// stores/appStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;

  // Modals
  activeModal: ModalType | null;
  modalData: Record<string, unknown>;
  openModal: (type: ModalType, data?: Record<string, unknown>) => void;
  closeModal: () => void;

  // Theme
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  // Global notifications
  notifications: Notification[];
  addNotification: (n: Omit<Notification, 'id' | 'timestamp'>) => void;
  dismissNotification: (id: string) => void;
}

type ModalType =
  | 'createProject'
  | 'editProject'
  | 'createInstance'
  | 'editInstance'
  | 'createSchedule'
  | 'editSchedule'
  | 'taskEditor'
  | 'confirmDelete';

interface Notification {
  id: string;
  timestamp: number;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message?: string;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Sidebar
      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) =>
        set({ sidebarCollapsed: collapsed }),

      // Modals
      activeModal: null,
      modalData: {},
      openModal: (type, data = {}) =>
        set({ activeModal: type, modalData: data }),
      closeModal: () =>
        set({ activeModal: null, modalData: {} }),

      // Theme
      theme: 'system',
      setTheme: (theme) => set({ theme }),

      // Notifications
      notifications: [],
      addNotification: (n) =>
        set((state) => ({
          notifications: [
            ...state.notifications,
            { ...n, id: crypto.randomUUID(), timestamp: Date.now() },
          ],
        })),
      dismissNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),
    }),
    {
      name: 'claude-orchestrator-app',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
      }),
    },
  ),
);
```

#### connectionStore

Tracks WebSocket connection state, exposed to the status bar and as context for hooks that depend on connectivity.

```typescript
// stores/connectionStore.ts
import { create } from 'zustand';

type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

interface ConnectionState {
  status: ConnectionStatus;
  reconnectAttempts: number;
  lastConnected: number | null;
  lastError: string | null;

  setStatus: (status: ConnectionStatus) => void;
  incrementReconnectAttempts: () => void;
  resetReconnectAttempts: () => void;
  setLastError: (error: string | null) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: 'disconnected',
  reconnectAttempts: 0,
  lastConnected: null,
  lastError: null,

  setStatus: (status) =>
    set({
      status,
      ...(status === 'connected'
        ? { lastConnected: Date.now(), lastError: null }
        : {}),
    }),
  incrementReconnectAttempts: () =>
    set((state) => ({
      reconnectAttempts: state.reconnectAttempts + 1,
    })),
  resetReconnectAttempts: () =>
    set({ reconnectAttempts: 0 }),
  setLastError: (error) =>
    set({ lastError: error }),
}));
```

### 4.2 TanStack React Query

All server state is managed through React Query. The query client is configured in `lib/queryClient.ts` and provided at the application root.

```typescript
// lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,               // Data considered fresh for 30 seconds
      gcTime: 5 * 60_000,              // Garbage collect after 5 minutes
      retry: 2,                         // Retry failed queries twice
      refetchOnWindowFocus: true,       // Refetch when tab regains focus
      refetchOnReconnect: true,         // Refetch when network reconnects
    },
    mutations: {
      retry: 1,
    },
  },
});
```

#### Query Key Structure

All query keys follow a hierarchical naming convention for targeted invalidation:

| Resource   | Query Key                                     | Endpoint                          |
|------------|-----------------------------------------------|-----------------------------------|
| Projects   | `['projects']`                                | `GET /api/projects`               |
| Project    | `['projects', projectId]`                     | `GET /api/projects/:id`           |
| Instances  | `['projects', projectId, 'instances']`        | `GET /api/projects/:id/instances` |
| Instance   | `['instances', instanceId]`                   | `GET /api/instances/:id`          |
| Tasks      | `['instances', instanceId, 'tasks']`          | `GET /api/instances/:id/tasks`    |
| Schedules  | `['schedules']`                               | `GET /api/schedules`              |
| Schedule   | `['schedules', scheduleId]`                   | `GET /api/schedules/:id`          |
| Usage      | `['usage', { dateRange, filters }]`           | `GET /api/analytics/usage`        |
| Dashboard  | `['dashboard']`                               | `GET /api/dashboard`              |

#### Optimistic Update Pattern

Mutations that affect visible lists use optimistic updates for instant feedback:

```typescript
// Example: reordering tasks in the queue
const reorderMutation = useMutation({
  mutationFn: (payload: { instanceId: string; taskIds: string[] }) =>
    api.reorderTasks(payload.instanceId, payload.taskIds),

  onMutate: async ({ instanceId, taskIds }) => {
    // Cancel outgoing refetches
    await queryClient.cancelQueries({
      queryKey: ['instances', instanceId, 'tasks'],
    });

    // Snapshot current state
    const previousTasks = queryClient.getQueryData<Task[]>(
      ['instances', instanceId, 'tasks'],
    );

    // Optimistically reorder
    queryClient.setQueryData<Task[]>(
      ['instances', instanceId, 'tasks'],
      (old) => {
        if (!old) return old;
        const taskMap = new Map(old.map((t) => [t.id, t]));
        return taskIds.map((id) => taskMap.get(id)!).filter(Boolean);
      },
    );

    return { previousTasks };
  },

  onError: (_err, { instanceId }, context) => {
    // Rollback on failure
    if (context?.previousTasks) {
      queryClient.setQueryData(
        ['instances', instanceId, 'tasks'],
        context.previousTasks,
      );
    }
  },

  onSettled: (_data, _err, { instanceId }) => {
    // Refetch to ensure consistency
    queryClient.invalidateQueries({
      queryKey: ['instances', instanceId, 'tasks'],
    });
  },
});
```

---

## 5. Custom Hooks

### 5.1 useWebSocket

Manages a single shared WebSocket connection to the backend with automatic reconnection using exponential backoff.

```typescript
// hooks/useWebSocket.ts
import { useEffect, useRef, useCallback } from 'react';
import { useConnectionStore } from '@/stores/connectionStore';

interface UseWebSocketOptions {
  url: string;
  onMessage: (event: MessageEvent) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (event: Event) => void;
  maxReconnectAttempts?: number;     // Default: 10
  baseDelay?: number;                // Default: 1000 ms
  maxDelay?: number;                 // Default: 30000 ms
}

interface UseWebSocketReturn {
  send: (data: string | ArrayBufferLike | Blob) => void;
  close: () => void;
  readyState: number;
}

export function useWebSocket(options: UseWebSocketOptions): UseWebSocketReturn {
  const {
    url,
    onMessage,
    onOpen,
    onClose,
    onError,
    maxReconnectAttempts = 10,
    baseDelay = 1000,
    maxDelay = 30_000,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const mountedRef = useRef(true);

  const {
    setStatus,
    incrementReconnectAttempts,
    resetReconnectAttempts,
    reconnectAttempts,
    setLastError,
  } = useConnectionStore();

  const connect = useCallback(() => {
    if (!mountedRef.current) return;

    setStatus('connecting');
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setStatus('connected');
      resetReconnectAttempts();
      onOpen?.();
    };

    ws.onmessage = onMessage;

    ws.onerror = (event) => {
      setLastError('WebSocket error');
      onError?.(event);
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;

      onClose?.();

      // Attempt reconnection with exponential backoff + jitter
      if (reconnectAttempts < maxReconnectAttempts) {
        setStatus('reconnecting');
        incrementReconnectAttempts();

        const delay = Math.min(
          baseDelay * Math.pow(2, reconnectAttempts) + Math.random() * 1000,
          maxDelay,
        );

        reconnectTimeoutRef.current = setTimeout(connect, delay);
      } else {
        setStatus('disconnected');
        setLastError(`Failed after ${maxReconnectAttempts} reconnect attempts`);
      }
    };

    wsRef.current = ws;
  }, [url, reconnectAttempts]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [url]);

  const send = useCallback(
    (data: string | ArrayBufferLike | Blob) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    },
    [],
  );

  const close = useCallback(() => {
    clearTimeout(reconnectTimeoutRef.current);
    wsRef.current?.close();
  }, []);

  return {
    send,
    close,
    readyState: wsRef.current?.readyState ?? WebSocket.CLOSED,
  };
}
```

**Reconnection strategy (exponential backoff with jitter):**

| Attempt | Base Delay | Max Possible Delay |
|---------|------------|--------------------|
| 1       | 1 s        | ~2 s               |
| 2       | 2 s        | ~3 s               |
| 3       | 4 s        | ~5 s               |
| 4       | 8 s        | ~9 s               |
| 5       | 16 s       | ~17 s              |
| 6+      | 30 s       | 30 s (capped)      |

---

### 5.2 useInstanceStream

Subscribes to a specific instance's output stream over the shared WebSocket and feeds data to a callback (typically `terminal.write`).

```typescript
// hooks/useInstanceStream.ts
import { useEffect, useRef } from 'react';
import { useWebSocket } from './useWebSocket';

interface UseInstanceStreamOptions {
  onData: (chunk: string) => void;
  onStatusChange?: (status: InstanceStatus) => void;
}

export function useInstanceStream(
  instanceId: string,
  options: UseInstanceStreamOptions,
) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const { send } = useWebSocket({
    url: `${import.meta.env.VITE_WS_URL}/ws`,
    onMessage: (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'instance:output':
          if (message.instanceId === instanceId) {
            optionsRef.current.onData(message.data);
          }
          break;
        case 'instance:status':
          if (message.instanceId === instanceId) {
            optionsRef.current.onStatusChange?.(message.status);
          }
          break;
      }
    },
  });

  // Subscribe to the specific instance on connect
  useEffect(() => {
    send(
      JSON.stringify({
        type: 'subscribe',
        channel: `instance:${instanceId}`,
      }),
    );

    return () => {
      send(
        JSON.stringify({
          type: 'unsubscribe',
          channel: `instance:${instanceId}`,
        }),
      );
    };
  }, [instanceId, send]);
}
```

**WebSocket message protocol:**

```typescript
// Incoming messages from server
type ServerMessage =
  | { type: 'instance:output'; instanceId: string; data: string }
  | { type: 'instance:status'; instanceId: string; status: InstanceStatus }
  | { type: 'task:update'; instanceId: string; task: Task }
  | { type: 'dashboard:stats'; stats: DashboardStats }
  | { type: 'notification'; notification: Notification };

// Outgoing messages to server
type ClientMessage =
  | { type: 'subscribe'; channel: string }
  | { type: 'unsubscribe'; channel: string }
  | { type: 'ping' };
```

---

### 5.3 useTaskQueue

Provides a complete CRUD interface for an instance's task queue with optimistic updates on all mutations.

```typescript
// hooks/useTaskQueue.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Task, TaskInput } from '@/types';

interface UseTaskQueueReturn {
  tasks: Task[];
  isLoading: boolean;
  error: Error | null;

  addTask: (input: TaskInput) => Promise<Task>;
  updateTask: (taskId: string, updates: Partial<TaskInput>) => Promise<Task>;
  removeTask: (taskId: string) => Promise<void>;
  reorderTasks: (params: { oldIndex: number; newIndex: number }) => void;
  cancelTask: (taskId: string) => Promise<void>;
}

export function useTaskQueue(instanceId: string): UseTaskQueueReturn {
  const queryClient = useQueryClient();
  const queryKey = ['instances', instanceId, 'tasks'];

  // Fetch tasks
  const { data: tasks = [], isLoading, error } = useQuery({
    queryKey,
    queryFn: () => api.getTasks(instanceId),
    refetchInterval: false,            // Rely on WebSocket for updates
  });

  // Add task
  const addMutation = useMutation({
    mutationFn: (input: TaskInput) => api.addTask(instanceId, input),
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Task[]>(queryKey);

      const optimisticTask: Task = {
        id: `temp-${Date.now()}`,
        ...input,
        status: 'queued',
        createdAt: new Date().toISOString(),
        instanceId,
      };

      queryClient.setQueryData<Task[]>(queryKey, (old = []) => [
        ...old,
        optimisticTask,
      ]);

      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Update task
  const updateMutation = useMutation({
    mutationFn: ({ taskId, updates }: { taskId: string; updates: Partial<TaskInput> }) =>
      api.updateTask(instanceId, taskId, updates),
    onMutate: async ({ taskId, updates }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Task[]>(queryKey);

      queryClient.setQueryData<Task[]>(queryKey, (old = []) =>
        old.map((t) => (t.id === taskId ? { ...t, ...updates } : t)),
      );

      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Remove task
  const removeMutation = useMutation({
    mutationFn: (taskId: string) => api.removeTask(instanceId, taskId),
    onMutate: async (taskId) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Task[]>(queryKey);

      queryClient.setQueryData<Task[]>(queryKey, (old = []) =>
        old.filter((t) => t.id !== taskId),
      );

      return { previous };
    },
    onError: (_err, _taskId, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Reorder tasks (optimistic, array index swap)
  const reorderMutation = useMutation({
    mutationFn: (taskIds: string[]) =>
      api.reorderTasks(instanceId, taskIds),
    onMutate: async (taskIds) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Task[]>(queryKey);

      queryClient.setQueryData<Task[]>(queryKey, (old = []) => {
        const taskMap = new Map(old.map((t) => [t.id, t]));
        const reordered = taskIds
          .map((id) => taskMap.get(id))
          .filter(Boolean) as Task[];
        const nonQueued = old.filter((t) => t.status !== 'queued');
        return [...nonQueued, ...reordered];
      });

      return { previous };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Cancel task
  const cancelMutation = useMutation({
    mutationFn: (taskId: string) => api.cancelTask(instanceId, taskId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  // Reorder helper that converts index-based params to ID array
  function reorderTasks({ oldIndex, newIndex }: { oldIndex: number; newIndex: number }) {
    const queued = tasks.filter((t) => t.status === 'queued');
    const reordered = [...queued];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);
    reorderMutation.mutate(reordered.map((t) => t.id));
  }

  return {
    tasks,
    isLoading,
    error,
    addTask: (input) => addMutation.mutateAsync(input),
    updateTask: (taskId, updates) =>
      updateMutation.mutateAsync({ taskId, updates }),
    removeTask: (taskId) => removeMutation.mutateAsync(taskId),
    reorderTasks,
    cancelTask: (taskId) => cancelMutation.mutateAsync(taskId),
  };
}
```

---

### 5.4 useDashboardUpdates

Subscribes to global status updates and merges them into the React Query dashboard cache for real-time counters and alerts.

```typescript
// hooks/useDashboardUpdates.ts
import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface DashboardStats {
  totalInstances: number;
  runningInstances: number;
  queuedTasks: number;
  completedTasksToday: number;
  tokenUsageToday: number;
  activeAlerts: Alert[];
}

export function useDashboardUpdates() {
  const queryClient = useQueryClient();

  const { send } = useWebSocket({
    url: `${import.meta.env.VITE_WS_URL}/ws`,
    onMessage: (event) => {
      const message = JSON.parse(event.data);

      switch (message.type) {
        case 'dashboard:stats':
          // Merge real-time stats into the cached dashboard data
          queryClient.setQueryData<DashboardStats>(
            ['dashboard'],
            (old) => ({ ...old, ...message.stats }),
          );
          break;

        case 'instance:status':
          // Invalidate instance queries to pick up status changes
          queryClient.invalidateQueries({
            queryKey: ['instances', message.instanceId],
          });
          break;

        case 'task:update':
          // Update the task in the cache for the relevant instance
          queryClient.setQueryData<Task[]>(
            ['instances', message.instanceId, 'tasks'],
            (old = []) =>
              old.map((t) =>
                t.id === message.task.id ? { ...t, ...message.task } : t,
              ),
          );
          break;

        case 'notification':
          useAppStore.getState().addNotification(message.notification);
          break;
      }
    },
  });

  // Subscribe to the global dashboard channel
  useEffect(() => {
    send(JSON.stringify({ type: 'subscribe', channel: 'dashboard' }));
    return () => {
      send(JSON.stringify({ type: 'unsubscribe', channel: 'dashboard' }));
    };
  }, [send]);
}
```

---

## 6. Routing

Routing is handled by React Router v7 with lazy-loaded page components for code splitting.

```typescript
// App.tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';

const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ProjectPage = lazy(() => import('@/pages/ProjectPage'));
const InstancePage = lazy(() => import('@/pages/InstancePage'));
const SchedulesPage = lazy(() => import('@/pages/SchedulesPage'));
const AnalyticsPage = lazy(() => import('@/pages/AnalyticsPage'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));

const router = createBrowserRouter([
  {
    element: <AppShell><Outlet /></AppShell>,
    children: [
      {
        path: '/',
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <DashboardPage />
          </Suspense>
        ),
      },
      {
        path: '/projects/:id',
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <ProjectPage />
          </Suspense>
        ),
      },
      {
        path: '/instances/:id',
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <InstancePage />
          </Suspense>
        ),
      },
      {
        path: '/schedules',
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <SchedulesPage />
          </Suspense>
        ),
      },
      {
        path: '/analytics',
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <AnalyticsPage />
          </Suspense>
        ),
      },
      {
        path: '/settings',
        element: (
          <Suspense fallback={<PageSkeleton />}>
            <SettingsPage />
          </Suspense>
        ),
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
```

### Route Summary

| Path               | Page Component    | Description                          |
|--------------------|-------------------|--------------------------------------|
| `/`                | `DashboardPage`   | Global overview with project cards, running instance count, task stats, alerts |
| `/projects/:id`    | `ProjectPage`     | Single project view: instance list, settings tabs, project-level analytics |
| `/instances/:id`   | `InstancePage`    | Full-screen `InstancePanel` with terminal and task queue |
| `/schedules`       | `SchedulesPage`   | All schedules: list, create, edit, toggle |
| `/analytics`       | `AnalyticsPage`   | Usage dashboard with date range and filters |
| `/settings`        | `SettingsPage`    | Global configuration: API keys, default model, theme preferences |

### Navigation Guards

- All routes require the backend to be reachable. If the initial health check (`GET /api/health`) fails, a full-page error screen is shown with a retry button.
- No authentication is implemented in the MVP. Future iterations will add route-level auth guards.

---

## 7. Key Dependencies

### package.json

```json
{
  "name": "claude-orchestrator-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext .ts,.tsx",
    "type-check": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^7.1.1",

    "@tanstack/react-query": "^5.62.0",
    "@tanstack/react-query-devtools": "^5.62.0",
    "zustand": "^5.0.2",
    "axios": "^1.7.9",

    "@xterm/xterm": "^5.5.0",
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-search": "^0.15.0",
    "@xterm/addon-web-links": "^0.11.0",
    "@xterm/addon-unicode11": "^0.8.0",

    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/sortable": "^8.0.0",
    "@dnd-kit/utilities": "^3.2.2",

    "@monaco-editor/react": "^4.6.0",

    "recharts": "^2.12.7",
    "date-fns": "^3.6.0",
    "cronstrue": "^2.52.0",
    "cron-parser": "^4.9.0",
    "react-markdown": "^9.0.1",

    "lucide-react": "^0.400.0",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.6.0",

    "@radix-ui/react-dialog": "^1.1.4",
    "@radix-ui/react-dropdown-menu": "^2.1.4",
    "@radix-ui/react-collapsible": "^1.1.2",
    "@radix-ui/react-select": "^2.1.4",
    "@radix-ui/react-tabs": "^1.1.2",
    "@radix-ui/react-tooltip": "^1.1.6",
    "@radix-ui/react-alert-dialog": "^1.1.4",
    "@radix-ui/react-label": "^2.1.1",
    "@radix-ui/react-slot": "^1.1.1"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vite": "^5.4.14",
    "@vitejs/plugin-react-swc": "^3.7.2",
    "tailwindcss": "^3.4.17",
    "postcss": "^8.4.49",
    "autoprefixer": "^10.4.20",
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
    "eslint": "^9.17.0",
    "@typescript-eslint/eslint-plugin": "^8.18.0",
    "@typescript-eslint/parser": "^8.18.0",
    "eslint-plugin-react-hooks": "^5.1.0"
  }
}
```

### Dependency Rationale

| Dependency                      | Why                                                                                      |
|---------------------------------|------------------------------------------------------------------------------------------|
| `react ^18.3`                   | Concurrent features (Suspense, startTransition) for smooth UI during heavy updates       |
| `react-router-dom ^7.x`        | Latest React Router with data APIs, lazy routes, and improved type safety                |
| `@tanstack/react-query ^5.x`   | Industry-standard server state management with devtools, optimistic updates, caching     |
| `zustand ^5.x`                 | Minimal boilerplate client state; persist middleware for sidebar/theme preferences        |
| `axios ^1.7`                   | Request/response interceptors for auth headers, error normalization, base URL config     |
| `@xterm/xterm ^5.5`            | Full-featured terminal emulator; ANSI color support critical for Claude Code output      |
| `@dnd-kit/core ^6.x`           | Accessible, performant drag-and-drop with keyboard support and collision detection       |
| `@dnd-kit/sortable ^8.x`       | Sortable preset for vertical list reordering (task queue)                                |
| `@monaco-editor/react ^4.6`    | VS Code editor for task content; Markdown highlighting, snippets, intellisense           |
| `recharts ^2.12`               | Composable, responsive SVG charts built on D3; straightforward React integration         |
| `date-fns ^3.x`                | Tree-shakeable date formatting; lighter than moment/dayjs for the functions needed       |
| `cronstrue ^2.x`               | Human-readable cron descriptions ("Every Monday at 9 AM")                                |
| `lucide-react ^0.400`          | Consistent, tree-shakeable icon set with 1000+ icons                                    |
| `class-variance-authority ^0.7` | Type-safe variant definitions for component styling (used by shadcn/ui)                 |
| `clsx ^2.x` + `tailwind-merge ^2.x` | Conditional class merging without Tailwind conflicts; the `cn()` utility            |
| `typescript ^5.5`              | Strict mode, satisfies operator, const type parameters                                   |
| `vite ^5.x`                    | Fast HMR, native ESM, optimized production builds with Rollup                            |
| `tailwindcss ^3.4`             | Utility-first CSS with JIT compilation; custom theme tokens for brand consistency        |

---

## 8. Build and Development

### 8.1 Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-editor': ['@monaco-editor/react'],
          'vendor-terminal': ['@xterm/xterm'],
          'vendor-charts': ['recharts'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable'],
        },
      },
    },
  },
});
```

**Key configuration details:**

- **SWC plugin** -- Uses `@vitejs/plugin-react-swc` instead of Babel for significantly faster HMR and build times.
- **Path alias** -- `@/` maps to `src/` for clean imports (`@/components/...`, `@/hooks/...`).
- **Dev proxy** -- API requests (`/api/*`) and WebSocket connections (`/ws`) are proxied to the backend at `localhost:8000` during development.
- **Manual chunks** -- Heavy vendor libraries are split into separate chunks to improve caching. The Monaco editor alone is ~2 MB; isolating it ensures it does not block the initial bundle.

### 8.2 TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",

    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "exactOptionalPropertyTypes": false,

    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    },

    "skipLibCheck": true,
    "isolatedModules": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

### 8.3 Tailwind Configuration

```typescript
// tailwind.config.ts
import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'pulse-subtle': {
          '0%, 100%': { borderColor: 'hsl(var(--primary) / 0.3)' },
          '50%': { borderColor: 'hsl(var(--primary) / 0.8)' },
        },
      },
      animation: {
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config;
```

### 8.4 CSS Custom Properties

```css
/* src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 240 10% 3.9%;
    --card: 0 0% 100%;
    --card-foreground: 240 10% 3.9%;
    --primary: 240 5.9% 10%;
    --primary-foreground: 0 0% 98%;
    --secondary: 240 4.8% 95.9%;
    --secondary-foreground: 240 5.9% 10%;
    --muted: 240 4.8% 95.9%;
    --muted-foreground: 240 3.8% 46.1%;
    --accent: 240 4.8% 95.9%;
    --accent-foreground: 240 5.9% 10%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 5.9% 90%;
    --input: 240 5.9% 90%;
    --ring: 240 5.9% 10%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 240 10% 3.9%;
    --foreground: 0 0% 98%;
    --card: 240 10% 3.9%;
    --card-foreground: 0 0% 98%;
    --primary: 0 0% 98%;
    --primary-foreground: 240 5.9% 10%;
    --secondary: 240 3.7% 15.9%;
    --secondary-foreground: 0 0% 98%;
    --muted: 240 3.7% 15.9%;
    --muted-foreground: 240 5% 64.9%;
    --accent: 240 3.7% 15.9%;
    --accent-foreground: 0 0% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 0 0% 98%;
    --border: 240 3.7% 15.9%;
    --input: 240 3.7% 15.9%;
    --ring: 240 4.9% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
    font-feature-settings: "rlig" 1, "calt" 1;
  }
}
```

### 8.5 API Client

```typescript
// lib/api.ts
import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
  timeout: 30_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor: attach API key if configured
apiClient.interceptors.request.use((config) => {
  const apiKey = localStorage.getItem('claude-orchestrator-api-key');
  if (apiKey) {
    config.headers['X-API-Key'] = apiKey;
  }
  return config;
});

// Response interceptor: normalize errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.detail ??
      error.response?.data?.message ??
      error.message ??
      'An unknown error occurred';

    return Promise.reject(new Error(message));
  },
);

// Typed API functions
export const api = {
  // Health
  health: () => apiClient.get('/health'),

  // Projects
  getProjects: () => apiClient.get<Project[]>('/projects').then((r) => r.data),
  getProject: (id: string) => apiClient.get<Project>(`/projects/${id}`).then((r) => r.data),
  createProject: (data: ProjectInput) => apiClient.post<Project>('/projects', data).then((r) => r.data),
  updateProject: (id: string, data: Partial<ProjectInput>) => apiClient.patch<Project>(`/projects/${id}`, data).then((r) => r.data),
  deleteProject: (id: string) => apiClient.delete(`/projects/${id}`),

  // Instances
  getInstances: (projectId: string) => apiClient.get<Instance[]>(`/projects/${projectId}/instances`).then((r) => r.data),
  getInstance: (id: string) => apiClient.get<Instance>(`/instances/${id}`).then((r) => r.data),
  createInstance: (projectId: string, data: InstanceInput) => apiClient.post<Instance>(`/projects/${projectId}/instances`, data).then((r) => r.data),
  updateInstance: (id: string, data: Partial<InstanceInput>) => apiClient.patch<Instance>(`/instances/${id}`, data).then((r) => r.data),
  deleteInstance: (id: string) => apiClient.delete(`/instances/${id}`),
  controlInstance: (id: string, action: 'start' | 'stop' | 'restart' | 'pause' | 'resume') => apiClient.post(`/instances/${id}/${action}`).then((r) => r.data),

  // Tasks
  getTasks: (instanceId: string) => apiClient.get<Task[]>(`/instances/${instanceId}/tasks`).then((r) => r.data),
  addTask: (instanceId: string, data: TaskInput) => apiClient.post<Task>(`/instances/${instanceId}/tasks`, data).then((r) => r.data),
  updateTask: (instanceId: string, taskId: string, data: Partial<TaskInput>) => apiClient.patch<Task>(`/instances/${instanceId}/tasks/${taskId}`, data).then((r) => r.data),
  removeTask: (instanceId: string, taskId: string) => apiClient.delete(`/instances/${instanceId}/tasks/${taskId}`),
  reorderTasks: (instanceId: string, taskIds: string[]) => apiClient.put(`/instances/${instanceId}/tasks/order`, { taskIds }).then((r) => r.data),
  cancelTask: (instanceId: string, taskId: string) => apiClient.post(`/instances/${instanceId}/tasks/${taskId}/cancel`).then((r) => r.data),

  // Schedules
  getSchedules: () => apiClient.get<Schedule[]>('/schedules').then((r) => r.data),
  getSchedule: (id: string) => apiClient.get<Schedule>(`/schedules/${id}`).then((r) => r.data),
  createSchedule: (data: ScheduleInput) => apiClient.post<Schedule>('/schedules', data).then((r) => r.data),
  updateSchedule: (id: string, data: Partial<ScheduleInput>) => apiClient.patch<Schedule>(`/schedules/${id}`, data).then((r) => r.data),
  deleteSchedule: (id: string) => apiClient.delete(`/schedules/${id}`),

  // Analytics
  getUsage: (params: UsageParams) => apiClient.get<UsageData>('/analytics/usage', { params }).then((r) => r.data),

  // Dashboard
  getDashboard: () => apiClient.get<DashboardStats>('/dashboard').then((r) => r.data),
};
```

### 8.6 Utility Functions

```typescript
// lib/utils.ts
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes without conflicts.
 * Combines clsx conditional logic with tailwind-merge deduplication.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a token count for display (e.g., 1234567 -> "1.23M").
 */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(2)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return count.toString();
}

/**
 * Format a cost in USD (e.g., 0.0234 -> "$0.023").
 */
export function formatCost(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

/**
 * Format a duration in seconds to human-readable (e.g., 125 -> "2m 5s").
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}
```

### 8.7 TypeScript Interfaces

```typescript
// types/index.ts

// ─── Projects ────────────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string;
  tags: string[];
  defaultModel: string;
  defaultSystemPrompt: string;
  defaultMaxTokens: number;
  defaultWorkingDir: string;
  envVars: Record<string, string>;
  instanceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInput {
  name: string;
  description?: string;
  tags?: string[];
  defaultModel?: string;
  defaultSystemPrompt?: string;
  defaultMaxTokens?: number;
  defaultWorkingDir?: string;
  envVars?: Record<string, string>;
}

// ─── Instances ───────────────────────────────────────────────────────────────

export type InstanceStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'paused'
  | 'stopping'
  | 'error';

export interface Instance {
  id: string;
  projectId: string;
  name: string;
  model: string;
  systemPrompt: string;
  maxTokens: number;
  workingDir: string;
  envVars: Record<string, string>;
  status: InstanceStatus;
  currentTaskId: string | null;
  uptime: number | null;              // seconds since start, null if idle
  pid: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstanceInput {
  name: string;
  model?: string;
  systemPrompt?: string;
  maxTokens?: number;
  workingDir?: string;
  envVars?: Record<string, string>;
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timeout';

export type TaskPriority = 1 | 2 | 3 | 4;

export interface Task {
  id: string;
  instanceId: string;
  title: string;
  content: string;
  priority: TaskPriority;
  status: TaskStatus;
  maxTurns?: number;
  tags: string[];
  result?: TaskResultData;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface TaskInput {
  title: string;
  content: string;
  priority?: TaskPriority;
  maxTurns?: number;
  tags?: string[];
}

export interface TaskResultData {
  output: string;
  tokensUsed: number;
  inputTokens: number;
  outputTokens: number;
  duration: number;
  exitStatus: 'success' | 'error' | 'timeout' | 'cancelled';
}

// ─── Schedules ───────────────────────────────────────────────────────────────

export interface Schedule {
  id: string;
  name: string;
  cronExpression: string;
  targetType: 'project' | 'instance';
  targetId: string;
  taskTemplate: TaskInput;
  enabled: boolean;
  lastRun: string | null;
  nextRun: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleInput {
  name: string;
  cronExpression: string;
  targetType: 'project' | 'instance';
  targetId: string;
  taskTemplate: TaskInput;
  enabled?: boolean;
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export interface UsageParams {
  startDate: string;
  endDate: string;
  projectId?: string;
  instanceId?: string;
  model?: string;
}

export interface UsageData {
  tokenUsage: TokenUsagePoint[];
  costBreakdown: CostDataPoint[];
  activity: ActivityDay[];
  summary: UsageSummary;
}

export interface TokenUsagePoint {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface CostDataPoint {
  date: string;
  costs: Record<string, number>;
}

export interface ActivityDay {
  date: string;
  count: number;
}

export interface UsageSummary {
  totalTokens: number;
  totalCost: number;
  avgDailyCost: number;
  projectedMonthlyCost: number;
  totalTasks: number;
  successRate: number;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardStats {
  totalProjects: number;
  totalInstances: number;
  runningInstances: number;
  queuedTasks: number;
  completedTasksToday: number;
  tokenUsageToday: number;
  costToday: number;
  activeAlerts: Alert[];
}

export interface Alert {
  id: string;
  severity: 'info' | 'warning' | 'error';
  title: string;
  message: string;
  instanceId?: string;
  timestamp: string;
}
```

### 8.8 Application Entry Point

```typescript
// main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import { queryClient } from '@/lib/queryClient';
import App from '@/App';
import '@/index.css';
import '@xterm/xterm/css/xterm.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={300}>
        <App />
      </TooltipProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  </StrictMode>,
);
```

### 8.9 Docker Multi-Stage Build

```dockerfile
# Dockerfile

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Serve ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS production

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# SPA fallback: all routes serve index.html
# (handled in nginx.conf with try_files)

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

**Companion nginx.conf:**

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    gzip_min_length 1000;

    # Cache static assets aggressively
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API requests to backend
    location /api/ {
        proxy_pass http://backend:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Proxy WebSocket
    location /ws {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400;
    }
}
```

### 8.10 Development Workflow

```bash
# Install dependencies
npm install

# Start development server (port 5173, proxies API to localhost:8000)
npm run dev

# Type-check without emitting
npm run type-check

# Lint
npm run lint

# Production build
npm run build

# Preview production build locally
npm run preview

# Docker build
docker build -t claude-orchestrator-frontend .

# Docker run
docker run -p 3000:80 claude-orchestrator-frontend
```

### 8.11 Environment Variables

| Variable          | Default               | Description                            |
|-------------------|-----------------------|----------------------------------------|
| `VITE_API_URL`    | `/api`                | Base URL for REST API calls            |
| `VITE_WS_URL`    | `ws://localhost:8000` | WebSocket endpoint (dev only)          |

In production, the nginx reverse proxy handles routing `/api` and `/ws` to the backend, so no environment variables are needed in the built assets.

---

## 9. Performance Considerations

### Code Splitting

Every page is lazy-loaded via `React.lazy()` + `Suspense`. Heavy vendor libraries (Monaco, xterm.js, Recharts) are isolated into separate chunks via Vite's `manualChunks` configuration. This ensures the initial bundle contains only React, the router, and the shell layout -- typically under 150 KB gzipped.

### Virtualization

For instances or projects that accumulate large numbers of completed tasks, the completed section of `TaskQueue` uses windowed rendering (via `@tanstack/react-virtual` or similar) to avoid rendering hundreds of DOM nodes.

### WebSocket Efficiency

- A single WebSocket connection is shared across the entire application.
- Clients subscribe to specific channels (`instance:<id>`, `dashboard`) rather than receiving all events.
- Binary output from terminal streams is sent as raw text frames, not JSON, to avoid serialization overhead.
- The `useInstanceStream` hook uses a ref-based callback pattern to avoid re-subscribing on every render.

### React Query Deduplication

Multiple components on the same page that query the same key (e.g., both `InstanceCard` and `InstancePanel` querying `['instances', id]`) share a single network request thanks to React Query's built-in deduplication within the `staleTime` window.
