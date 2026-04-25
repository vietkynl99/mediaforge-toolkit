import React from 'react';
import { MediaJob } from '../../types';

interface JobLogModalProps {
  open: boolean;
  job: MediaJob | null;
  onClose: () => void;
  onCopy: (content: string) => void;
}

export const JobLogModal: React.FC<JobLogModalProps> = ({
  open,
  job,
  onClose,
  onCopy
}) => {
  if (!open || !job) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-[min(820px,92vw)] max-h-[80vh] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-widest">System Log</div>
            <div className="text-sm font-semibold text-zinc-100">{job.name}</div>
            <div className="text-xs text-zinc-500 mt-1">{job.fileName}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onCopy(job.log || job.error || '')}
              className="px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
            >
              Copy
            </button>
            <button
              onClick={onClose}
              className="px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
            >
              Close
            </button>
          </div>
        </div>
        <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-200 whitespace-pre-wrap overflow-y-auto">
          {job.log || job.error || 'No log output yet.'}
        </div>
      </div>
    </div>
  );
};
