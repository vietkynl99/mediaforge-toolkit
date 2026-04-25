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
  const [jobLogOpen, setJobLogOpen] = useState(false);
  const [jobLogJobId, setJobLogJobId] = useState<string | null>(null);
  const [jobContextMenu, setJobContextMenu] = useState<JobContextMenuState>({
    open: false,
    x: 0,
    y: 0,
    jobId: null
  });

  const loadJobs = useCallback(async () => {
    try {
      const response = await fetch('/api/jobs');
      if (!response.ok) return;
      const data = await response.json() as { jobs: MediaJob[]; now?: string };
      setJobs(data.jobs ?? []);
      if (data.now) {
        const serverMs = new Date(data.now).getTime();
        if (Number.isFinite(serverMs)) setJobServerNowMs(serverMs);
      }
    } catch {
      return;
    }
  }, []);

  useImperativeHandle(ref, () => ({
    reloadJobs: loadJobs
  }), [loadJobs]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    loadJobs();
    const interval = window.setInterval(loadJobs, 3000);
    return () => window.clearInterval(interval);
  }, [loadJobs]);

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(jobs.length / 10));
    if (jobPage > totalPages) setJobPage(totalPages);
  }, [jobs.length, jobPage]);

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
      return job.tasks.some(task => task.type === 'uvr' || task.type === 'tts');
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

  const openJobContextMenu = useCallback((event: React.MouseEvent, targetJob: MediaJob) => {
    event.preventDefault();
    setJobContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
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
            onPageChange={setJobPage}
            serverNowMs={jobServerNowMs}
            onJobContextMenu={openJobContextMenu}
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
