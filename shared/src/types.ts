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
  messages: Message[];
  inbox: string[];
  reports: string[];
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

export const HID_RE = /^[0-9a-f]{8}$/;
export const KEBAB_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
