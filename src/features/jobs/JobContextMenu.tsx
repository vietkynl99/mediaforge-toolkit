import React from 'react';
import type { MediaJob } from '../../types';

type JobContextMenuState = {
  open: boolean;
  x: number;
  y: number;
  jobId: string | null;
};

interface JobContextMenuProps {
  menu: JobContextMenuState;
  job: MediaJob | null;
  setMenu: React.Dispatch<React.SetStateAction<JobContextMenuState>>;
  vaultFolders: Array<{ id: string; name: string; files: Array<{ id: string }> }>;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  setVaultFolderId: (id: string | null) => void;
  setVaultFileId: (id: string | null) => void;
  setShowFolderPanel: (open: boolean) => void;
  openRunPipelineFromJob: (job: MediaJob) => void;
  openJobLog: (jobId: string) => void;
  cancelJob: (id: string) => void;
  deleteJob: (id: string) => void;
}

export function JobContextMenu({
  menu,
  job,
  setMenu,
  vaultFolders,
  showToast,
  setVaultFolderId,
  setVaultFileId,
  setShowFolderPanel,
  openRunPipelineFromJob,
  openJobLog,
  cancelJob,
  deleteJob
}: JobContextMenuProps) {
  if (!menu.open || !job) return null;

  return (
    <div className="fixed inset-0 z-[55]" onClick={() => setMenu(prev => ({ ...prev, open: false }))}>
      <div
        className="absolute rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl p-1 min-w-[160px]"
        style={{ top: menu.y, left: menu.x }}
        onClick={(event) => event.stopPropagation()}
      >
        {job.projectName?.trim() && (
          <button
            className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
            onClick={() => {
              const projectName = job.projectName?.trim();
              const match = projectName
                ? vaultFolders.find(folder => folder.name.toLowerCase() === projectName.toLowerCase())
                : undefined;
              if (!projectName || !match) {
                showToast('Project not found in Media Vault', 'warning');
                setMenu(prev => ({ ...prev, open: false }));
                return;
              }
              setVaultFolderId(match.id);
              setVaultFileId(match.files[0]?.id ?? null);
              setShowFolderPanel(true);
              setMenu(prev => ({ ...prev, open: false }));
            }}
          >
            Open project
          </button>
        )}
        <button
          className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
          onClick={() => {
            setMenu(prev => ({ ...prev, open: false }));
            openRunPipelineFromJob(job);
          }}
        >
          Run again
        </button>
        <button
          className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
          onClick={() => {
            openJobLog(job.id);
            setMenu(prev => ({ ...prev, open: false }));
          }}
        >
          View log
        </button>
        {(job.status === 'queued' || job.status === 'processing') ? (
          <button
            className="w-full px-3 py-2 text-left text-xs text-amber-300 hover:bg-amber-500/10 rounded-md"
            onClick={() => {
              setMenu(prev => ({ ...prev, open: false }));
              cancelJob(job.id);
            }}
          >
            Cancel job
          </button>
        ) : (
          <button
            className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 rounded-md"
            onClick={() => {
              setMenu(prev => ({ ...prev, open: false }));
              deleteJob(job.id);
            }}
          >
            Delete job
          </button>
        )}
      </div>
    </div>
  );
}

