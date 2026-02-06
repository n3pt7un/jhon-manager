import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  Server,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import type { Project, Instance } from '@/types';
import { InstanceCard } from '@/components/instances/InstanceCard';
import { InstanceForm } from '@/components/instances/InstanceForm';
import { ProjectForm } from '@/components/projects/ProjectForm';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showInstanceForm, setShowInstanceForm] = useState(false);
  const [editingInstance, setEditingInstance] = useState<Instance | null>(null);
  const [deletingInstance, setDeletingInstance] = useState<Instance | null>(
    null
  );
  const [showEditProject, setShowEditProject] = useState(false);
  const [showDeleteProject, setShowDeleteProject] = useState(false);

  // Fetch project
  const {
    data: project,
    isLoading: projectLoading,
    isError: projectError,
  } = useQuery<Project>({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const response = await api.get(`/projects/${projectId}`);
      return response.data;
    },
    enabled: !!projectId,
  });

  // Fetch instances
  const {
    data: instances,
    isLoading: instancesLoading,
  } = useQuery<Instance[]>({
    queryKey: ['instances', projectId],
    queryFn: async () => {
      const response = await api.get(`/projects/${projectId}/instances`);
      return response.data;
    },
    enabled: !!projectId,
  });

  // Delete project mutation
  const deleteProjectMutation = useMutation({
    mutationFn: () => api.delete(`/projects/${projectId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted successfully');
      navigate('/');
    },
  });

  // Delete instance mutation
  const deleteInstanceMutation = useMutation({
    mutationFn: (instanceId: string) =>
      api.delete(`/projects/${projectId}/instances/${instanceId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['instances', projectId] });
      toast.success('Instance deleted successfully');
      setDeletingInstance(null);
    },
  });

  if (projectLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (projectError || !project) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </button>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-800 dark:bg-red-900/20">
          <p className="text-sm text-red-600 dark:text-red-400">
            Failed to load project. It may have been deleted or is inaccessible.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back navigation */}
      <button
        onClick={() => navigate('/')}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </button>

      {/* Project header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
          {project.description && (
            <p className="mt-1 text-sm text-muted-foreground">
              {project.description}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Path: <code className="rounded bg-muted px-1.5 py-0.5">{project.path}</code>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEditProject(true)}
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>
          <button
            onClick={() => setShowDeleteProject(true)}
            className="inline-flex items-center gap-2 rounded-md border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>

      {/* Tabs (only Instances for now) */}
      <div className="border-b border-border">
        <nav className="flex gap-4">
          <button className="border-b-2 border-primary px-1 pb-3 text-sm font-medium text-primary">
            Instances
          </button>
        </nav>
      </div>

      {/* Instances section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Instances</h2>
          <button
            onClick={() => {
              setEditingInstance(null);
              setShowInstanceForm(true);
            }}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Instance
          </button>
        </div>

        {instancesLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!instancesLoading && instances?.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-12">
            <Server className="h-10 w-10 text-muted-foreground/50" />
            <h3 className="mt-3 text-sm font-medium text-foreground">
              No instances
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Add an instance to start using this project.
            </p>
          </div>
        )}

        {!instancesLoading && instances && instances.length > 0 && (
          <div className="space-y-2">
            {instances.map((instance) => (
              <InstanceCard
                key={instance.id}
                instance={instance}
                onEdit={(inst) => {
                  setEditingInstance(inst);
                  setShowInstanceForm(true);
                }}
                onDelete={(inst) => setDeletingInstance(inst)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Instance form dialog */}
      <InstanceForm
        open={showInstanceForm}
        projectId={projectId!}
        instance={editingInstance}
        onClose={() => {
          setShowInstanceForm(false);
          setEditingInstance(null);
        }}
      />

      {/* Edit project dialog */}
      <ProjectForm
        open={showEditProject}
        project={project}
        onClose={() => setShowEditProject(false)}
      />

      {/* Delete project confirmation */}
      <ConfirmDialog
        open={showDeleteProject}
        title="Delete Project"
        message={`Are you sure you want to delete "${project.name}"? This action cannot be undone and will also delete all associated instances.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => deleteProjectMutation.mutate()}
        onCancel={() => setShowDeleteProject(false)}
      />

      {/* Delete instance confirmation */}
      <ConfirmDialog
        open={!!deletingInstance}
        title="Delete Instance"
        message={`Are you sure you want to delete "${deletingInstance?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={() => {
          if (deletingInstance) {
            deleteInstanceMutation.mutate(deletingInstance.id);
          }
        }}
        onCancel={() => setDeletingInstance(null)}
      />
    </div>
  );
}
