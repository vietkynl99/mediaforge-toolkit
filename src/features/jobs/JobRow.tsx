import React from 'react';
import { motion } from 'motion/react';
import { 
  ChevronRight, 
  Clock, 
  RefreshCw, 
  AlertCircle, 
  CheckCircle2, 
  Pause,
  File
} from 'lucide-react';
import { MediaJob, TASK_ICONS, JobStatus } from '../../types';
import { formatLocalDateTime, formatDurationMs, formatRelativeTime } from '../../utils/format';
import { useLongPress } from '../../hooks/useLongPress';

const StatusBadge = ({ status }: { status: JobStatus }) => {
  const configs = {
    queued: { icon: Clock, color: 'text-zinc-400 bg-zinc-400/10', label: 'Queued', shortLabel: 'Queued' },
    processing: { icon: RefreshCw, color: 'text-blue-400 bg-blue-400/10', label: 'Processing', shortLabel: 'Proc' },
    awaiting_input: { icon: AlertCircle, color: 'text-amber-400 bg-amber-400/10', label: 'Awaiting Review', shortLabel: 'Review' },
    completed: { icon: CheckCircle2, color: 'text-lime-400 bg-lime-400/10', label: 'Completed', shortLabel: 'Done' },
    failed: { icon: AlertCircle, color: 'text-red-400 bg-red-400/10', label: 'Failed', shortLabel: 'Fail' },
    cancelled: { icon: Pause, color: 'text-zinc-400 bg-zinc-400/10', label: 'Cancelled', shortLabel: 'Cancel' },
  };
  const config = configs[status];
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-1.5 px-1.5 md:px-2 py-1 rounded-md text-[9px] md:text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
      <Icon size={10} className={`${status === 'processing' ? 'animate-spin-soft' : ''} md:size-3`} />
      <span className="hidden md:inline">{config.label}</span>
      <span className="md:hidden">{config.shortLabel}</span>
    </div>
  );
};

interface JobRowProps {
  job: MediaJob;
  index: number;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>, job: MediaJob) => void;
  nowMs: number | null;
  hasServerNow: boolean;
}

export const JobRow = React.memo(function JobRow({ job, index, onContextMenu, nowMs, hasServerNow }: JobRowProps) {
  const longPressProps = useLongPress((e) => {
    // Only handle touch events for long press
    if ('touches' in e) {
      onContextMenu(e as unknown as React.TouchEvent<HTMLDivElement>, job);
    }
  });

  const elapsedMs = (() => {
    if (job.startedAt) {
      const start = new Date(job.startedAt).getTime();
      const end = job.finishedAt ? new Date(job.finishedAt).getTime() : nowMs;
      if (!job.finishedAt && (!hasServerNow || end === null)) return null;
      if (Number.isFinite(start) && Number.isFinite(end)) {
        return Math.max(0, end - start);
      }
    }
    return job.durationMs ?? null;
  })();

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-[24px_70px_minmax(150px,1fr)_100px_90px_90px_70px] sm:grid-cols-[28px_130px_minmax(0,1fr)_130px_120px_110px_80px] items-center gap-2 sm:gap-4 p-3 sm:p-4 border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors group select-none"
      onContextMenu={(event) => onContextMenu(event, job)}
      {...longPressProps}
    >
      <div className="text-xs text-zinc-600 font-mono text-right pr-0.5">
        {index}
      </div>

      <div className="text-xs text-zinc-500" title={formatLocalDateTime(job.createdAt)}>
        {formatRelativeTime(job.createdAt)}
      </div>

      <div className="flex min-w-0 flex-col gap-0.5 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="text-[11px] md:text-sm font-semibold text-zinc-100 truncate">
            {job.projectName || 'Unknown Project'}
          </span>
        </div>
        <span className="text-[10px] md:text-xs text-zinc-500 truncate">
          {job.fileName} • {job.fileSize}
        </span>
      </div>

      <div className="flex w-[100px] sm:w-[130px] flex-col gap-1 shrink-0">
        <div className="text-[11px] text-zinc-300 font-semibold truncate">
          {job.name}
        </div>
        {/* Mobile: Summary text */}
        <div className="flex sm:hidden items-center gap-1.5">
          {(() => {
            const tasks = job.tasks || [];
            const done = tasks.filter(t => t.status === 'done').length;
            const error = tasks.filter(t => t.status === 'error').length;
            const active = tasks.filter(t => t.status === 'active').length;
            return (
              <>
                <span className="text-[10px] text-zinc-400">{done}/{tasks.length} done</span>
                {error > 0 && <AlertCircle size={12} className="text-red-400" />}
                {active > 0 && <RefreshCw size={12} className="text-blue-400 animate-spin-soft" />}
              </>
            );
          })()}
        </div>
        {/* Desktop: Icon row */}
        <div className="hidden sm:flex items-center gap-0.5">
          {job.tasks ? job.tasks.map((task, i) => {
            const Icon = (TASK_ICONS as any)[task.type] ?? File;
            const statusLabel = {
              pending: 'Pending',
              active: 'Active',
              done: 'Done',
              error: 'Error'
            }[task.status] ?? task.status;
            return (
              <React.Fragment key={task.id}>
                <div 
                  title={`${task.name} • ${statusLabel} • ${task.status === 'error' ? 100 : Math.round(task.progress ?? 0)}%`}
                  className={`p-1.5 rounded-md relative ${
                    task.status === 'done' ? 'bg-lime-500/20 text-lime-400' : 
                    task.status === 'active' ? 'bg-blue-500/20 text-blue-400 animate-pulse' : 
                    'bg-zinc-800 text-zinc-600'
                  }`}
                >
                  <Icon size={14} />
                  {task.status === 'active' && typeof task.progress === 'number' && task.progress > 0 && (
                    <span className="absolute -bottom-1 -right-1 text-[8px] font-bold text-blue-200">
                      {Math.round(task.progress)}%
                    </span>
                  )}
                  {task.status === 'error' && (
                    <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-red-500 text-[9px] leading-3 text-white flex items-center justify-center">✕</span>
                  )}
                </div>
                {i < job.tasks.length - 1 && <ChevronRight size={12} className="text-zinc-700 -mx-0.5" />}
              </React.Fragment>
            );
          }) : (
            <span className="text-[10px] text-zinc-500">{job.taskCount ?? '?'} tasks</span>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-[10px] font-mono text-zinc-400">
          <span>{job.progress}%</span>
          <span>{job.eta || '--'}</span>
        </div>
        <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${job.progress}%` }}
            className={`h-full ${
              job.status === 'failed' ? 'bg-red-500' : job.status === 'cancelled' ? 'bg-zinc-500' : 'bg-lime-500'
            }`}
          />
        </div>
      </div>

      <div className="flex w-[100px] justify-start shrink-0">
        <StatusBadge status={job.status} />
      </div>

      <div className="text-xs text-zinc-500 text-right -ml-2">
        {elapsedMs !== null ? formatDurationMs(elapsedMs) : '--'}
      </div>
    </motion.div>
  );
});
