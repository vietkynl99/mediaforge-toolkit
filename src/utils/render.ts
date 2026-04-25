export const RENDER_STUDIO_PATH = '/render-studio';

export const buildRenderStudioUrl = (
  projectId?: string | null,
  templateId?: string | null,
  pipelineId?: string | null,
  projectName?: string | null
) => {
  const params = new URLSearchParams();
  if (projectName) params.set('project', projectName);
  if (projectId) params.set('projectId', projectId);
  if (templateId && templateId !== 'custom') params.set('template', templateId);
  if (pipelineId) params.set('pipeline', pipelineId);
  const query = params.toString();
  return `${RENDER_STUDIO_PATH}${query ? `?${query}` : ''}`;
};
