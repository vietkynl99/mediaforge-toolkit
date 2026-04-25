import React from 'react';
import { Download } from 'lucide-react';

interface AppContextMenusProps {
  showParamPresets: boolean;
  pipelineContextMenu: any;
  pipelineContextTarget: any;
  setPipelineContextMenu: React.Dispatch<React.SetStateAction<any>>;
  openPipelinePreview: (target: any) => void;
  openPipelineEditor: (target: any) => void;
  deletePipeline: (id: string) => void;
  paramPresetContextMenu: any;
  paramPresetContextTarget: any;
  setParamPresetContextMenu: React.Dispatch<React.SetStateAction<any>>;
  openParamPresetEditorForEdit: (presetId: number) => void;
  openConfirm: (options: any, onConfirm: () => void) => void;
  deleteParamPreset: (id: number, type: string) => void;
  fileContextMenu: any;
  closeFileContextMenu: () => void;
  downloadVaultFile: (file: any) => void;
}

export const AppContextMenus: React.FC<AppContextMenusProps> = ({
  showParamPresets,
  pipelineContextMenu,
  pipelineContextTarget,
  setPipelineContextMenu,
  openPipelinePreview,
  openPipelineEditor,
  deletePipeline,
  paramPresetContextMenu,
  paramPresetContextTarget,
  setParamPresetContextMenu,
  openParamPresetEditorForEdit,
  openConfirm,
  deleteParamPreset,
  fileContextMenu,
  closeFileContextMenu,
  downloadVaultFile
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

      {showParamPresets && paramPresetContextMenu.open && paramPresetContextTarget && (
        <div className="fixed inset-0 z-[55]" onClick={() => setParamPresetContextMenu(prev => ({ ...prev, open: false }))}>
          <div
            className="absolute rounded-lg border border-zinc-800 bg-zinc-950 shadow-2xl p-1 min-w-[160px]"
            style={{ top: paramPresetContextMenu.y, left: paramPresetContextMenu.x }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="w-full px-3 py-2 text-left text-xs text-zinc-200 hover:bg-zinc-900 rounded-md"
              onClick={() => {
                setParamPresetContextMenu(prev => ({ ...prev, open: false }));
                openParamPresetEditorForEdit(paramPresetContextTarget.id);
              }}
            >
              Edit
            </button>
            <button
              className="w-full px-3 py-2 text-left text-xs text-red-400 hover:bg-red-500/10 rounded-md"
              onClick={() => {
                setParamPresetContextMenu(prev => ({ ...prev, open: false }));
                openConfirm({
                  title: `Delete ${paramPresetContextTarget.label}?`,
                  description: 'This will remove saved preset params for this preset.',
                  confirmLabel: 'Delete',
                  variant: 'danger'
                }, () => {
                  deleteParamPreset(paramPresetContextTarget.id, paramPresetContextTarget.type);
                });
              }}
            >
              Delete
            </button>
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
          </div>
        </div>
      )}
    </>
  );
};
