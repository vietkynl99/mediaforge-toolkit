import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, CheckCircle2, Clock, Search, X, ChevronDown, Filter } from 'lucide-react';
import { MediaJob, JobStatus } from '../../types';
import { JobRow } from '../jobs/JobRow';

const JOB_STATUSES: JobStatus[] = ['queued', 'processing', 'awaiting_input', 'completed', 'failed', 'cancelled'];

const STATUS_COLORS: Record<JobStatus, string> = {
  queued: 'bg-zinc-500',
  processing: 'bg-blue-500',
  awaiting_input: 'bg-amber-500',
  completed: 'bg-lime-500',
  failed: 'bg-red-500',
  cancelled: 'bg-zinc-600'
};

const PIPELINE_TYPES = ['download', 'uvr', 'tts', 'stt', 'translate', 'edit', 'burn', 'render'] as const;

const PIPELINE_COLORS: Record<string, string> = {
  download: 'bg-blue-500',
  uvr: 'bg-purple-500',
  tts: 'bg-pink-500',
  stt: 'bg-cyan-500',
  translate: 'bg-indigo-500',
  edit: 'bg-orange-500',
  burn: 'bg-red-500',
  render: 'bg-lime-500'
};

interface DashboardProps {
  jobs: MediaJob[];
  jobPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  serverNowMs: number | null;
  onJobContextMenu: (event: React.MouseEvent, job: MediaJob) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onSearch: () => void;
  selectedStatuses: string[];
  onStatusChange: (statuses: string[]) => void;
  selectedPipelineTypes: string[];
  onPipelineTypeChange: (types: string[]) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  jobs,
  jobPage,
  totalPages,
  onPageChange,
  serverNowMs,
  onJobContextMenu,
  search,
  onSearchChange,
  onSearch,
  selectedStatuses,
  onStatusChange,
  selectedPipelineTypes,
  onPipelineTypeChange
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isPipelineOpen, setIsPipelineOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const statusContainerRef = useRef<HTMLDivElement>(null);
  const pipelineContainerRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<{ serverMs: number; clientMs: number } | null>(null);

