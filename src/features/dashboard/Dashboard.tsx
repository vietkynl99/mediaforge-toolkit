import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { RefreshCw, CheckCircle2, Clock, Search, X, ChevronDown, Filter, Zap, Activity, Cpu, Gauge, HardDrive } from 'lucide-react';
import { MediaJob, JobStatus } from '../../types';
import { JobRow } from '../jobs/JobRow';
import type { ServerStats } from '../jobs/JobsFeature';

const JOB_STATUSES: JobStatus[] = ['queued', 'processing', 'awaiting_input', 'completed', 'failed', 'cancelled'];

const STATUS_COLORS: Record<JobStatus, string> = {
  queued: 'bg-zinc-500',
  processing: 'bg-blue-500',
  awaiting_input: 'bg-amber-500',
  completed: 'bg-lime-500',
  failed: 'bg-red-500',
  cancelled: 'bg-zinc-600'
};

const PIPELINE_TYPES = ['download', 'uvr', 'tts', 'render'] as const;

const PIPELINE_COLORS: Record<string, string> = {
  download: 'bg-blue-500',
  uvr: 'bg-purple-500',
  tts: 'bg-pink-500',
  render: 'bg-lime-500'
};

interface DashboardProps {
  jobs: MediaJob[];
  serverStats: ServerStats | null;
  jobPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  serverNowMs: number | null;
  onJobContextMenu: (event: React.MouseEvent | React.TouchEvent, job: MediaJob) => void;
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
  serverStats,
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

  // --- Use stats from API (real server data) instead of calculating from paginated jobs ---
  const systemHealth = serverStats?.systemHealth;
  const efficiency = serverStats?.efficiency;
  const workload = serverStats?.workload;
  
  const formatDurationSimple = (ms: number) => {
    if (ms <= 0) return '--';
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60;
    return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
  };

