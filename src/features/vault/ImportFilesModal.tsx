import React from 'react';
import type { VaultFolder } from '../app/appData';

interface ImportFilesModalProps {
  open: boolean;
  onClose: () => void;
  importProjectName: string;
  setImportProjectName: (value: string) => void;
  importProjectPickerOpen: boolean;
  setImportProjectPickerOpen: (value: boolean) => void;
  vaultFolders: VaultFolder[];
  importFiles: File[];
  setImportFiles: (files: File[]) => void;
  importError: string | null;
  importSubmitting: boolean;
  onImport: () => void;
}

export const ImportFilesModal: React.FC<ImportFilesModalProps> = ({
  open,
  onClose,
  importProjectName,
  setImportProjectName,
  importProjectPickerOpen,
  setImportProjectPickerOpen,
  vaultFolders,
  importFiles,
  setImportFiles,
  importError,
  importSubmitting,
  onImport
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-[min(560px,92vw)] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-widest">Import Files</div>
            <div className="text-sm font-semibold text-zinc-100">Add files to project</div>
          </div>
          <button
            onClick={onClose}
            className="px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
          >
            Close
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-zinc-500 uppercase tracking-widest">Project</label>
          <div className="relative">
            <input
              value={importProjectName}
              onChange={e => {
                const nextValue = e.target.value;
                setImportProjectName(nextValue);
                setImportProjectPickerOpen(true);
              }}
              onFocus={() => setImportProjectPickerOpen(true)}
              onBlur={() => setTimeout(() => setImportProjectPickerOpen(false), 120)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none"
              placeholder="Project name (new or existing)"
              autoComplete="off"
            />
            {importProjectPickerOpen && vaultFolders.length > 0 && (
              <div className="absolute z-50 mt-1 w-full max-h-56 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 shadow-xl">
                {vaultFolders
                  .filter(folder => folder.name.toLowerCase().includes(importProjectName.trim().toLowerCase()))
                  .map(folder => (
                    <button
                      type="button"
                      key={folder.id}
                      onMouseDown={() => {
                        setImportProjectName(folder.name);
                        setImportProjectPickerOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-zinc-200 hover:bg-zinc-900"
                    >
                      {folder.name}
                    </button>
                  ))}
                {vaultFolders.filter(folder => folder.name.toLowerCase().includes(importProjectName.trim().toLowerCase())).length === 0 && (
                  <div className="px-3 py-2 text-xs text-zinc-500">No matches</div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-xs text-zinc-500 uppercase tracking-widest">Files</label>
          <label className="flex items-center justify-between gap-3 px-3 py-2 border border-dashed border-zinc-700 rounded-lg text-sm text-zinc-400 hover:border-zinc-500 cursor-pointer">
            <span>{importFiles.length ? `${importFiles.length} file(s) selected` : 'Choose files'}</span>
            <input
              type="file"
              multiple
              onChange={e => setImportFiles(Array.from(e.target.files ?? []))}
              className="hidden"
            />
          </label>
          {importFiles.length > 0 && (
            <div className="text-[11px] text-zinc-500">
              {importFiles.slice(0, 3).map(file => file.name).join(', ')}
              {importFiles.length > 3 ? ` +${importFiles.length - 3} more` : ''}
            </div>
          )}
        </div>

        {importError && <div className="text-xs text-red-400">{importError}</div>}

        <button
          onClick={onImport}
          disabled={importSubmitting}
          className="w-full px-4 py-2 bg-lime-500 text-zinc-950 rounded-lg text-xs font-semibold hover:bg-lime-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {importSubmitting ? 'Importing...' : 'Import'}
        </button>
      </div>
    </div>
  );
};
