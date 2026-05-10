import React from 'react';
import { Download, Trash2, Pencil } from 'lucide-react';

interface AppContextMenusProps {
  pipelineContextMenu: any;
  pipelineContextTarget: any;
  setPipelineContextMenu: React.Dispatch<React.SetStateAction<any>>;
  openPipelinePreview: (target: any) => void;
  openPipelineEditor: (target: any) => void;
  deletePipeline: (id: string) => void;
  fileContextMenu: any;
  closeFileContextMenu: () => void;
  downloadVaultFile: (file: any) => void;
  deleteVaultFile: (file: any) => void;
  renameVaultFile: (file: any, newName: string) => void;
  openConfirm: (config: { title: string; description?: string; confirmLabel?: string; variant?: 'danger' | 'default' }, onConfirm: () => void) => void;
  openPrompt: (config: { title: string; description?: string; placeholder?: string; initialValue?: string; confirmLabel?: string }, onSubmit: (value: string) => void) => void;
}

export const AppContextMenus: React.FC<AppContextMenusProps> = ({
  pipelineContextMenu,
  pipelineContextTarget,
  setPipelineContextMenu,
  openPipelinePreview,
  openPipelineEditor,
  deletePipeline,
  fileContextMenu,
  closeFileContextMenu,
  downloadVaultFile,
  deleteVaultFile,
  renameVaultFile,
  openConfirm,
  openPrompt
}) => {
  return (
    <>
      {pipelineContextMenu.open && pipelineContextTarget && (
        <div className="fixed inset-0 z-[55]" onClick={() => setPipelineContextMenu(prev => ({ ...prev, open: false }))}>
          <div
            className="absolute rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl p-1 min-w-[160px]"
            style={{ top: pipelineContextMenu.y, left: pipelineContextMenu.x }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
              onClick={() => {
                setPipelineContextMenu(prev => ({ ...prev, open: false }));
                if (pipelineContextTarget.kind === 'task') {
                  openPipelinePreview(pipelineContextTarget);
                } else {
                  openPipelineEditor(pipelineContextTarget);
                }
              }}
            >
              Open
            </button>
            {pipelineContextTarget.kind === 'saved' && (
              <button
                className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 rounded-md"
                onClick={() => {
                  setPipelineContextMenu(prev => ({ ...prev, open: false }));
                  deletePipeline(pipelineContextTarget.id);
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}

      {fileContextMenu.open && fileContextMenu.file && (
        <div className="fixed inset-0 z-[55]" onClick={closeFileContextMenu}>
          <div
            className="absolute rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl p-1 min-w-[160px]"
            style={{ top: fileContextMenu.y, left: fileContextMenu.x }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
              onClick={() => {
                if (fileContextMenu.file) {
                  downloadVaultFile(fileContextMenu.file);
                }
                closeFileContextMenu();
              }}
            >
              <span className="flex items-center gap-2">
                <Download size={12} />
                Download
              </span>
            </button>
            <button
              className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
              onClick={() => {
                if (fileContextMenu.file) {
                  const target = fileContextMenu.file;
                  closeFileContextMenu();
                  openPrompt(
                    {
                      title: 'Rename file',
                      description: 'Enter a new name for the file:',
                      placeholder: 'New file name',
                      initialValue: target.name,
                      confirmLabel: 'Rename'
                    },
                    (newName) => renameVaultFile(target, newName)
                  );
                }
              }}
            >
              <span className="flex items-center gap-2">
                <Pencil size={12} />
                Rename
              </span>
            </button>
            <button
              className="w-full px-3 py-2 text-left text-xs text-red-300 hover:bg-red-500/10 rounded-md"
              onClick={() => {
                if (fileContextMenu.file) {
                  const target = fileContextMenu.file;
                  closeFileContextMenu();
                  openConfirm(
                    {
                      title: `Delete "${target.name}"?`,
                      description: 'This will remove the file from the project and Media Vault.',
                      confirmLabel: 'Delete',
                      variant: 'danger'
                    },
                    () => deleteVaultFile(target)
                  );
                }
              }}
            >
              <span className="flex items-center gap-2">
                <Trash2 size={12} />
                Delete
              </span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
