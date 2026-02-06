import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import type { Instance } from '@/types';

const instanceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  model: z.string().min(1, 'Model is required'),
  max_turns: z.coerce
    .number()
    .int('Must be a whole number')
    .min(1, 'Must be at least 1')
    .max(1000, 'Must be at most 1000'),
});

type InstanceFormData = z.infer<typeof instanceSchema>;

interface InstanceFormProps {
  open: boolean;
  projectId: string;
  instance?: Instance | null;
  onClose: () => void;
}

export function InstanceForm({
  open,
  projectId,
  instance,
  onClose,
}: InstanceFormProps) {
  const queryClient = useQueryClient();
  const isEditing = !!instance;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InstanceFormData>({
    resolver: zodResolver(instanceSchema),
    defaultValues: {
      name: '',
      model: 'sonnet',
      max_turns: 25,
    },
  });

  useEffect(() => {
    if (instance) {
      reset({
        name: instance.name,
        model: instance.model,
        max_turns: instance.max_turns,
      });
    } else {
      reset({ name: '', model: 'sonnet', max_turns: 25 });
    }
  }, [instance, reset]);

  const createMutation = useMutation({
    mutationFn: (data: InstanceFormData) =>
      api.post(`/projects/${projectId}/instances`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['instances', projectId],
      });
      toast.success('Instance created successfully');
      onClose();
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: InstanceFormData) =>
      api.put(`/projects/${projectId}/instances/${instance!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['instances', projectId],
      });
      toast.success('Instance updated successfully');
      onClose();
    },
  });

  const onSubmit = (data: InstanceFormData) => {
    if (isEditing) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative z-50 w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-lg">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">
            {isEditing ? 'Edit Instance' : 'New Instance'}
          </h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Name field */}
          <div>
            <label
              htmlFor="instance-name"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Name <span className="text-red-500">*</span>
            </label>
            <input
              id="instance-name"
              type="text"
              {...register('name')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="My Instance"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          {/* Model field */}
          <div>
            <label
              htmlFor="model"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Model
            </label>
            <select
              id="model"
              {...register('model')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="sonnet">Sonnet</option>
              <option value="opus">Opus</option>
              <option value="haiku">Haiku</option>
            </select>
            {errors.model && (
              <p className="mt-1 text-xs text-red-500">
                {errors.model.message}
              </p>
            )}
          </div>

          {/* Max turns field */}
          <div>
            <label
              htmlFor="max-turns"
              className="block text-sm font-medium text-foreground mb-1.5"
            >
              Max Turns
            </label>
            <input
              id="max-turns"
              type="number"
              {...register('max_turns')}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="25"
            />
            {errors.max_turns && (
              <p className="mt-1 text-xs text-red-500">
                {errors.max_turns.message}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isSubmitting
                ? 'Saving...'
                : isEditing
                  ? 'Update Instance'
                  : 'Create Instance'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
