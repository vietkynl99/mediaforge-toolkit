import { VaultFile, VaultFolder, VaultFolderDTO, VaultStatus } from '../types/vault';
import { SubtitleSegment } from '../features/subtitle/types';
import { parseSRT, parseSktProject, parseCapCutDraft, generateSktProject } from '../features/subtitle/services/subtitleLogic';

export const vaultService = {
  async getFolders(): Promise<VaultFolder[]> {
    const response = await fetch('/api/vault');
    if (!response.ok) {
      throw new Error(`Vault API error (${response.status})`);
    }
    const data = await response.json() as { folders: VaultFolderDTO[] };
    
    return data.folders.map((folder, folderIndex) => {
      const mappedFiles: VaultFile[] = folder.files.map((file, fileIndex) => {
        const normalizedRelative = file.relativePath?.includes('/')
          ? file.relativePath
          : `${folder.name}/${file.relativePath}`;
          
        return {
          id: `file-${folderIndex}-${fileIndex}-${file.name}`,
          name: file.name,
          type: file.type,
          size: file.size,
          sizeBytes: file.sizeBytes,
          relativePath: normalizedRelative,
          duration: file.duration,
          durationSeconds: file.durationSeconds,
          updatedAt: file.updatedAt,
        };
      });

      return {
        id: `folder-${folderIndex}-${folder.name}`,
        name: folder.name,
        updatedAt: folder.updatedAt,
        status: folder.status as VaultStatus,
        files: mappedFiles,
      };
    });
  },

  async deleteProject(projectName: string): Promise<void> {
    const response = await fetch('/api/vault/project', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Delete failed (${response.status})`);
    }
  },

  async deleteFile(relativePath: string): Promise<void> {
    const response = await fetch('/api/vault/file', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relativePath })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Delete failed (${response.status})`);
    }
  },

  async importFiles(projectName: string, files: File[]): Promise<{ count: number }> {
    const form = new FormData();
    form.append('projectName', projectName.trim());
    files.forEach(file => form.append('files', file));
    const response = await fetch('/api/vault/import', {
      method: 'POST',
      body: form
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Import failed');
    }
    return data;
  },

  async updateProjectStatus(projectName: string, status: VaultStatus): Promise<void> {
    const response = await fetch('/api/vault/project/status', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectName, status })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Update status failed (${response.status})`);
    }
  },

  async getFileContent(relativePath: string): Promise<string> {
    const response = await fetch(`/api/vault/text?path=${encodeURIComponent(relativePath)}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch file content (${response.status})`);
    }
    const data = await response.json() as { content: string };
    return data.content;
  },

  async loadSubtitleFile(relativePath: string): Promise<{ segments: SubtitleSegment[], preset?: any }> {
    const content = await this.getFileContent(relativePath);
    const lower = relativePath.toLowerCase();
    
    if (lower.endsWith('.srt')) {
      return { segments: parseSRT(content) };
    } else if (lower.endsWith('.sktproject')) {
      const res = parseSktProject(content);
      return { segments: res.segments, preset: res.preset };
    } else if (lower.endsWith('.json')) {
      const res = parseCapCutDraft(content);
      return { segments: res.segments };
    }
    throw new Error('Unsupported subtitle format');
  },

  async saveSubtitleFile(relativePath: string, content: string): Promise<void> {
    const response = await fetch('/api/vault/subtitle/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relativePath, content })
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `Save failed (${response.status})`);
    }
  }
};
