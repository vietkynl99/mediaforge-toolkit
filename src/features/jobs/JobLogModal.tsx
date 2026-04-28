import React, { useEffect, useState } from 'react';
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
  const [logContent, setLogContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !job) {
      setLogContent('');
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`/api/jobs/${job.id}/log`)
      .then(res => {
        if (!res.ok) throw new Error('Failed to load log');
        return res.text();
      })
      .then(text => {
        setLogContent(text);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Failed to load log');
        setLoading(false);
      });
  }, [open, job?.id]);

  if (!open || !job) return null;

  const displayContent = logContent || job.error || 'No log output yet.';

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-[min(820px,92vw)] max-h-[80vh] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-zinc-500 uppercase tracking-widest">System Log</div>
            <div className="text-sm font-semibold text-zinc-100">{job.name}</div>
            <div className="text-xs text-zinc-500 mt-1">{job.fileName}</div>
            {job.logFile && (
              <div className="text-xs text-zinc-600 mt-1">{job.logFile}</div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onCopy(displayContent)}
              disabled={loading}
              className="px-3 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-50"
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
          {loading && (
            <div className="text-zinc-500">Loading log...</div>
          )}
          {error && (
            <div className="text-red-400">{error}</div>
          )}
          {!loading && !error && displayContent}
        </div>
      </div>
    </div>
  );
};
