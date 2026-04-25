import { RenderTemplate, RenderConfigV2 } from '../types/index';

export const renderService = {
  async getTemplates(): Promise<RenderTemplate[]> {
    const response = await fetch('/api/render-templates');
    if (!response.ok) throw new Error('Unable to load templates');
    const data = await response.json();
    return (data?.templates || []) as RenderTemplate[];
  },

  async saveTemplate(payload: { id?: string | null; name: string; config: RenderConfigV2 }): Promise<RenderTemplate> {
    const body: Record<string, any> = {
      name: payload.name,
      config: payload.config
    };
    const numericId = payload.id ? Number(payload.id) : null;
    if (numericId !== null && Number.isFinite(numericId)) body.id = numericId;

    const response = await fetch('/api/render-templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Unable to save template');
    }
    const data = await response.json();
    return data.template as RenderTemplate;
  },

  async deleteTemplate(id: string): Promise<void> {
    const response = await fetch(`/api/render-templates/${id}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || 'Unable to delete template');
    }
  }
};
