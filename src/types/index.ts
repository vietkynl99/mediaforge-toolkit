import { AuthUser } from './auth';
import { MediaJob } from './job';
import { VaultFile, VaultFolder, VaultFileType } from './vault';
import { RenderConfigV2, RenderTemplate, RenderBlurRegionEffect } from './render';
import { PipelineSummary, TaskTemplate } from './pipeline';

export * from './auth';
export * from './job';
export * from './vault';
export * from './render';
export * from './pipeline';

export type NewJobPopupDraft = {
  version: number;
  projectId: string | null;
  projectName: string | null;
  pipelineId: string | null;
  runPipelineRenderTemplateId: string | null;
  runPipelineTaskTemplate: Record<string, string>;
  runPipelineInputId: string | null;
  renderInputFileIds: string[];
  renderTemplateApplyMap: Record<string, string>;
  renderTemplateApplyMapById: Record<string, Record<string, string>>;
};