  return (
    <motion.div 
      key="dashboard"
      initial={false}
      animate={false as any}
      exit={false as any}
      className="p-2 md:p-8"
    >
      {/* Quick Stats Grid */}
      <div className="grid grid-cols-3 gap-2 md:gap-4 mb-3">
        {/* System Health */}
        <div className="p-2 md:p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl">
          <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 mb-1 md:mb-3">
            <div className="w-fit p-1 md:p-1.5 bg-blue-500/10 text-blue-400 rounded-lg"><Cpu size={12} className="md:size-4" /></div>
            <h3 className="text-[10px] md:text-sm font-semibold text-zinc-200 truncate">System Health</h3>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <span className="text-[8px] md:text-[11px] text-zinc-500">CPU</span>
              <span className="text-xs md:text-sm font-bold text-zinc-100">{systemHealth?.cpu?.usage ?? 0}%</span>
            </div>
            <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all ${ 
                  (systemHealth?.cpu?.usage ?? 0) > 80 ? 'bg-red-500' : 
                  (systemHealth?.cpu?.usage ?? 0) > 60 ? 'bg-amber-500' : 'bg-blue-500'
                }`}
                style={{ width: `${systemHealth?.cpu?.usage ?? 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-[8px] md:text-[11px] text-zinc-500">RAM</span>
              <span className="text-xs md:text-sm font-bold text-zinc-100">{systemHealth?.memory?.usedPercent ?? 0}%</span>
            </div>
            <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all ${
                  (systemHealth?.memory?.usedPercent ?? 0) > 80 ? 'bg-red-500' : 
                  (systemHealth?.memory?.usedPercent ?? 0) > 60 ? 'bg-amber-500' : 'bg-lime-500'
                }`}
                style={{ width: `${systemHealth?.memory?.usedPercent ?? 0}%` }}
              />
            </div>
            <p className="text-[8px] md:text-[11px] text-zinc-500 truncate mt-1">
              {systemHealth?.memory?.usedGB ?? 0}/{systemHealth?.memory?.totalGB ?? 0} GB • {systemHealth?.cpu?.cores ?? 0} cores
            </p>
          </div>
        </div>

        {/* Processing Efficiency */}
        <div className="p-2 md:p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl">
          <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 mb-1 md:mb-3">
            <div className="w-fit p-1 md:p-1.5 bg-lime-500/10 text-lime-400 rounded-lg"><Gauge size={12} className="md:size-4" /></div>
            <h3 className="text-[10px] md:text-sm font-semibold text-zinc-200 truncate">Efficiency</h3>
          </div>
          <div className="text-base md:text-2xl font-bold text-zinc-100 mb-0.5 md:mb-1">{formatDurationSimple(efficiency?.avgDurationMs ?? 0)}</div>
          <p className="text-[8px] md:text-[11px] text-zinc-500 truncate">Avg. job duration</p>
        </div>

        {/* Active Workload */}
        <div className="p-2 md:p-4 bg-zinc-900/30 border border-zinc-800 rounded-xl">
          <div className="flex flex-col md:flex-row md:items-center gap-1 md:gap-2 mb-1 md:mb-3">
            <div className="w-fit p-1 md:p-1.5 bg-amber-500/10 text-amber-400 rounded-lg"><Activity size={12} className="md:size-4" /></div>
            <h3 className="text-[10px] md:text-sm font-semibold text-zinc-200 truncate">Workload</h3>
          </div>
          <div className="text-base md:text-2xl font-bold text-zinc-100 mb-0.5 md:mb-1">{workload?.activeJobs ?? 0} Running</div>
          <p className="text-[8px] md:text-[11px] text-zinc-500 truncate">{workload?.queuedJobs ?? 0} jobs in queue</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-zinc-500 mb-3">
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
                className="px-2 h-full bg-zinc-900 border border-zinc-700 rounded-md text-zinc-300 text-[11px] md:text-sm w-32 sm:w-64 focus:outline-none focus:border-zinc-500 placeholder:text-zinc-600 leading-none"
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
                <X size={14} />
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
              <Search size={16} />
            </button>
          )}
          {search && !isSearchOpen && (
            <div className="flex items-center gap-1">
              <span className="text-zinc-400 text-sm">"{search}"</span>
              <button
                onClick={() => {
                  onSearchChange('');
                  onSearch();
                }}
                className="h-5 w-5 flex items-center justify-center text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 rounded transition-colors"
                title="Clear search"
              >
                <X size={14} />
              </button>
            </div>
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
                className="absolute z-50 mt-1 top-8 right-0 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1 min-w-[160px] whitespace-nowrap"
              >
                {JOB_STATUSES.map(status => (
                  <label
                    key={status}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/50 cursor-pointer text-sm"
                  >
                    <div className="relative flex items-center justify-center w-4 h-4 shrink-0 overflow-hidden">
                      <input
                        type="checkbox"
                        checked={selectedStatuses.includes(status)}
                        onChange={() => {
                          const newStatuses = selectedStatuses.includes(status)
                            ? selectedStatuses.filter(s => s !== status)
                            : [...selectedStatuses, status];
                          onStatusChange(newStatuses);
                        }}
                        className="peer absolute inset-0 w-full h-full !appearance-none checked:!bg-blue-500 rounded border border-zinc-600 bg-zinc-800 focus:ring-0 focus:ring-offset-0 transition-colors cursor-pointer z-10"
                      />
                      <svg 
                        className="relative w-2.5 h-2.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity z-20" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor" 
                        strokeWidth={4}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
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
                  : 'All'}
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
                    <div className="relative flex items-center justify-center w-4 h-4 shrink-0 overflow-hidden">
                      <input
                        type="checkbox"
                        checked={selectedPipelineTypes.includes(type)}
                        onChange={() => {
                          const newTypes = selectedPipelineTypes.includes(type)
                            ? selectedPipelineTypes.filter(t => t !== type)
                            : [...selectedPipelineTypes, type];
                          onPipelineTypeChange(newTypes);
                        }}
                        className="peer absolute inset-0 w-full h-full !appearance-none checked:!bg-blue-500 rounded border border-zinc-600 bg-zinc-800 focus:ring-0 focus:ring-offset-0 transition-colors cursor-pointer z-10"
                      />
                      <svg 
                        className="relative w-2.5 h-2.5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity z-20" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor" 
                        strokeWidth={4}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
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
          <div className="flex items-center gap-1.5">
          <button
            onClick={() => onPageChange(Math.max(1, clampedJobPage - 1))}
            disabled={clampedJobPage === 1}
            className="px-1.5 py-1 border border-zinc-800 rounded-md text-[10px] md:text-xs text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Prev
          </button>
          <button
            onClick={() => onPageChange(clampedJobPage + 1)}
            disabled={clampedJobPage >= totalPages}
            className="px-1.5 py-1 border border-zinc-800 rounded-md text-[10px] md:text-xs text-zinc-400 hover:text-zinc-100 hover:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
          </div>
        </div>
      </div>

      {/* Job List Table */}
      <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[680px] sm:min-w-[800px]">
            <div className="grid grid-cols-[24px_70px_minmax(150px,1fr)_100px_90px_90px_70px] sm:grid-cols-[28px_130px_minmax(0,1fr)_130px_120px_110px_80px] gap-2 sm:gap-4 px-3 sm:px-4 py-3 bg-zinc-900/50 border-b border-zinc-800 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
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
