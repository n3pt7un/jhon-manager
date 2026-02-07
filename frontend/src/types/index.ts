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
