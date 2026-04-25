import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, CheckCircle2, Clock } from 'lucide-react';
import { MediaJob } from '../../types';
import { JobRow } from '../jobs/JobRow';

interface DashboardProps {
  jobs: MediaJob[];
  jobPage: number;
  onPageChange: (page: number) => void;
  serverNowMs: number | null;
  onJobContextMenu: (event: React.MouseEvent, job: MediaJob) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  jobs,
  jobPage,
  onPageChange,
  serverNowMs,
  onJobContextMenu
}) => {
  const baseRef = useRef<{ serverMs: number; clientMs: number } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const needsTickRef = useRef(false);

  useEffect(() => {
    if (typeof serverNowMs !== 'number' || !Number.isFinite(serverNowMs)) return;
    baseRef.current = { serverMs: serverNowMs, clientMs: Date.now() };
    setNowMs(serverNowMs);
  }, [serverNowMs]);

  const totalPages = Math.max(1, Math.ceil(jobs.length / 10));
  const clampedJobPage = Math.min(Math.max(1, jobPage), totalPages);
  const pageJobs = useMemo(() => {
    return jobs.slice((clampedJobPage - 1) * 10, clampedJobPage * 10);
  }, [jobs, clampedJobPage]);

  useEffect(() => {
    needsTickRef.current = pageJobs.some(job => Boolean(job.startedAt) && !job.finishedAt);
  }, [pageJobs]);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (!needsTickRef.current) return;
      const base = baseRef.current;
      if (!base) {
        setNowMs(Date.now());
        return;
      }
      const delta = Date.now() - base.clientMs;
      setNowMs(base.serverMs + Math.max(0, delta));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const hasServerNow = Boolean(baseRef.current);
  const completedJobCount = jobs.filter(job => job.status === 'completed').length;
  const failedJobCount = jobs.filter(job => job.status === 'failed').length;
  const settledJobCount = completedJobCount + failedJobCount;
  const successRate = settledJobCount > 0 ? Math.round((completedJobCount / settledJobCount) * 1000) / 10 : null;

  return (
    <motion.div 
      key="dashboard"
      initial={false}
      animate={false as any}
      exit={false as any}
      className="p-8"
    >
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-3 gap-4 mb-2">
        <div className="p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg"><RefreshCw size={16} /></div>
            <h3 className="font-semibold text-zinc-200">Throughput</h3>
          </div>
          <div className="text-2xl font-bold text-zinc-100 mb-1">--</div>
          <p className="text-[11px] text-zinc-500">No telemetry yet</p>
        </div>
        <div className="p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-lime-500/10 text-lime-400 rounded-lg"><CheckCircle2 size={16} /></div>
            <h3 className="font-semibold text-zinc-200">Success Rate</h3>
          </div>
          <div className="text-2xl font-bold text-zinc-100 mb-1">{successRate !== null ? `${successRate}%` : '--'}</div>
          <p className="text-[11px] text-zinc-500">{completedJobCount} jobs completed, {failedJobCount} failed</p>
        </div>
        <div className="p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg"><Clock size={16} /></div>
            <h3 className="font-semibold text-zinc-200">Queue Time</h3>
          </div>
          <div className="text-2xl font-bold text-zinc-100 mb-1">--</div>
          <p className="text-[11px] text-zinc-500">No telemetry yet</p>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 text-xs text-zinc-500 mb-2">
        <span>
          Page {clampedJobPage} of {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(Math.max(1, clampedJobPage - 1))}
            disabled={clampedJobPage === 1}
            className="px-2 py-1 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <button
            onClick={() => onPageChange(clampedJobPage + 1)}
            disabled={clampedJobPage >= totalPages}
            className="px-2 py-1 border border-zinc-800 rounded-md text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>

      {/* Job List Table */}
      <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="grid grid-cols-[28px_130px_minmax(0,1fr)_130px_120px_110px_80px] gap-4 px-4 py-3 bg-zinc-900/50 border-b border-zinc-800 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
          <span className="text-right pr-0.5">#</span>
          <span>Created</span>
          <span>Job Details</span>
          <span>Pipeline</span>
          <span>Progress</span>
          <span>Status</span>
          <span className="text-right -ml-2">Elapsed Time</span>
        </div>
        
        <div className="flex flex-col">
          {jobs.length === 0 ? (
            <div className="p-6 text-sm text-zinc-500">No jobs yet. Run a pipeline to start processing.</div>
          ) : (
            pageJobs.map((job, index) => (
                <JobRow
                  key={job.id}
                  job={job}
                  index={(clampedJobPage - 1) * 10 + index + 1}
                  nowMs={job.startedAt && !job.finishedAt && hasServerNow ? nowMs : null}
                  hasServerNow={hasServerNow}
                  onContextMenu={onJobContextMenu}
                />
              ))
          )}
        </div>
      </div>
    </motion.div>
  );
};
