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