  // Close search when clicking outside
  useEffect(() => {
    if (!isSearchOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSearchOpen]);

  // Close status dropdown when clicking outside
  useEffect(() => {
    if (!isStatusOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (statusContainerRef.current && !statusContainerRef.current.contains(event.target as Node)) {
        setIsStatusOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isStatusOpen]);

  // Close pipeline dropdown when clicking outside
  useEffect(() => {
    if (!isPipelineOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (pipelineContainerRef.current && !pipelineContainerRef.current.contains(event.target as Node)) {
        setIsPipelineOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isPipelineOpen]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const needsTickRef = useRef(false);

  useEffect(() => {
    if (typeof serverNowMs !== 'number' || !Number.isFinite(serverNowMs)) return;
    baseRef.current = { serverMs: serverNowMs, clientMs: Date.now() };
    setNowMs(serverNowMs);
  }, [serverNowMs]);

  const clampedJobPage = Math.min(Math.max(1, jobPage), totalPages);
  // Jobs are already paginated from server
  const pageJobs = jobs;

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
      className="p-4 md:p-8"
    >
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-2">
        <div className="p-2 md:p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl">
          <div className="flex items-center gap-1.5 md:gap-2 mb-2 md:mb-3">
            <div className="p-1 md:p-1.5 bg-blue-500/10 text-blue-400 rounded-lg"><RefreshCw size={14} className="md:size-4" /></div>
            <h3 className="text-xs md:text-sm font-semibold text-zinc-200 truncate">Throughput</h3>
          </div>
          <div className="text-lg md:text-2xl font-bold text-zinc-100 mb-0.5 md:mb-1">--</div>
          <p className="text-[9px] md:text-[11px] text-zinc-500 truncate">No telemetry</p>
        </div>
        <div className="p-2 md:p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl">
          <div className="flex items-center gap-1.5 md:gap-2 mb-2 md:mb-3">
            <div className="p-1 md:p-1.5 bg-lime-500/10 text-lime-400 rounded-lg"><CheckCircle2 size={14} className="md:size-4" /></div>
            <h3 className="text-xs md:text-sm font-semibold text-zinc-200 truncate">Success Rate</h3>
          </div>
          <div className="text-lg md:text-2xl font-bold text-zinc-100 mb-0.5 md:mb-1">{successRate !== null ? `${successRate}%` : '--'}</div>
          <p className="text-[9px] md:text-[11px] text-zinc-500 truncate">{completedJobCount} done, {failedJobCount} fail</p>
        </div>
        <div className="p-2 md:p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl">
          <div className="flex items-center gap-1.5 md:gap-2 mb-2 md:mb-3">
            <div className="p-1 md:p-1.5 bg-amber-500/10 text-amber-400 rounded-lg"><Clock size={14} className="md:size-4" /></div>
            <h3 className="text-xs md:text-sm font-semibold text-zinc-200 truncate">Queue Time</h3>
          </div>
          <div className="text-lg md:text-2xl font-bold text-zinc-100 mb-0.5 md:mb-1">--</div>
          <p className="text-[9px] md:text-[11px] text-zinc-500 truncate">No telemetry</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-zinc-500 mb-2">
        {/* Search */}
        <div ref={searchContainerRef} className="flex items-center gap-2">
          {isSearchOpen ? (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 'auto', opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              className="flex items-center gap-2 h-7"
            >
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') onSearch();
                  if (e.key === 'Escape') {
                    setIsSearchOpen(false);
                  }
                }}
                placeholder="Search jobs..."
                className="px-3 h-full bg-zinc-900 border border-zinc-700 rounded-md text-zinc-300 text-sm w-48 sm:w-64 focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600 leading-none"
                autoFocus
              />
              <button
                onClick={() => {
                  if (search) {
                    onSearchChange('');
                    onSearch();
                  }
                  setIsSearchOpen(false);
                }}
                className="h-7 w-7 flex items-center justify-center text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded-md transition-colors"
                title="Close search"
              >
                <X size={16} />
              </button>
            </motion.div>
          ) : (
            <button
              onClick={() => {
                setIsSearchOpen(true);
                // Focus input after animation
                setTimeout(() => searchInputRef.current?.focus(), 100);
              }}
              className={`h-7 w-7 flex items-center justify-center rounded-md transition-colors ${
                search 
                  ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10' 
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
              }`}
              title="Search jobs"
            >
              <Search size={18} />
            </button>
          )}
          {search && !isSearchOpen && (
            <span className="text-zinc-400 text-sm">"{search}"</span>
          )}
        </div>

        {/* Pagination with Status Filter */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Status Filter */}
          <div ref={statusContainerRef} className="relative flex items-center">
            <button
              onClick={() => setIsStatusOpen(!isStatusOpen)}
              className={`h-7 px-2 flex items-center gap-1.5 rounded-md text-xs sm:text-sm transition-colors border ${
                selectedStatuses.length > 0
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20'
                  : 'bg-zinc-900/50 border-zinc-700 text-zinc-400 hover:text-zinc-300 hover:border-zinc-600'
              }`}
              title="Filter by status"
            >
              <Filter size={14} />
              <span className="hidden sm:inline max-w-[150px] truncate">
                {selectedStatuses.length > 0
                  ? selectedStatuses.map(s => s.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())).join(', ')
                  : 'Status: All'}
              </span>
              <span className="sm:hidden">
                {selectedStatuses.length > 0
                  ? selectedStatuses.length <= 1
                    ? selectedStatuses[0].slice(0, 6)
                    : `${selectedStatuses.length}`
                  : 'All'}
              </span>
              <ChevronDown size={14} className={`transition-transform ${isStatusOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isStatusOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute z-50 mt-1 top-8 right-0 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[140px]"
              >
                {JOB_STATUSES.map(status => (
                  <label
                    key={status}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/50 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedStatuses.includes(status)}
                      onChange={() => {
                        const newStatuses = selectedStatuses.includes(status)
                          ? selectedStatuses.filter(s => s !== status)
                          : [...selectedStatuses, status];
                        onStatusChange(newStatuses);
                      }}
                      className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="capitalize text-zinc-300">{status.replace('_', ' ')}</span>
                  </label>
                ))}
              </motion.div>
            )}
          </div>

          {/* Pipeline Filter */}
          <div ref={pipelineContainerRef} className="relative flex items-center">
            <button
              onClick={() => setIsPipelineOpen(!isPipelineOpen)}
              className={`h-7 px-2 flex items-center gap-1.5 rounded-md text-xs sm:text-sm transition-colors border ${
                selectedPipelineTypes.length > 0
                  ? 'bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20'
                  : 'bg-zinc-900/50 border-zinc-700 text-zinc-400 hover:text-zinc-300 hover:border-zinc-600'
              }`}
              title="Filter by pipeline type"
            >
              <Filter size={14} />
              <span className="hidden sm:inline max-w-[120px] truncate">
                {selectedPipelineTypes.length > 0
                  ? selectedPipelineTypes.map(t => t.charAt(0).toUpperCase() + t.slice(1)).join(', ')
                  : 'Pipeline: All'}
              </span>
              <span className="sm:hidden">
                {selectedPipelineTypes.length > 0
                  ? selectedPipelineTypes.length <= 1
                    ? selectedPipelineTypes[0].slice(0, 4)
                    : `${selectedPipelineTypes.length}`
                  : 'Pipeline'}
              </span>
              <ChevronDown size={14} className={`transition-transform ${isPipelineOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isPipelineOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute z-50 mt-1 top-8 right-0 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[120px]"
              >
                {PIPELINE_TYPES.map(type => (
                  <label
                    key={type}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/50 cursor-pointer text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedPipelineTypes.includes(type)}
                      onChange={() => {
                        const newTypes = selectedPipelineTypes.includes(type)
                          ? selectedPipelineTypes.filter(t => t !== type)
                          : [...selectedPipelineTypes, type];
                        onPipelineTypeChange(newTypes);
                      }}
                      className="rounded border-zinc-600 bg-zinc-800 text-blue-500 focus:ring-0 focus:ring-offset-0"
                    />
                    <span className="capitalize text-zinc-300">{type}</span>
                  </label>
                ))}
              </motion.div>
            )}
          </div>

          <span className="hidden sm:inline">
            Page {clampedJobPage} of {totalPages}
          </span>
          <span className="sm:hidden">
            {clampedJobPage}/{totalPages}
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
      </div>

      {/* Job List Table */}
      <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[600px] sm:min-w-[800px]">
            <div className="grid grid-cols-[24px_70px_minmax(0,1fr)_100px_90px_90px_70px] sm:grid-cols-[28px_130px_minmax(0,1fr)_130px_120px_110px_80px] gap-2 sm:gap-4 px-3 sm:px-4 py-3 bg-zinc-900/50 border-b border-zinc-800 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
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
        </div>
      </div>
    </motion.div>
  );
};
