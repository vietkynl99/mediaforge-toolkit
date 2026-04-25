import React from 'react';
import { useRenderStudioPage } from '../RenderStudioPageContext';

export const RenderStudioTemplateSaveConfirmDialog: React.FC = () => {
  const { local } = useRenderStudioPage();

  if (!local.templateSaveConfirmOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-zinc-950/70 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-950 shadow-xl p-4">
        <div className="text-sm font-semibold text-zinc-100">Save Template?</div>
        <div className="mt-2 text-xs text-zinc-400">
          This will overwrite template <span className="text-zinc-200">{local.selectedTemplate?.name ?? 'current template'}</span>.
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          {local.templateChangeCount} parameter change{local.templateChangeCount === 1 ? '' : 's'} will be saved.
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => local.setTemplateSaveConfirmOpen(false)}
            className="px-3 py-1.5 text-xs rounded-md border border-zinc-700 text-zinc-300 hover:text-zinc-100 hover:border-zinc-600"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={local.confirmSaveTemplate}
            className="px-3 py-1.5 text-xs rounded-md border border-lime-600/70 text-lime-300 hover:text-lime-200 hover:border-lime-500"
          >
            Confirm Save
          </button>
        </div>
      </div>
    </div>
  );
};

