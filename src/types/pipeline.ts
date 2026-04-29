export type PipelineSummary = {
  id: string;
  name: string;
  steps: number;
  updatedAt: string;
  kind: 'saved' | 'task';
  primaryType?: string | null;
};

export type TaskTemplate = {
  type: string;
  label: string;
  desc: string;
  inputs: string[];
  outputs: string[];
  params?: Array<{
    name: string;
    desc: string;
    type: string;
    default?: string | number | boolean;
  }>;
  preview?: string;
};

// Saved task template from backend (has id, name, taskType, params, updatedAt)
export type SavedTaskTemplate = {
  id: string;
  name: string;
  taskType: string;
  params: Record<string, any>;
  updatedAt: string;
};
