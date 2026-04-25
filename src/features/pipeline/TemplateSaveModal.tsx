import React from 'react';

interface TemplateSaveModalProps {
  open: boolean;
  onClose: () => void;
  templateSaveTaskType: string | null;
  templateSaveError: string | null;
  templateSaveName: string;
  setTemplateSaveName: (value: string) => void;
  onConfirm: () => void;
}

export const TemplateSaveModal: React.FC<TemplateSaveModalProps> = ({
  open,
  onClose,
  templateSaveTaskType,
  templateSaveError,
  templateSaveName,
  setTemplateSaveName,
  onConfirm
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-[min(520px,92vw)] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-5 flex flex-col gap-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold text-zinc-100">Save Template</div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
          >
            Close
          </button>
        </div>
        <div className="text-xs text-zinc-500">
          {templateSaveTaskType === 'render' ? 'Save Render template (inputs will be placeholders).' : 'Save task template.'}
        </div>
        {templateSaveError && (
          <div className="text-xs text-amber-300 border border-amber-500/30 bg-amber-500/10 rounded-lg px-2.5 py-2">
            {templateSaveError}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <label className="text-xs text-zinc-500 uppercase tracking-widest">Template Name</label>
          <input
            value={templateSaveName}
            onChange={e => setTemplateSaveName(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none"
            placeholder="My template"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={Boolean(templateSaveError)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-lime-500 text-zinc-950 hover:bg-lime-400 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
};
