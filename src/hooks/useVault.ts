import { useState, useCallback, useEffect } from 'react';
import { VaultFolder, VaultFile } from '../types/vault';
import { vaultService } from '../services/vault';
import { useToast } from './useToast';

export function useVault() {
  const [folders, setFolders] = useState<VaultFolder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showToast } = useToast();

  const loadVault = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await vaultService.getFolders();
      setFolders(data);
      return data;
    } catch (err: any) {
      setError(err.message);
      showToast(err.message, 'error');
      return [];
    } finally {
      if (!silent) setLoading(false);
    }
  }, [showToast]);

  const deleteProject = async (folder: VaultFolder) => {
    try {
      await vaultService.deleteProject(folder.name);
      showToast(`Deleted ${folder.name}`, 'success');
      await loadVault(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const deleteFile = async (file: VaultFile) => {
    try {
      await vaultService.deleteFile(file.relativePath);
      showToast(`Deleted ${file.name}`, 'success');
      await loadVault(true);
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  return {
    folders,
    loading,
    error,
    loadVault,
    deleteProject,
    deleteFile
  };
}
