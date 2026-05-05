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
  vaultFolders: Array<{ id: string; name: string; files: Array<{ id: string; relativePath?: string }> }>;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  setVaultFolderId: (id: string | null) => void;
  setVaultFileId: (id: string | null) => void;
  setShowFolderPanel: (open: boolean) => void;
  openRunPipelineFromJob: (job: MediaJob) => void;
  openSubtitleStudioFromJob: (job: MediaJob) => void;
  openJobLog: (jobId: string) => void;
  cancelJob: (id: string) => void;
  deleteJob: (id: string) => void;
  retryJob: (id: string) => void;
}

const MENU_HEIGHT_ESTIMATE = 180;
const MENU_WIDTH = 160;

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
  openSubtitleStudioFromJob,
  openJobLog,
  cancelJob,
  deleteJob,
  retryJob
}: JobContextMenuProps) {
  if (!menu.open || !job) return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  let adjustedX = menu.x;
  let adjustedY = menu.y;

  if (menu.x + MENU_WIDTH > viewportWidth) {
    adjustedX = viewportWidth - MENU_WIDTH - 8;
  }

  if (menu.y + MENU_HEIGHT_ESTIMATE > viewportHeight) {
    const overflow = (menu.y + MENU_HEIGHT_ESTIMATE) - viewportHeight;
    adjustedY = menu.y - overflow - 8;
  }

  adjustedX = Math.max(8, adjustedX);
  adjustedY = Math.max(8, adjustedY);

  return (
    <div className="fixed inset-0 z-[55]" onClick={() => setMenu(prev => ({ ...prev, open: false }))}>
      <div
        className="absolute rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl p-1 min-w-[160px]"
        style={{ top: adjustedY, left: adjustedX }}
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
        {/* Open with Subtitle Studio - only for translate jobs */}
        {job.name?.toLowerCase().includes('translate') && (
          <button
            className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
            onClick={() => {
              setMenu(prev => ({ ...prev, open: false }));
              openSubtitleStudioFromJob(job);
            }}
          >
            Open with Subtitle Studio
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
        {(job.status === 'failed' || job.status === 'cancelled') && (
          <button
            className="w-full px-3 py-2 text-left text-xs text-emerald-300 hover:bg-emerald-500/10 rounded-md"
            onClick={() => {
              setMenu(prev => ({ ...prev, open: false }));
              retryJob(job.id);
            }}
          >
            Retry
          </button>
        )}
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

