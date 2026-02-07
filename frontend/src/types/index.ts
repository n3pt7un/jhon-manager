export type InstanceStatus = 'idle' | 'running' | 'paused' | 'error' | 'stopped';

export interface Project {
  id: string;
  name: string;
  description: string;
  path: string;
  created_at: string;
  updated_at: string;
}

export interface Instance {
  id: string;
  project_id: string;
  name: string;
  model: string;
  max_turns: number;
  status: InstanceStatus;
  ssh_config_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  path: string;
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  path?: string;
}

export interface CreateInstanceRequest {
  name: string;
  model?: string;
  max_turns?: number;
  ssh_config_id?: string | null;
}

export interface UpdateInstanceRequest {
  name?: string;
  model?: string;
  max_turns?: number;
  ssh_config_id?: string | null;
}

export type TaskStatus = 'pending' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  instance_id: string;
  prompt: string;
  status: TaskStatus;
  priority: number;
  position: number;
  result: Record<string, unknown> | null;
  error_message: string | null;
  retry_count: number;
  max_retries: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cost_estimate: number | null;
  duration_seconds: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  schedule_id: string | null;
}

export interface CreateTaskRequest {
  prompt: string;
  priority?: number;
  max_retries?: number;
}

export interface WSMessage {
  type: 'output' | 'status' | 'task_complete' | 'queue_update' | 'error' | 'pong';
  instance_id: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface InstanceHealth {
  status: string;
  queue_length: number;
  active_task_id: string | null;
  connected_clients: number;
}
