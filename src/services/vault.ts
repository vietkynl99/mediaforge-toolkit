import { VaultFile, VaultFolder, VaultFolderDTO } from '../types/vault';

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
          status: file.type === 'output' ? 'complete' : (file.type === 'subtitle' ? 'partial' : 'raw'),
        };
      });

      return {
        id: `folder-${folderIndex}-${folder.name}`,
        name: folder.name,
        updatedAt: folder.updatedAt,
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
  }
};
