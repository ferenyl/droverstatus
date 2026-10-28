// SPDX-License-Identifier: GPL-3.0-only
export type AgentState = 'busy' | 'idle' | 'blocked' | 'unknown';
export type Model = 'haiku' | 'sonnet' | 'opus' | 'fable';
export const MODELS: Model[] = ['haiku', 'sonnet', 'opus', 'fable'];

export interface AgentStatus {
  state: AgentState;
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  at?: string;
  /** when the current state began (drover >= 0.11); `at` is the last hook event */
  since?: string;
}

export interface Agent {
  id: string;
  model?: string;
  tab_name?: string;
  tab_id?: number;
  pane_id?: string;
  purpose?: string;
  cwd?: string;
  worktree?: string | null;
  story?: string;
  /** claude --resume <session_id> */
  session_id?: string;
  created?: string;
  /** messages queued while the agent was blocked (queue/<id>.txt), delivered by flush */
  queued?: number;
  status: AgentStatus;
}

export type Liveness = 'alive' | 'dead' | 'unknown';

/** drover.sh `task set` states; stored as free strings, so unknown values are possible */
export type TaskState = 'todo' | 'in_progress' | 'done' | 'failed';

export interface Task {
  id: string;
  title: string;
  acceptance: string[];
  depends_on: string[];
  owner?: string;
  state: TaskState | (string & {});
  attempts?: number;
  story?: string;
  /** plan | impl | review | pr; absent = impl */
  kind?: string;
  created_at?: string;
  started_at?: string;
  finished_at?: string;
}

/** registered file (docs.json, or the corral's own brief.md/plan.md) */
export interface DocEntry {
  /** absolute */
  path: string;
  note: string;
  agent?: string;
  added_at?: string;
  /** mtime:size of the file, changes when its content does */
  stamp?: string;
}

/** reports/<agent>.json written by `drover.sh report` (>= 0.11) */
export interface ReportMeta {
  task?: string;
  status?: string;
  summary?: string;
  at?: string;
}

/** story statuses in board column order */
export const STORY_STATES = ['backlog', 'planning', 'working', 'waiting-for-user', 'review', 'done'] as const;
export type StoryState = (typeof STORY_STATES)[number];

export interface StoryPr {
  url?: string;
  number?: number;
  host?: string;
  state?: string;
  review?: string | null;
}

export interface Story {
  id: string;
  key?: string;
  tracker?: string;
  source?: string | null;
  type?: string | null;
  title: string;
  url?: string | null;
  summary?: string;
  assignee?: string | null;
  status: StoryState | (string & {});
  blocked?: string | null;
  order?: number;
  branch?: string | null;
  pr?: StoryPr | null;
  clarified?: boolean;
  updated_at?: string;
}

export interface StoryMode {
  parallel?: boolean;
  planner?: boolean;
  pr?: boolean;
  pr_review?: boolean;
}

export interface Message {
  at: string;
  from: string;
  to: string;
  text: string;
}

export interface Corral {
  hid: string;
  session: string;
  project: string;
  slug: string;
  closed: boolean;
  /** close is running (registry closing_at set, not yet closed) */
  closing?: boolean;
  liveness: Liveness;
  drover: { mode?: string; model?: string; session_id?: string; tab_id?: number; status: AgentStatus };
  agents: Agent[];
  tasks: Task[];
  stories: Story[];
  story_mode?: StoryMode;
  /** last 200 only; older via GET /corrals/:hid/messages?before= */
  messages: Message[];
  messages_total: number;
  /** byte offset in messages.log where `messages` starts (0 = nothing older) */
  messages_offset: number;
  /** last 200 lines */
  inbox: string[];
  /** newest first when report metadata exists */
  reports: string[];
  report_meta: Record<string, ReportMeta>;
  docs: DocEntry[];
  /** registry.json contract fields (>= 0.11) */
  schema?: number;
  drover_version?: string;
}

export interface Worktree {
  path: string;
  branch: string;
  dirty: boolean;
}

export type ServerEvent =
  | { type: 'snapshot'; corrals: Corral[] }
  | { type: 'corral-updated'; hid: string; corral: Corral }
  | { type: 'corral-removed'; hid: string };

export interface ApiError {
  error: string;
  stderr?: string;
  code?: number;
  worktrees?: Worktree[];
}

/** GET /api/auth/session */
export interface AuthSession {
  authenticated: boolean;
  passwordSet: boolean;
}

/** POST /api/auth/login: password once set, otherwise the bootstrap token */
export interface LoginBody {
  password?: string;
  token?: string;
}

export const MIN_PASSWORD_LENGTH = 12;

/** POST /api/auth/password: current password, or the bootstrap token while none is set */
export interface PasswordBody {
  current?: string;
  token?: string;
  password: string;
}

export const HID_RE = /^[0-9a-f]{8}$/;
export const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
