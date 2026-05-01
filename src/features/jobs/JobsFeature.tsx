import React, { Suspense, forwardRef, lazy, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { MediaJob } from '../../types';
import { JobLogModal } from './JobLogModal';
import { JobContextMenu } from './JobContextMenu';

const LazyDashboard = lazy(() =>
  import('../dashboard/Dashboard').then(module => ({ default: module.Dashboard }))
);
const LazyLogsPanel = lazy(() =>
  import('../logs/LogsPanel').then(module => ({ default: module.LogsPanel }))
);

export type JobsHandle = {
  reloadJobs: () => Promise<void>;
};

type JobContextMenuState = {
  open: boolean;
  x: number;
  y: number;
  jobId: string | null;
};

export type JobsFeatureProps = {
  activeTab: string;
  formatLocalDateTime: (value?: string) => string;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
  vaultFolders: Array<{ id: string; name: string; files: Array<{ id: string }> }>;
  setVaultFolderId: (id: string | null) => void;
  setVaultFileId: (id: string | null) => void;
  setShowFolderPanel: (open: boolean) => void;
  openRunPipelineFromJob: (job: MediaJob) => void;
  onJobOutputsCompleted: () => void;
};

export const JobsFeature = forwardRef<JobsHandle, JobsFeatureProps>(function JobsFeature(
  {
    activeTab,
    formatLocalDateTime,
    showToast,
    vaultFolders,
    setVaultFolderId,
    setVaultFileId,
    setShowFolderPanel,
    openRunPipelineFromJob,
    onJobOutputsCompleted
  },
  ref
) {
  const [jobs, setJobs] = useState<MediaJob[]>([]);
  const [jobServerNowMs, setJobServerNowMs] = useState<number | null>(null);
  const previousJobsRef = useRef<MediaJob[]>([]);
  const [jobPage, setJobPage] = useState(1);
  const [totalJobs, setTotalJobs] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [jobSearch, setJobSearch] = useState('');
  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedPipelineTypes, setSelectedPipelineTypes] = useState<string[]>([]);
  const JOBS_PER_PAGE = 10;
  const [jobLogOpen, setJobLogOpen] = useState(false);
  const [jobLogJobId, setJobLogJobId] = useState<string | null>(null);
  const [jobContextMenu, setJobContextMenu] = useState<JobContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    jobId: null
  });

  const loadJobs = useCallback(async (page?: number, search?: string, statuses?: string[], pipelineTypes?: string[]) => {
    try {
      const targetPage = page ?? jobPage;
      const searchParam = search ?? jobSearch;
      const statusParam = statuses ?? selectedStatuses;
      const pipelineParam = pipelineTypes ?? selectedPipelineTypes;
      const searchQuery = searchParam ? `&search=${encodeURIComponent(searchParam)}` : '';
      const statusQuery = statusParam.length > 0 ? `&status=${statusParam.join(',')}` : '';
      const pipelineQuery = pipelineParam.length > 0 ? `&pipeline=${pipelineParam.join(',')}` : '';
      const response = await fetch(`/api/jobs?page=${targetPage}&limit=${JOBS_PER_PAGE}${searchQuery}${statusQuery}${pipelineQuery}`);
      if (!response.ok) return;
      const data = await response.json() as { jobs: MediaJob[]; total: number; totalPages: number; now?: string };
      setJobs(data.jobs ?? []);
      setTotalJobs(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      if (data.now) {
        const serverMs = new Date(data.now).getTime();
        if (Number.isFinite(serverMs)) setJobServerNowMs(serverMs);
      }
    } catch {
      return;
    }
  }, [jobPage, jobSearch, selectedStatuses, selectedPipelineTypes]);

  useImperativeHandle(ref, () => ({
    reloadJobs: () => loadJobs()
  }), [loadJobs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    loadJobs();
    const interval = window.setInterval(() => loadJobs(), 3000);
    return () => window.clearInterval(interval);
  }, [loadJobs]);

  useEffect(() => {
    if (jobPage > totalPages) setJobPage(totalPages);
  }, [jobPage, totalPages]);

  // Debounced realtime search
  useEffect(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(() => {
      setJobPage(1);
      loadJobs(1, jobSearch);
    }, 300);
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }
    };
  }, [jobSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  // Status filter change effect
  useEffect(() => {
    setJobPage(1);
    loadJobs(1, jobSearch, selectedStatuses, selectedPipelineTypes);
  }, [selectedStatuses]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pipeline filter change effect
  useEffect(() => {
    setJobPage(1);
    loadJobs(1, jobSearch, selectedStatuses, selectedPipelineTypes);
  }, [selectedPipelineTypes]); // eslint-disable-line react-hooks/exhaustive-deps

  const cancelJob = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as any).error || 'Unable to cancel job');
      }
      await loadJobs();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to cancel job';
      showToast(message, 'error');
    }
  }, [loadJobs, showToast]);

  const deleteJob = useCallback(async (jobId: string) => {
    try {
      const response = await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error((data as any).error || 'Unable to delete job');
      }
      await loadJobs();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to delete job';
      showToast(message, 'error');
    }
  }, [loadJobs, showToast]);

  useEffect(() => {
    const previousJobs = previousJobsRef.current;
    if (previousJobs.length === 0) {
      previousJobsRef.current = jobs;
      return;
    }
    const previousStatus = new Map(previousJobs.map(job => [job.id, job.status]));
    const outputCompleted = jobs.some(job => {
      const was = previousStatus.get(job.id);
      if (was === job.status) return false;
      if (job.status !== 'completed') return false;
      return job.tasks?.some(task => task.type === 'uvr' || task.type === 'tts') ?? false;
    });
    if (outputCompleted) onJobOutputsCompleted();
    previousJobsRef.current = jobs;
  }, [jobs, onJobOutputsCompleted]);

  const jobLogTarget = useMemo(() => {
    const activeJob =
      jobs.find(job => job.status === 'processing') ??
      jobs.find(job => job.status === 'queued') ??
      null;
    return jobs.find(job => job.id === jobLogJobId) ?? activeJob;
  }, [jobs, jobLogJobId]);

  const jobContextTarget = useMemo(() => {
    return jobs.find(job => job.id === jobContextMenu.jobId) ?? null;
  }, [jobs, jobContextMenu.jobId]);

  const openJobContextMenu = useCallback((event: React.MouseEvent | React.TouchEvent, targetJob: MediaJob) => {
    event.preventDefault();
    
    let clientX = 0;
    let clientY = 0;
    
    if ('clientX' in event) {
      clientX = event.clientX;
      clientY = event.clientY;
    } else if ('touches' in event && event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    }

    setJobContextMenu({
      open: true,
      x: clientX,
      y: clientY,
      jobId: targetJob.id
    });
  }, []);

  const copyJobLogContent = useCallback(async (content: string) => {
    const fallbackCopy = () => {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = content;
        textarea.setAttribute('readonly', 'true');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(textarea);
        return ok;
      } catch {
        return false;
      }
    };

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content);
        showToast('Log copied', 'success');
        return;
      }
      const ok = fallbackCopy();
      showToast(ok ? 'Log copied' : 'Unable to copy log', ok ? 'success' : 'error');
    } catch {
      const ok = fallbackCopy();
      showToast(ok ? 'Log copied' : 'Unable to copy log', ok ? 'success' : 'error');
    }
  }, [showToast]);

  const showDashboard = activeTab === 'dashboard';
  const showLogs = activeTab === 'logs';

  return (
    <>
      {showDashboard && (
        <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Loading dashboard...</div>}>
          <LazyDashboard
            jobs={jobs}
            jobPage={jobPage}
            totalPages={totalPages}
            onPageChange={(page) => {
              setJobPage(page);
              loadJobs(page);
            }}
            serverNowMs={jobServerNowMs}
            onJobContextMenu={openJobContextMenu}
            search={jobSearch}
            onSearchChange={setJobSearch}
            onSearch={() => {
              setJobPage(1);
              loadJobs(1, jobSearch);
            }}
            selectedStatuses={selectedStatuses}
            onStatusChange={setSelectedStatuses}
            selectedPipelineTypes={selectedPipelineTypes}
            onPipelineTypeChange={setSelectedPipelineTypes}
          />
        </Suspense>
      )}

      {showLogs && (
        <Suspense fallback={<div className="p-8 text-sm text-zinc-500">Loading logs...</div>}>
          <LazyLogsPanel jobs={jobs} formatLocalDateTime={formatLocalDateTime} />
        </Suspense>
      )}

      <JobLogModal
        open={jobLogOpen}
        job={jobLogTarget}
        onClose={() => setJobLogOpen(false)}
        onCopy={copyJobLogContent}
      />

      <JobContextMenu
        menu={jobContextMenu}
        job={jobContextTarget}
        setMenu={setJobContextMenu}
        vaultFolders={vaultFolders}
        showToast={showToast}
        setVaultFolderId={setVaultFolderId}
        setVaultFileId={setVaultFileId}
        setShowFolderPanel={setShowFolderPanel}
        openRunPipelineFromJob={openRunPipelineFromJob}
        openJobLog={(id) => {
          setJobLogJobId(id);
          setJobLogOpen(true);
        }}
        cancelJob={cancelJob}
        deleteJob={deleteJob}
      />
    </>
  );
});
