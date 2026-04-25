import React from 'react';
import { motion } from 'motion/react';
import { RefreshCw, Pause, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { MediaJob, JobStatus } from '../../types';

interface LogsPanelProps {
  jobs: MediaJob[];
  formatLocalDateTime: (value?: string) => string;
}

const StatusBadge = ({ status }: { status: JobStatus }) => {
  const configs = {
    queued: { icon: Clock, color: 'text-zinc-400 bg-zinc-400/10', label: 'Queued' },
    processing: { icon: RefreshCw, color: 'text-blue-400 bg-blue-400/10', label: 'Processing' },
    awaiting_input: { icon: AlertCircle, color: 'text-amber-400 bg-amber-400/10', label: 'Awaiting Review' },
    completed: { icon: CheckCircle2, color: 'text-lime-400 bg-lime-400/10', label: 'Completed' },
    failed: { icon: AlertCircle, color: 'text-red-400 bg-red-400/10', label: 'Failed' },
    cancelled: { icon: Pause, color: 'text-zinc-400 bg-zinc-400/10', label: 'Cancelled' }
  } as const;

  const config = configs[status];
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
      <Icon size={12} className={status === 'processing' ? 'animate-spin-soft' : ''} />
      {config.label}
    </div>
  );
};

export const LogsPanel: React.FC<LogsPanelProps> = ({ jobs, formatLocalDateTime }) => {
  return (
    <motion.div
      key="logs"
      initial={false}
      animate={false as any}
      exit={false as any}
      className="p-8"
    >
      {jobs.length === 0 ? (
        <div className="text-sm text-zinc-500">No logs yet.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {jobs.map(job => (
            <div key={job.id} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <div className="text-xs text-zinc-500 uppercase tracking-widest">System Log</div>
                  <div className="text-sm font-semibold text-zinc-100 truncate">
                    {job.projectName || 'Unknown Project'}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1 truncate">
                    {job.fileName} • {job.fileSize} • {formatLocalDateTime(job.createdAt)}
                  </div>
                </div>
                <div className="shrink-0">
                  <StatusBadge status={job.status} />
                </div>
              </div>
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 text-xs text-zinc-200 whitespace-pre-wrap">
                {job.log || job.error || 'No log output yet.'}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
};
