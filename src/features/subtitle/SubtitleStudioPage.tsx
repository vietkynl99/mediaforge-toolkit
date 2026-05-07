import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Search, CopyCheck, CopyX, Languages, Sparkles, Download, Trash2, Settings,
  X, Eye, EyeOff, ChevronRight, ChevronLeft, History, AlertTriangle, CheckCircle,
  Wrench, Menu, Bell, Filter, FileText, Wand2, PanelRightOpen, PanelRightClose,
  Folder, File, Upload, Type, RefreshCw
} from 'lucide-react';
import {
  parseSRT, parseSktProject, parseCapCutDraft, generateSktProject, analyzeSegments,
  performLocalFix, generateSRT, timeToSeconds, parseFileName, generateExportFileName,
  calculateCPS
} from './services/subtitleLogic';
import { translateBatch, analyzeTranslationStyle } from './services/geminiService';
import { splitToTwoLinesIfLong } from '../../../shared/text-utils.js';
import { SubtitleSegment, TranslationPreset, SubtitleAppSettings, ApiUsage, DEFAULT_SUBTITLE_SETTINGS, SubtitleStatus, AnalysisResult } from './types';
import { Layout } from './components/Layout';
import { SegmentList } from './components/SegmentList';
import { AnalyzerPanel } from './components/AnalyzerPanel';
import { PresetPage } from './components/PresetPage';
import { ConfirmModal } from '../../components/ConfirmModal';
import { vaultService } from '../../services/vault';
import { VaultFolder, VaultFile, VaultStatus } from '../../types/vault';

const INITIAL_USAGE: ApiUsage = { style: { requests: 0, tokens: 0 }, translate: { requests: 0, tokens: 0, segments: 0 }, optimize: { requests: 0, tokens: 0 } };

const STATUS_COLORS: Record<VaultStatus, string> = {
  'todo': 'bg-zinc-500',
  'in progress': 'bg-blue-500',
  'done': 'bg-lime-500',
  'closed': 'bg-red-500',
  'error': 'bg-red-600',
};

const STATUS_LABELS: Record<VaultStatus, string> = {
  'todo': 'Todo',
  'in progress': 'In Progress',
  'done': 'Done',
  'closed': 'Closed',
  'error': 'Error',
};
const EDITOR_PAGE_SIZE = 25;

interface SubtitleStudioPageProps {
  initialFile?: File | null;
  humorLevel?: number;
  onBack?: () => void;
  onOpenSettings?: () => void;
  vaultFolders?: VaultFolder[];
  vaultLoading?: boolean;
}

const SubtitleStudioPage: React.FC<SubtitleStudioPageProps> = ({ 
  initialFile, 
  humorLevel = 10, 
  onBack, 
  onOpenSettings,
  vaultFolders = [], 
  vaultLoading: parentVaultLoading = false 
}) => {
  // State
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [workingFilePath, setWorkingFilePath] = useState<string | null>(null); // Actual file path for jobs (may differ from selectedFile if .srt was converted)
  const [fileLoading, setFileLoading] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState<{ open: boolean; srtFile: VaultFile | null; sktProjectPath: string; existingSktProject: VaultFile | null }>({ open: false, srtFile: null, sktProjectPath: '', existingSktProject: null });
  const [deeplinkPending, setDeeplinkPending] = useState<boolean>(() => {
    // Check if there's a deeplink in URL on initial mount
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return Boolean(params.get('folderId') && params.get('fileId'));
  });
  const [status, setStatus] = useState<SubtitleStatus>('idle');
  const [progress, setProgress] = useState<number>(0);
  const [segments, setSegments] = useState<SubtitleSegment[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [settings, setSettings] = useState<SubtitleAppSettings>(DEFAULT_SUBTITLE_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState<boolean>(false);
  const [optimizeHistorySegmentId, setOptimizeHistorySegmentId] = useState<number | null>(null);
  const [optimizeHistoryIndex, setOptimizeHistoryIndex] = useState<number>(0);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings/concurrency');
        if (response.ok) {
          const data = await response.json();
          if (data.ai) {
            setSettings(prev => ({
              ...prev,
              provider: data.ai.provider || 'gemini',
              // Legacy fields
              aiModel: data.ai.model || data.ai.geminiModel,
              apiKey: data.ai.apiKey || data.ai.geminiApiKey,
              // Gemini settings
              geminiModel: data.ai.geminiModel || data.ai.model,
              geminiApiKey: data.ai.geminiApiKey || data.ai.apiKey,
              // OpenRouter settings
              openrouterModel: data.ai.openrouterModel || 'openrouter/auto',
              openrouterApiKey: data.ai.openrouterApiKey || '',
              // Common settings
              translationBatchSize: data.ai.translationBatchSize || 20,
              maxSingleLineWords: data.ai.maxSingleLineWords || 12,
              autoSplitLongLines: data.ai.autoSplitLongLines || false
            }));
            setSettingsLoaded(true);
          }
        }
      } catch (err) {
        console.error('Failed to fetch AI settings:', err);
      }
    };
    fetchSettings();
  }, []);

  // Reload settings when page becomes visible (e.g., returning from settings page)
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings/concurrency');
        if (response.ok) {
          const data = await response.json();
          if (data.ai) {
            setSettings(prev => ({
              ...prev,
              provider: data.ai.provider || 'gemini',
              aiModel: data.ai.model || data.ai.geminiModel,
              apiKey: data.ai.apiKey || data.ai.geminiApiKey,
              geminiModel: data.ai.geminiModel || data.ai.model,
              geminiApiKey: data.ai.geminiApiKey || data.ai.apiKey,
              openrouterModel: data.ai.openrouterModel || 'openrouter/auto',
              openrouterApiKey: data.ai.openrouterApiKey || '',
              translationBatchSize: data.ai.translationBatchSize || 20,
              maxSingleLineWords: data.ai.maxSingleLineWords || 12,
              autoSplitLongLines: data.ai.autoSplitLongLines || false
            }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch AI settings:', err);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchSettings();
      }
    };

    const handleFocus = () => {
      fetchSettings();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  useEffect(() => {
    // Only save after settings have been loaded from server
    if (!settingsLoaded) return;
    
    const saveSettings = async () => {
      try {
        await fetch('/api/settings/concurrency', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ai: {
              provider: settings.provider,
              // Legacy fields
              model: settings.geminiModel || settings.aiModel,
              apiKey: settings.geminiApiKey || settings.apiKey,
              // Gemini settings
              geminiModel: settings.geminiModel,
              geminiApiKey: settings.geminiApiKey,
              // OpenRouter settings
              openrouterModel: settings.openrouterModel,
              openrouterApiKey: settings.openrouterApiKey,
              // Common settings
              translationBatchSize: settings.translationBatchSize,
              maxSingleLineWords: settings.maxSingleLineWords,
              autoSplitLongLines: settings.autoSplitLongLines
            }
          }),
        });
      } catch (err) {
        console.error('Failed to save AI settings:', err);
      }
    };
    saveSettings();
  }, [settings.provider, settings.geminiModel, settings.geminiApiKey, settings.openrouterModel, settings.openrouterApiKey, settings.translationBatchSize, settings.maxSingleLineWords, settings.autoSplitLongLines, settingsLoaded]);

  const [showTranslationStylePopup, setShowTranslationStylePopup] = useState<boolean>(false);
  const [isPresetLoading, setIsPresetLoading] = useState<boolean>(false);
  const [presetDraftSummary, setPresetDraftSummary] = useState<string>('');
  const [showToastHistory, setShowToastHistory] = useState<boolean>(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch('/api/settings/concurrency');
        if (response.ok) {
          const data = await response.json();
          if (data.ai) {
            setSettings(prev => ({
              ...prev,
              provider: data.ai.provider || 'gemini',
              // Legacy fields
              aiModel: data.ai.model || data.ai.geminiModel,
              apiKey: data.ai.apiKey || data.ai.geminiApiKey,
              // Gemini settings
              geminiModel: data.ai.geminiModel || data.ai.model,
              geminiApiKey: data.ai.geminiApiKey || data.ai.apiKey,
              // OpenRouter settings
              openrouterModel: data.ai.openrouterModel || 'openrouter/auto',
              openrouterApiKey: data.ai.openrouterApiKey || '',
              // Common settings
              translationBatchSize: data.ai.translationBatchSize || 20,
              maxSingleLineWords: data.ai.maxSingleLineWords || 12,
              autoSplitLongLines: data.ai.autoSplitLongLines || false
            }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch AI settings:', err);
      }
    };

    if (showTranslationStylePopup) {
      fetchSettings();
    }
  }, [showTranslationStylePopup]);

  const [fileName, setFileName] = useState<string>('');
  const [baseFileName, setBaseFileName] = useState<string>('');
  const [editedCount, setEditedCount] = useState<number>(0);
  const [filter, setFilter] = useState<string>('all');
  
  // Keep filterRef in sync with filter state
  useEffect(() => {
    filterRef.current = filter;
  }, [filter]);
  const [folderQuery, setFolderQuery] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isPageEditing, setIsPageEditing] = useState<boolean>(false);
  const [pageInputValue, setPageInputValue] = useState<string>('1');
  const [showClearModal, setShowClearModal] = useState<boolean>(false);
  const [showCloseConfirmModal, setShowCloseConfirmModal] = useState<boolean>(false);
  const [showExportModal, setShowExportModal] = useState<boolean>(false);
  const [showRemoveQuotesModal, setShowRemoveQuotesModal] = useState<boolean>(false);
  const [showQualityDashboard, setShowQualityDashboard] = useState<boolean>(true);
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [focusSegmentId, setFocusSegmentId] = useState<number | null>(null);

  // Save states
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('subtitle_autosave');
      return saved === null ? false : saved === 'true'; // Default false
    } catch {
      return false;
    }
  });

  const [apiUsage, setApiUsage] = useState<ApiUsage>(INITIAL_USAGE);
  const lastLoadedProgressRef = useRef<number>(0);
  const [translationPreset, setTranslationPreset] = useState<TranslationPreset | null>(() => ({
    reference: { title_or_summary: '' },
    genres: [],
    humor_level: humorLevel
  }));

  const [translationState, setTranslationState] = useState<{
    status: 'idle' | 'running' | 'stopped' | 'error' | 'completed' | 'queued';
    processed: number;
    total: number;
    jobId?: string;
  }>({ status: 'idle', processed: 0, total: 0 });

  const [isStoppingTranslate, setIsStoppingTranslate] = useState<boolean>(false);
  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [isStoppingOptimize, setIsStoppingOptimize] = useState<boolean>(false);
  const [optimizeState, setOptimizeState] = useState<{ processed: number; total: number }>({ processed: 0, total: 0 });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showSearchBox, setShowSearchBox] = useState<boolean>(false);
  const [showReplaceBox, setShowReplaceBox] = useState<boolean>(false);
  const [replaceQuery, setReplaceQuery] = useState<string>('');
  const [searchCaseSensitive, setSearchCaseSensitive] = useState<boolean>(false);
  const [searchWholeWord, setSearchWholeWord] = useState<boolean>(false);
  const [searchRegexMode, setSearchRegexMode] = useState<boolean>(false);

  const [toast, setToast] = useState<{ message: string; visible: boolean; type: 'info' | 'success' | 'warning' | 'error' }>({
    message: '',
    visible: false,
    type: 'info'
  });
  const [toastHistory, setToastHistory] = useState<{ id: number; message: string; type: 'info' | 'success' | 'warning' | 'error'; time: number }[]>([]);

  const settingsRef = useRef(settings);
  const stopRequestedRef = useRef<boolean>(false);
  const optimizeStopRequestedRef = useRef<boolean>(false);
  const undoStackRef = useRef<SubtitleSegment[][]>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentJobIdRef = useRef<string | null>(null);
  const isLoadingFileRef = useRef<boolean>(false);
  const filterRef = useRef<string>(filter);
  const lastReloadTimeRef = useRef<number>(0);
  const isReloadingRef = useRef<boolean>(false);

  const stopRequestedRefCurrent = stopRequestedRef.current;
  const optimizeStopRequestedRefCurrent = optimizeStopRequestedRef.current;

  const selectedFolder = useMemo(() => 
    vaultFolders.find(f => f.id === selectedFolderId), 
    [vaultFolders, selectedFolderId]
  );
  const subtitleFiles = useMemo(() => 
    selectedFolder?.files.filter(f => f.type === 'subtitle') || [], 
    [selectedFolder]
  );

  const handleSelectFile = async (file: VaultFile, options?: { silent?: boolean }) => {
    const isSrtFile = file.relativePath?.toLowerCase().endsWith('.srt');
    
    // If .srt file, check if .sktproject already exists (skip check if silent mode for auto-reload)
    if (isSrtFile && selectedFolder && !options?.silent) {
      const { baseName } = parseFileName(file.name);
      const sktProjectPath = `${selectedFolder.name}/output/${baseName}.sktproject`;
      const existingSktProject = selectedFolder.files.find(f => 
        f.relativePath === sktProjectPath || 
        f.name.toLowerCase() === `${baseName.toLowerCase()}.sktproject`
      );
      
      if (existingSktProject) {
        // Show confirmation modal with the existing .sktproject file info
        setConfirmOverwrite({ open: true, srtFile: file, sktProjectPath, existingSktProject });
        return;
      }
    }
    
    // Proceed with normal file loading
    await proceedWithFileLoad(file, options);
  };

  // Reload the working file (.sktproject) during job polling
  const reloadWorkingFile = async () => {
    if (!workingFilePath) return;
    
    // Prevent concurrent reloads
    if (isReloadingRef.current) return;
    isReloadingRef.current = true;
    isLoadingFileRef.current = true; // Prevent dirty state from being set during reload
    
    try {
      const { segments: parsedSegments } = await vaultService.loadSubtitleFile(workingFilePath);
      const fixedSegments = parsedSegments.map(s => ({
        ...s,
        originalText: performLocalFix(s.originalText || ""),
        translatedText: performLocalFix(s.translatedText || "")
      }));
      
      // Only update segments if we have valid data
      if (fixedSegments.length > 0) {
        setSegments(fixedSegments);
      }
      lastReloadTimeRef.current = Date.now();
    } catch (err) {
      console.error('Failed to reload working file:', err);
    } finally {
      isReloadingRef.current = false;
      isLoadingFileRef.current = false;
    }
  };

  const proceedWithFileLoad = async (file: VaultFile, options?: { silent?: boolean }) => {
    try {
      setFileLoading(true);
      isLoadingFileRef.current = true;

      const { segments: parsedSegments, preset } = await vaultService.loadSubtitleFile(file.relativePath);

      const { baseName, editedCount: count } = parseFileName(file.name);
      setBaseFileName(baseName);
      setEditedCount(count);

      const fixedSegments = parsedSegments.map(s => ({
        ...s,
        originalText: performLocalFix(s.originalText || ""),
        translatedText: performLocalFix(s.translatedText || "")
      }));

      setSegments(fixedSegments);
      undoStackRef.current = [];
      if (preset) {
        setTranslationPreset({ ...preset, humor_level: humorLevel });
      }

      // If file is .srt, auto-create .sktproject and switch to it
      const isSrtFile = file.relativePath?.toLowerCase().endsWith('.srt');
      let workingFilePathValue = file.relativePath || null;
      let workingFileId = file.id;
      let workingFileName = file.name;
      
      if (isSrtFile && selectedFolder) {
        const sktProjectPath = `${selectedFolder.name}/output/${baseName}.sktproject`;
        const content = generateSktProject(fixedSegments, baseName, preset || translationPreset);
        await vaultService.saveSubtitleFile(sktProjectPath, content);
        workingFilePathValue = sktProjectPath;
        workingFileId = sktProjectPath; // Use the full path as fileId for cleaner URL
        workingFileName = `${baseName}.sktproject`;
        
        // Update file name to reflect .sktproject
        setFileName(workingFileName);
        setIsDirty(false);
        setLastSavedAt(new Date());
        
        if (!options?.silent) {
          showToast('success', `Created project file: ${baseName}.sktproject`);
        }
      }
      
      // Set the working file ID and update URL deeplink
      setSelectedFileId(workingFileId);
      setWorkingFilePath(workingFilePathValue);
      if (typeof window !== 'undefined' && selectedFolderId) {
        const params = new URLSearchParams({ folderId: selectedFolderId, fileId: workingFileId });
        window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
      }

      // Only reset translation state if we are NOT in the middle of a job
      setTranslationState(prev => {
        if (prev.status === 'running' || prev.status === 'queued') {
          return prev; // Keep current job status and progress
        }
        return { status: 'idle', processed: 0, total: 0 };
      });

      // Check for running job for this file and restore state if found
      try {
        const jobsRes = await fetch(`/api/jobs?file=${encodeURIComponent(workingFilePathValue || '')}&status=processing,queued&limit=1`);
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json();
          if (jobsData.jobs && jobsData.jobs.length > 0) {
            const runningJob = jobsData.jobs[0];
            const translateTask = runningJob.tasks?.find((t: any) => t.type === 'translate');

            // Restore translation state
            setTranslationState({
              status: runningJob.status === 'processing' ? 'running' : 'queued',
              processed: translateTask?.processed || 0,
              total: translateTask?.total || fixedSegments.filter(s => !s.translatedText).length
            });
            setStatus('processing');
            setProgress(runningJob.progress || 0);
            currentJobIdRef.current = runningJob.id;

            // Start polling
            pollJobStatus(runningJob.id);
          }
        }
      } catch (err) {
        console.error('Failed to check running jobs:', err);
      }

      setApiUsage(INITIAL_USAGE);
      setStatus('success');
      setFilter('all');
      setCurrentPage(1);
      setSelectedIds(new Set());
      if (!options?.silent && !isSrtFile) {
        showToast('success', `Loaded ${fixedSegments.length} segments.`);
      }
    } catch (err) {
      showToast('error', (err as Error).message);
    } finally {
      setFileLoading(false);
      isLoadingFileRef.current = false;
      setIsDirty(false); // File is fresh from disk, not dirty
    }
  };

  // Effects
  useEffect(() => {
    localStorage.setItem('subtitle_settings', JSON.stringify(settings));
    // Save the appropriate API key based on provider
    const currentApiKey = settings.provider === 'openrouter' 
      ? settings.openrouterApiKey 
      : (settings.geminiApiKey || settings.apiKey);
    if (typeof currentApiKey === 'string' && currentApiKey.trim()) {
      localStorage.setItem('subtitle_api_key', currentApiKey);
    } else {
      localStorage.removeItem('subtitle_api_key');
    }
  }, [settings]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    if (baseFileName) {
      setFileName(generateExportFileName(baseFileName, editedCount));
    }
  }, [baseFileName, editedCount]);

  // Load initial file if provided
  useEffect(() => {
    if (initialFile) {
      processFile(initialFile);
    }
  }, [initialFile]);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Deeplink: Load from URL params on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (vaultFolders.length === 0) return;
    
    const params = new URLSearchParams(window.location.search);
    const folderId = params.get('folderId');
    const fileId = params.get('fileId');
    
    if (folderId && fileId) {
      const folder = vaultFolders.find(f => f.id === folderId);
      if (folder) {
        setSelectedFolderId(folderId);
        
        // Try to find file by id first
        let file = folder.files?.find(f => f.id === fileId);
        
        // If not found and fileId looks like a path (contains /), find by relativePath
        if (!file && fileId.includes('/')) {
          file = folder.files?.find(f => f.relativePath === fileId);
        }
        
        if (file) {
          // Load file immediately, no delay needed
          handleSelectFile(file).finally(() => {
            setDeeplinkPending(false);
          });
        } else if (fileId.includes('/')) {
          // File not in vault (newly created .sktproject), try to load directly by path
          // Create a virtual file object
          const virtualFile: VaultFile = {
            id: fileId,
            name: fileId.split('/').pop() || fileId,
            relativePath: fileId,
            type: 'subtitle',
            size: '0 KB'
          };
          proceedWithFileLoad(virtualFile).finally(() => {
            setDeeplinkPending(false);
          });
        } else {
          setDeeplinkPending(false);
        }
      } else {
        setDeeplinkPending(false);
      }
    } else {
      setDeeplinkPending(false);
    }
  }, [vaultFolders]); // Only run when vaultFolders is loaded

  // Analysis
  const globalAnalysis = useMemo(() => {
    if (segments.length === 0) return null;
    return analyzeSegments(segments, 'translatedText', settings.cpsThreshold, settings.maxSingleLineWords);
  }, [segments, settings.cpsThreshold, settings.maxSingleLineWords]);

  const processedSegments = useMemo(() => globalAnalysis?.enrichedSegments || [], [globalAnalysis]);

  const filteredSegments = useMemo(() => {
    if (filter === 'all') return processedSegments;
    if (filter === 'translated') {
      return processedSegments.filter(s => (s.translatedText || '').trim() !== '');
    }
    if (filter === 'untranslated') {
      return processedSegments.filter(s => (s.translatedText || '').trim() === '');
    }
    if (filter === 'optimized') {
      return processedSegments.filter(s => (s.optimizeHistory?.length || 0) > 0);
    }
    if (filter === 'timeline') {
      return processedSegments.filter(s => s.issueList.some(i => i.toLowerCase().includes('overlap')));
    }
    if (filter === 'invalid-timing') {
      return processedSegments.filter(s => s.issueList.some(i => i.toLowerCase().includes('timing') || i.toLowerCase().includes('duration')));
    }
    if (filter === 'foreign-word') {
      return processedSegments.filter(s => s.issueList.some(i => i.toLowerCase().includes('non-vietnamese word')));
    }
    if (filter === 'too-long') {
      return processedSegments.filter(s => s.issueList.some(i => i.toLowerCase().includes('more than 2 lines')));
    }
    if (filter === 'single-line-long') {
      return processedSegments.filter(s => s.issueList.some(i => i.toLowerCase().includes('too many words')));
    }
    if (filter === 'lang') {
      return processedSegments.filter(s => s.issueList.some(i => {
        const issue = i.toLowerCase();
        return (issue.includes('non-chinese') || issue.includes('non-vietnamese characters')) &&
               !issue.includes('word');
      }));
    }
    if (filter === 'translation-quotes') {
      return processedSegments.filter(s => s.issueList.some(i => i.toLowerCase().includes('quote')));
    }
    return processedSegments.filter(s => s.severity === filter);
  }, [processedSegments, filter]);

  const editorSegments = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return filteredSegments;
    const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$and');
    const isIdSearch = q.startsWith('#');
    const queryCore = isIdSearch ? q.slice(1).trim() : q;
    if (!queryCore) return filteredSegments;

    const basePattern = searchRegexMode ? queryCore : escapeRegExp(queryCore);
    const flags = `${searchCaseSensitive ? '' : 'i'}u`;
    try {
      const regex = new RegExp(basePattern, flags);
      return filteredSegments.filter(s => {
        if (isIdSearch) return regex.test(s.id.toString());
        const fields = [s.startTime, s.endTime, s.originalText || '', s.translatedText || ''];
        return fields.some(field => regex.test(field));
      });
    } catch {
      return [];
    }
  }, [filteredSegments, searchQuery, searchCaseSensitive, searchWholeWord, searchRegexMode]);

  // Helpers
  const showToast = (type: 'info' | 'success' | 'warning' | 'error', message: string) => {
    setToast({ message, visible: true, type });
    setToastHistory(prev => [{ id: Date.now(), message, type, time: Date.now() }, ...prev].slice(0, 50));
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 6000);
  };

  const cloneSegments = useCallback((list: SubtitleSegment[]) => list.map(seg => ({ ...seg })), []);

  const pushUndoSnapshot = useCallback((snapshot: SubtitleSegment[]) => {
    undoStackRef.current.push(cloneSegments(snapshot));
    if (undoStackRef.current.length > 100) undoStackRef.current.shift();
  }, [cloneSegments]);

  const commitSegmentsChange = useCallback((updater: SubtitleSegment[] | ((prev: SubtitleSegment[]) => SubtitleSegment[])) => {
    setSegments(prev => {
      pushUndoSnapshot(prev);
      const next = typeof updater === 'function'
        ? (updater as (prev: SubtitleSegment[]) => SubtitleSegment[])(prev)
        : updater;
      return cloneSegments(next);
    });
  }, [cloneSegments, pushUndoSnapshot]);

  const handleUndoSegments = useCallback(() => {
    const last = undoStackRef.current.pop();
    if (!last) return;
    setSegments(cloneSegments(last));
  }, [cloneSegments]);

  // Optimize history helper
  const appendOptimizeHistory = useCallback((history: string[] | undefined, prevText: string, nextText: string) => {
    let nextHistory = history ? [...history] : [];
    const trimmedPrev = prevText.trim();
    const trimmedNext = nextText.trim();
    if (trimmedNext) {
      // If history is empty, add prevText first (if it exists and is different from nextText)
      if (nextHistory.length === 0 && trimmedPrev && trimmedPrev !== trimmedNext) {
        nextHistory.push(trimmedPrev);
      }
      // Add nextText only if it doesn't already exist in history
      if (!nextHistory.includes(trimmedNext)) {
        nextHistory.push(trimmedNext);
      }
    }
    return nextHistory;
  }, []);

  const commitSegmentText = useCallback((id: number, text: string, prevTextOverride?: string) => {
    commitSegmentsChange(prev => prev.map(s => {
      if (s.id !== id) return s;
      const prevText = prevTextOverride ?? (s.translatedText || '');
      const nextText = text.trim();
      if (prevText === nextText) return s;

      const nextHistory = appendOptimizeHistory(s.optimizeHistory, prevText, nextText);
      return { ...s, translatedText: nextText, optimizeHistory: nextHistory };
    }));
  }, [commitSegmentsChange, appendOptimizeHistory]);

  // Optimize history modal
  const optimizeHistorySegment = useMemo(() => {
    if (optimizeHistorySegmentId === null) return null;
    return segments.find(seg => seg.id === optimizeHistorySegmentId) || null;
  }, [segments, optimizeHistorySegmentId]);

  const handleShowOptimizeHistory = useCallback((id: number) => {
    setOptimizeHistorySegmentId(id);
    const seg = segments.find(s => s.id === id);
    const history = seg?.optimizeHistory || [];
    const currentText = seg?.translatedText || '';
    // Find last index manually for compatibility
    let matchedIndex = -1;
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i] === currentText) {
        matchedIndex = i;
        break;
      }
    }
    const lastIndex = Math.max(0, history.length - 1);
    setOptimizeHistoryIndex(matchedIndex >= 0 ? matchedIndex : lastIndex);
  }, [segments]);

  const handleRestoreOptimizeHistory = useCallback((text: string) => {
    if (optimizeHistorySegmentId === null) return;
    commitSegmentText(optimizeHistorySegmentId, text);
    setOptimizeHistorySegmentId(null);
    showToast('success', 'Restored from history.');
  }, [optimizeHistorySegmentId, commitSegmentText, showToast]);

  // Translation quote removal (from old project)
  const translationQuoteTargets = useMemo(
    () => processedSegments.filter(s => s.issueList.some(i => i.toLowerCase().includes('quote'))),
    [processedSegments]
  );
  const translationQuoteCount = translationQuoteTargets.length;

  const handleRemoveTranslationQuotesRequest = useCallback(() => {
    setShowRemoveQuotesModal(true);
  }, []);

  const handleRemoveTranslationQuotesConfirm = useCallback(() => {
    if (translationQuoteCount === 0) {
      setShowRemoveQuotesModal(false);
      showToast('info', 'No translation quotes to remove.');
      return;
    }
    const targetIds = new Set(translationQuoteTargets.map(seg => seg.id));
    commitSegmentsChange(prev => prev.map(seg => {
      if (!targetIds.has(seg.id)) return seg;
      const current = seg.translatedText || '';
      const cleaned = current.replace(/['"]/g, '').trim();
      if (cleaned === current) return seg;
      const nextHistory = appendOptimizeHistory(seg.optimizeHistory, current, cleaned);
      return { ...seg, translatedText: cleaned, optimizeHistory: nextHistory };
    }));
    showToast('success', `Removed quotes from ${translationQuoteCount} segment(s).`);
    setShowRemoveQuotesModal(false);
  }, [translationQuoteTargets, translationQuoteCount, commitSegmentsChange, appendOptimizeHistory, showToast]);

  // Auto-split long lines (from old project)
  const countWordsLocal = useCallback((text: string) => {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) return 0;
    return normalized.split(' ').length;
  }, []);

  const hasLongLine = useCallback((text: string, maxWords: number) => {
    if (!text) return false;
    const normalized = text.replace(/\s*\n\s*/g, '\n').replace(/[ \t]+/g, ' ').trim();
    if (!normalized) return false;
    return normalized.split('\n').some(line => countWordsLocal(line) > maxWords);
  }, [countWordsLocal]);

  const countLongLineSegments = useCallback((list: SubtitleSegment[], maxWords: number) => {
    return list.reduce((total, seg) => {
      const original = seg.originalText || '';
      const translated = seg.translatedText || '';
      const hasSplit = (original && original.includes('\n')) || (translated && translated.includes('\n'));
      if (hasSplit) return total;
      const originalNeedsCheck = original && !original.includes('\n');
      const translatedNeedsCheck = translated && !translated.includes('\n');
      const shouldCheck = (originalNeedsCheck || translatedNeedsCheck);
      if (!shouldCheck) return total;
      return total + (hasLongLine(original, maxWords) || hasLongLine(translated, maxWords) ? 1 : 0);
    }, 0);
  }, [hasLongLine]);

  const applyAutoSplit = useCallback((list: SubtitleSegment[], maxWords: number) => {
    return list.map(seg => ({
      ...seg,
      originalText: seg.originalText
        ? (seg.originalText.includes('\n') ? seg.originalText : splitToTwoLinesIfLong(seg.originalText, maxWords))
        : seg.originalText,
      translatedText: seg.translatedText
        ? (seg.translatedText.includes('\n') ? seg.translatedText : splitToTwoLinesIfLong(seg.translatedText, maxWords))
        : seg.translatedText
    }));
  }, []);

  const autoSplitScope = useMemo(() => {
    const mode = selectedIds.size > 0 ? 'selected' as const : 'all' as const;
    const scopeSegments = mode === 'selected'
      ? segments.filter(s => selectedIds.has(s.id))
      : filteredSegments;
    const longLineCount = countLongLineSegments(scopeSegments, settings.maxSingleLineWords);
    return { mode, scopeSegments, longLineCount };
  }, [segments, selectedIds, filteredSegments, countLongLineSegments, settings.maxSingleLineWords]);

  const handleAutoSplitLongLines = useCallback(() => {
    if (autoSplitScope.longLineCount === 0) return;
    const splitSegments = applyAutoSplit(autoSplitScope.scopeSegments, settings.maxSingleLineWords);
    const splitMap = new Map(splitSegments.map(seg => [seg.id, seg]));
    commitSegmentsChange(prev => prev.map(seg => splitMap.get(seg.id) || seg));
    const selectedSuffix = autoSplitScope.mode === 'selected' ? ` (${selectedIds.size})` : '';
    showToast(
      'success',
      autoSplitScope.mode === 'selected'
        ? `Auto-split applied to selected segments${selectedSuffix}.`
        : `Auto-split applied to all filtered segments.`
    );
  }, [
    autoSplitScope.longLineCount,
    autoSplitScope.mode,
    autoSplitScope.scopeSegments,
    applyAutoSplit,
    settings.maxSingleLineWords,
    commitSegmentsChange,
    selectedIds.size,
    showToast
  ]);

  const processFile = useCallback((file: File) => {
    const ext = file.name.toLowerCase();
    if (!ext.endsWith('.srt') && !ext.endsWith('.sktproject') && !ext.endsWith('.json')) {
      showToast('error', 'Please select a .srt, .sktproject, or CapCut draft_content.json file.');
      setStatus('error');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      showToast('error', 'File size exceeds 50MB.');
      setStatus('error');
      return;
    }

    const { baseName, editedCount: count } = parseFileName(file.name);
    setBaseFileName(baseName);
    setEditedCount(count);

    setStatus('loading');
    setProgress(20);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;

      setTimeout(() => {
        try {
          let parsedSegments: SubtitleSegment[] = [];
          let preset: TranslationPreset | null = null;

          if (ext.endsWith('.srt')) {
            parsedSegments = parseSRT(content);
          } else if (ext.endsWith('.sktproject')) {
            const res = parseSktProject(content);
            parsedSegments = res.segments;
            preset = res.preset || null;
          } else {
            const res = parseCapCutDraft(content);
            parsedSegments = res.segments;
          }

          if (parsedSegments.length === 0) {
            showToast('error', 'File has no valid segments or has an invalid format.');
            setStatus('error');
            return;
          }

          parsedSegments = parsedSegments.map(s => ({
            ...s,
            originalText: performLocalFix(s.originalText || ""),
            translatedText: performLocalFix(s.translatedText || "")
          }));

          setSegments(parsedSegments);
          undoStackRef.current = [];
          if (preset) {
            setTranslationPreset({ ...preset, humor_level: humorLevel });
          }
          setTranslationState({ status: 'idle', processed: 0, total: 0 });
          setApiUsage(INITIAL_USAGE);
          setProgress(100);
          setStatus('success');
          setFilter('all');
          setCurrentPage(1);
          setSelectedIds(new Set());
          showToast('success', `Loaded ${parsedSegments.length} segments.`);
        } catch (err) {
          showToast('error', 'Error while parsing file: ' + (err as Error).message);
          setStatus('error');
        }
      }, 0);
    };
    reader.onerror = () => {
      setStatus('error');
      showToast('error', 'Error while reading file.');
    };
    reader.readAsText(file);
  }, [humorLevel]);

  // Translation
  const aiScope = useMemo(() => {
    const mode = selectedIds.size > 0 ? 'selected' as const : 'all' as const;
    const scopeSegments = mode === 'selected'
      ? segments.filter(s => selectedIds.has(s.id))
      : filteredSegments;
    const untranslated = scopeSegments.filter(s => !(s.translatedText || '').trim());
    const translated = scopeSegments.filter(s => (s.translatedText || '').trim());
    let action: 'translate' | 'optimize' | 'none' = 'none';
    if (untranslated.length > 0) action = 'translate';
    else if (translated.length > 0) action = 'optimize';
    return { mode, scopeSegments, untranslated, translated, action };
  }, [segments, selectedIds, filteredSegments]);

  const handleTranslate = async () => {
    if (segments.length === 0) return;

    // Check if translation preset is configured (has title_or_summary)
    if (!translationPreset?.reference?.title_or_summary?.trim()) {
      showToast('warning', "Please configure Translation Style before translating.");
      setShowTranslationStylePopup(true);
      return;
    }

    const needingTranslation = aiScope.untranslated;
    if (needingTranslation.length === 0) {
      showToast('info', "All segments are already translated.");
      setTranslationState(prev => ({ ...prev, status: 'completed' }));
      return;
    }

    // Check if we have a working file path (from .srt conversion or direct .sktproject)
    if (!workingFilePath) {
      showToast('error', "No file selected. Translation requires a file to be loaded.");
      return;
    }

    // Get file name for display (from vault or workingFilePath)
    const currentFile = selectedFileId && selectedFolder?.files.find(f => f.id === selectedFileId);
    const displayName = currentFile?.name || fileName || workingFilePath.split('/').pop() || 'Unknown';

    try {
      setStatus('processing');
      setTranslationState({ status: 'queued', processed: 0, total: needingTranslation.length });
      setProgress(0);

      const subtitleFile = workingFilePath;

      const payload = {
        name: `Translate: ${displayName}`,
        projectName: selectedFolder?.name,
        inputPath: subtitleFile,
        subtitleFile: subtitleFile,
        preset: translationPreset,
        graph: {
          nodes: [
            {
              id: 'translate-1',
              type: 'translate',
              label: 'Translate AI',
              params: {
                inputPath: subtitleFile,
                subtitleFile: subtitleFile,
                preset: translationPreset,
                // Send targetIds when: selection mode OR filter is active (not 'all')
                targetIds: (aiScope.mode === 'selected' || filter !== 'all')
                  ? aiScope.untranslated.map(s => s.id)
                  : undefined
              }
            }
          ],
          edges: []
        }
      };

      const response = await fetch('/api/jobs/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Job system error details:', errorData);
        throw new Error(errorData.error || errorData.message || 'Failed to start translation job');
      }

      const responseData = await response.json();
      const jobId = responseData.id;
      currentJobIdRef.current = jobId;
      setTranslationState(prev => ({ ...prev, jobId }));
      showToast('success', "Translation job queued successfully.");
      
      // Start polling for job status
      pollJobStatus(jobId);
    } catch (err: any) {
      setStatus('error');
      setTranslationState(prev => ({ ...prev, status: 'error' }));
      showToast('error', `Error: ${err.message || 'Failed to start job'}`);
    }
  };

  const pollJobStatus = async (jobId: string) => {
    lastLoadedProgressRef.current = 0;
    // Clear any existing polling
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    pollingIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/jobs/${jobId}`);
        if (!response.ok) return;
        const job = await response.json();

        // Detect job type from tasks
        const isOptimizeJob = job.tasks?.some((t: any) => t.type === 'optimize');
        const task = job.tasks?.find((t: any) => isOptimizeJob ? t.type === 'optimize' : t.type === 'translate');
        const processed = task?.processed ?? 0;
        const total = task?.total ?? 0;

        if (job.status === 'completed') {
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
          currentJobIdRef.current = null;

          if (isOptimizeJob) {
            setIsOptimizing(false);
            setIsStoppingOptimize(false);
            setOptimizeState({ processed: total, total });
            showToast('success', "Optimization completed via Job System.");
          } else {
            setTranslationState(prev => ({ ...prev, status: 'completed', processed: prev.total }));
            showToast('success', "Translation completed via Job System.");
          }

          setProgress(100);
          setStatus('success');

          // Reload file to get final content
          const currentFile = selectedFolder?.files.find(f => f.id === selectedFileId);
          if (currentFile) {
            handleSelectFile(currentFile);
          }
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
          currentJobIdRef.current = null;

          if (isOptimizeJob) {
            setIsOptimizing(false);
            setIsStoppingOptimize(false);
            setOptimizeState({ processed: 0, total: 0 });
          } else {
            setTranslationState(prev => ({ ...prev, status: job.status === 'failed' ? 'error' : 'stopped' }));
          }

          setStatus(job.status === 'failed' ? 'error' : 'success');
          showToast(job.status === 'failed' ? 'error' : 'info', `${isOptimizeJob ? 'Optimization' : 'Translation'} job ${job.status}: ${job.error || ''}`);

          // Even on failure, reload what we have
          const currentFile = selectedFolder?.files.find(f => f.id === selectedFileId);
          if (currentFile) {
            handleSelectFile(currentFile);
          }
        } else if (job.status === 'processing') {
          const newProgress = job.progress || 0;

          if (isOptimizeJob) {
            setOptimizeState(prev => ({
              processed: processed ?? prev.processed,
              total: total ?? prev.total
            }));
            setIsOptimizing(true);
          } else {
            setTranslationState(prev => ({
              ...prev,
              status: 'running',
              processed: processed ?? prev.processed,
              total: total ?? prev.total
            }));
          }
          setProgress(newProgress);

          // Reload file content on every progress update for live updates
          if (newProgress > lastLoadedProgressRef.current && workingFilePath) {
            // Reload the working file (.sktproject) directly, not the original .srt
            reloadWorkingFile();
            lastLoadedProgressRef.current = newProgress;
          }
        } else if (job.status === 'pending' || job.status === 'queued') {
          // Keep initial state while waiting for job to start
          if (isOptimizeJob) {
            setIsOptimizing(true);
          } else {
            setTranslationState(prev => ({ ...prev, status: 'running' }));
          }
        }
      } catch (err) {
        console.error('Failed to poll job status:', err);
      }
    }, 2000);
  };

  const handleStopTranslate = async () => {
    if (isStoppingTranslate) return;
    stopRequestedRef.current = true;
    setIsStoppingTranslate(true);
    showToast('info', "Stopping translation...");

    // Cancel job via API if we have a running job
    if (currentJobIdRef.current) {
      try {
        await fetch(`/api/jobs/${currentJobIdRef.current}/cancel`, { method: 'POST' });
      } catch (err) {
        console.error('Failed to cancel job:', err);
      }
    }
  };

  // Optimize
  const handleAiOptimize = async () => {
    // Check if translation preset is configured (has title_or_summary)
    if (!translationPreset?.reference?.title_or_summary?.trim()) {
      showToast('warning', "Please configure Translation Style before optimizing.");
      setShowTranslationStylePopup(true);
      return;
    }

    // Check for API key based on provider
    const provider = settingsRef.current.provider || 'gemini';
    const apiKey = provider === 'openrouter' 
      ? settingsRef.current.openrouterApiKey 
      : (settingsRef.current.geminiApiKey || settingsRef.current.apiKey);
    
    if (!apiKey?.trim()) {
      const providerName = provider === 'openrouter' ? 'OpenRouter' : 'Gemini';
      showToast('warning', `Please enter your ${providerName} API Key in Settings.`);
      onOpenSettings?.();
      return;
    }
    if (aiScope.translated.length === 0) {
      showToast('warning', "No translated segments to optimize.");
      return;
    }

    // Check if we have a working file path
    if (!workingFilePath) {
      showToast('warning', "No file selected. Optimization requires a file to be loaded.");
      return;
    }

    // Get file name for display (from vault or workingFilePath)
    const currentFile = selectedFolder?.files.find(f => f.id === selectedFileId);
    const displayName = currentFile?.name || fileName || workingFilePath.split('/').pop() || 'Unknown';

    setIsOptimizing(true);
    setIsStoppingOptimize(false);
    optimizeStopRequestedRef.current = false;
    setStatus('processing');
    setProgress(0);
    setOptimizeState({ processed: 0, total: aiScope.translated.length });

    try {
      const projectName = selectedFolder?.name || '';
      
      // Use workingFilePath directly
      const subtitleFile = workingFilePath;
      
      const payload = {
        name: `Optimize: ${displayName}`,
        inputPath: subtitleFile,
        graph: {
          nodes: [
            {
              id: 'optimize-1',
              type: 'optimize',
              label: 'Optimize AI',
              params: {
                inputPath: subtitleFile,
                subtitleFile: subtitleFile,
                preset: translationPreset,
                // Send targetIds when: selection mode OR filter is active (not 'all')
                targetIds: (aiScope.mode === 'selected' || filter !== 'all')
                  ? aiScope.translated.map(s => s.id)
                  : undefined,
                // Send targetIssues for issue-aware prompt optimization
                targetIssues: (aiScope.mode === 'selected' || filter !== 'all')
                  ? aiScope.translated.map(s => ({ id: s.id, issues: s.issueList }))
                  : undefined
              }
            }
          ],
          edges: []
        }
      };

      const response = await fetch('/api/jobs/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || 'Failed to start optimization job');
      }

      const responseData = await response.json();
      const jobId = responseData.id;
      currentJobIdRef.current = jobId;
      showToast('success', "Optimization job queued successfully.");

      // Start polling for job status
      pollJobStatus(jobId);
    } catch (err: any) {
      setStatus('error');
      setIsOptimizing(false);
      showToast('error', `Error: ${err.message || 'Failed to start job'}`);
    }
  };

  const handleStopOptimize = async () => {
    if (isStoppingOptimize) return;
    optimizeStopRequestedRef.current = true;
    setIsStoppingOptimize(true);
    showToast('info', "Stopping optimization...");

    // Cancel job via API if we have a running job
    if (currentJobIdRef.current) {
      try {
        await fetch(`/api/jobs/${currentJobIdRef.current}/cancel`, { method: 'POST' });
      } catch (err) {
        console.error('Failed to cancel job:', err);
      }
    }
  };

  // Export
  const downloadFile = (content: string, name: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExport = (type: 'project' | 'srt-orig' | 'srt-tran') => {
    setShowExportModal(false);
    if (type === 'project') {
      const json = generateSktProject(segments, baseFileName, translationPreset);
      const name = generateExportFileName(baseFileName, editedCount, '.sktproject');
      downloadFile(json, name);
      setEditedCount(prev => prev + 1);
      showToast('success', "Project saved.");
    } else if (type === 'srt-orig') {
      const srt = generateSRT(segments, 'original');
      const name = `[Origin]${generateExportFileName(baseFileName, editedCount, '.srt')}`;
      downloadFile(srt, name);
      showToast('success', "Original SRT exported.");
    } else if (type === 'srt-tran') {
      const srt = generateSRT(segments, 'translated');
      const name = `[Translated]${generateExportFileName(baseFileName, editedCount, '.srt')}`;
      downloadFile(srt, name);
      showToast('success', "Translated SRT exported.");
    }
  };

  // Clear
  const performClear = async () => {
    setStatus('clearing');
    await new Promise(resolve => setTimeout(resolve, 800));
    setSegments([]);
    undoStackRef.current = [];
    setFileName('');
    setBaseFileName('');
    setEditedCount(0);
    setProgress(0);
    setStatus('idle');
    setFilter('all');
    setCurrentPage(1);
    setShowClearModal(false);
    setSelectedIds(new Set());
    setSelectedFileId(null);
    
    // Clear URL params
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname);
    }
    
    showToast('success', "Project has been cleared.");
  };

  // Translation Preset (DNA) handlers
  const handleDNAAnalyze = async (input: string) => {
    // Check for API key based on provider
    const provider = settings.provider || 'gemini';
    const apiKey = provider === 'openrouter' 
      ? settings.openrouterApiKey 
      : (settings.geminiApiKey || settings.apiKey);
    
    if (!apiKey?.trim()) {
      const providerName = provider === 'openrouter' ? 'OpenRouter' : 'Gemini';
      showToast('warning', `Please enter your ${providerName} API Key in Settings.`);
      onOpenSettings?.();
      return;
    }
    if (!input.trim()) return;
    setIsPresetLoading(true);
    try {
      const { preset, tokens } = await analyzeTranslationStyle(input, settings.geminiModel || settings.aiModel, apiKey);
      setTranslationPreset(preset);
      if (preset?.reference?.title_or_summary) {
        setPresetDraftSummary(preset.reference.title_or_summary);
      }
      setApiUsage(prev => ({
        ...prev,
        style: {
          requests: prev.style.requests + 1,
          tokens: prev.style.tokens + tokens
        }
      }));

      // Check if AI returned valid style data
      if (preset.genres.length === 0 && preset.humor_level === 0) {
        showToast('warning', "Analysis incomplete. AI returned no style data. Please try again or adjust the input.");
      } else {
        showToast('success', "DNA analysis complete. Translation style initialized.");
      }
    } catch (err: any) {
      console.error("DNA analysis failed", err);
      const errorMsg = err?.message || err?.error || 'Unknown error';
      showToast('error', `Failed to analyze translation style: ${errorMsg}`);
    } finally {
      setIsPresetLoading(false);
    }
  };

  const handleExportPreset = () => {
    if (!translationPreset) return;
    const blob = new Blob([JSON.stringify(translationPreset, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `[DNA] ${translationPreset.reference.title_or_summary.slice(0, 20)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportPreset = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const content = event.target?.result as string;
        const lowerName = file.name.toLowerCase();
        if (lowerName.endsWith('.sktproject')) {
          const res = parseSktProject(content);
          const preset = res.preset;
          if (!preset) {
            showToast('error', "This project has no DNA preset.");
          } else {
            setTranslationPreset(preset);
            if (preset.reference?.title_or_summary) {
              setPresetDraftSummary(preset.reference.title_or_summary);
            }
            showToast('success', "DNA preset imported from project.");
          }
        } else {
          const json = JSON.parse(content);
          const isValid = json.reference?.title_or_summary &&
                          Array.isArray(json.genres) &&
                          typeof json.humor_level === 'number';

          if (isValid) {
            const characterNames = Array.isArray(json.character_names)
              ? json.character_names
                  .filter((t: any) => t && typeof t.cn === 'string' && typeof t.vn === 'string')
                  .map((t: any, i: number) => ({
                    id: typeof t.id === 'number' && Number.isFinite(t.id) ? t.id : i + 1,
                    cn: t.cn,
                    vn: t.vn
                  }))
              : [];
            const cleaned: TranslationPreset = {
              reference: { title_or_summary: json.reference.title_or_summary },
              genres: json.genres,
              character_names: characterNames,
              humor_level: json.humor_level
            };
            setTranslationPreset(cleaned);
            if (cleaned.reference?.title_or_summary) {
              setPresetDraftSummary(cleaned.reference.title_or_summary);
            }
            showToast('success', "DNA preset imported successfully.");
          } else {
            showToast('error', "Invalid DNA file or incompatible version.");
          }
        }
      } catch (err) {
        showToast('error', "Error while reading DNA file.");
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Segment operations
  const handleToggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === editorSegments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(editorSegments.map(s => s.id)));
    }
  };

  const updateSegmentText = useCallback((id: number, text: string) => {
    // Simple update without history - only used for debounced updates which we now skip
    // commitSegmentText (on blur/Enter) handles the actual commit with history
    commitSegmentsChange(prev => prev.map(s => s.id === id ? { ...s, translatedText: text.trim() } : s));
  }, [commitSegmentsChange]);

  const updateSegmentTime = (id: number, field: 'startTime' | 'endTime', value: string) => {
    commitSegmentsChange(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const deleteSegment = (id: number) => {
    commitSegmentsChange(prev => {
      const filtered = prev.filter(s => s.id !== id);
      return filtered.map((s, index) => ({ ...s, id: index + 1 }));
    });
    setSelectedIds(new Set());
    showToast('success', "Segment deleted.");
  };

  // Pagination
  const totalEditorPages = useMemo(
    () => Math.max(1, Math.ceil(editorSegments.length / EDITOR_PAGE_SIZE)),
    [editorSegments.length]
  );

  const pagedSegments = editorSegments.slice((currentPage - 1) * EDITOR_PAGE_SIZE, currentPage * EDITOR_PAGE_SIZE);

  // AI Button state
  const aiRunningMode = translationState.status === 'running'
    ? 'translate'
    : isOptimizing
      ? 'optimize'
      : null;

  const isAiRunning = aiRunningMode !== null;
  const progressDisplay = Math.floor(progress);

  const aiButtonLabel = useMemo(() => {
    if (aiRunningMode === 'translate') {
      return isStoppingTranslate
        ? 'Stopping...'
        : `Stop (${translationState.processed}/${translationState.total} - ${progressDisplay}%)`;
    }
    if (aiRunningMode === 'optimize') {
      return isStoppingOptimize
        ? 'Stopping...'
        : `Stop (${optimizeState.processed}/${optimizeState.total} - ${progressDisplay}%)`;
    }
    if (aiScope.action === 'translate') {
      return aiScope.mode === 'selected' 
        ? `Translate Selected (${aiScope.untranslated.length})`
        : `Translate All (${aiScope.untranslated.length})`;
    }
    if (aiScope.action === 'optimize') {
      return aiScope.mode === 'selected'
        ? `Optimize Selected (${aiScope.translated.length})`
        : `Optimize All (${aiScope.translated.length})`;
    }
    return 'Translate';
  }, [aiRunningMode, aiScope, isStoppingTranslate, isStoppingOptimize, translationState, optimizeState, progressDisplay]);

  const aiButtonDisabled = aiRunningMode === 'translate'
    ? isStoppingTranslate
    : aiRunningMode === 'optimize'
      ? isStoppingOptimize
      : (status === 'processing' || aiScope.action === 'none' || (aiScope.mode === 'all' && !selectedFileId));

  // Toast UI
  const toastTone = {
    info: { container: 'bg-slate-900 border-slate-700 text-lime-300' },
    success: { container: 'bg-lime-950 border-lime-500/50 text-lime-200' },
    warning: { container: 'bg-amber-950 border-amber-500/50 text-amber-200' },
    error: { container: 'bg-rose-950 border-rose-500/50 text-rose-200' }
  } as const;

  const displayFileName = fileName.toLowerCase().endsWith('.srt')
    ? fileName.slice(0, -4)
    : fileName;

  const totalDurationStr = useMemo(() => {
    if (processedSegments.length === 0) return '0m 0s';
    const first = processedSegments[0];
    const last = processedSegments[processedSegments.length - 1];
    const totalSec = Math.max(0, timeToSeconds(last.endTime) - timeToSeconds(first.startTime));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = Math.floor(totalSec % 60);
    return h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
  }, [processedSegments]);

  // Save function
  const handleSave = useCallback(async (showNotification = true) => {
    if (!fileName || segments.length === 0 || !selectedFolderId) return;
    
    // Determine save path
    let savePath: string;
    if (selectedFileId && fileName.toLowerCase().endsWith('.sktproject')) {
      // Save to the original sktproject file
      const folder = vaultFolders.find(f => f.id === selectedFolderId);
      const file = folder?.files?.find(f => f.id === selectedFileId);
      // Save to output folder within the project
      savePath = file?.relativePath || `${folder?.name}/output/${baseFileName}.sktproject`;
    } else {
      // Create new sktproject file in the output folder
      const folder = vaultFolders.find(f => f.id === selectedFolderId);
      savePath = `${folder?.name}/output/${baseFileName}.sktproject`;
    }
    
    setIsSaving(true);
    try {
      const content = generateSktProject(segments, baseFileName, translationPreset);
      await vaultService.saveSubtitleFile(savePath, content);
      setIsDirty(false);
      setLastSavedAt(new Date());
      if (showNotification) {
        showToast('success', "Project saved successfully.");
      }
    } catch (err) {
      console.error("Save failed", err);
      showToast('error', "Failed to save project.");
    } finally {
      setIsSaving(false);
    }
  }, [fileName, segments, baseFileName, translationPreset, selectedFolderId, selectedFileId, vaultFolders]);

  // Auto-save effect with 3-second debounce (only if enabled)
  useEffect(() => {
    if (!autoSaveEnabled || !isDirty || !fileName || segments.length === 0) return;
    
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Set new timeout for auto-save (3 seconds)
    saveTimeoutRef.current = setTimeout(() => {
      handleSave(false); // Don't show notification for auto-save
    }, 3000);
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [autoSaveEnabled, isDirty, segments, fileName, handleSave]);

  // Persist auto-save preference
  useEffect(() => {
    try {
      localStorage.setItem('subtitle_autosave', autoSaveEnabled.toString());
    } catch {
      // Ignore localStorage errors
    }
  }, [autoSaveEnabled]);

  // Mark as dirty when segments or preset changes (but not during file load)
  useEffect(() => {
    if (isLoadingFileRef.current) return; // Skip during file load
    if (fileName && segments.length > 0) {
      setIsDirty(true);
    }
  }, [segments, translationPreset, fileName]);

  // Keyboard shortcut Ctrl+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  return (
    <div className="flex-1 h-full bg-slate-950">
      <Layout>
        {/* Toast */}
        {toast.visible && (
          <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[600] border px-6 py-3 rounded-full shadow-2xl ${toastTone[toast.type].container}`}>
            <p className="text-sm font-bold">{toast.message}</p>
          </div>
        )}

        {/* Editor Tab */}
        {segments.length === 0 && deeplinkPending ? (
          // Show loading when deeplink is pending (prevents flash of project selection)
          <div className="flex-1 flex items-center justify-center bg-slate-950/50">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-lime-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-slate-400">Loading file...</p>
            </div>
          </div>
        ) : segments.length === 0 && (
          <div className="flex-1 flex flex-col p-6 bg-slate-950/50 overflow-hidden">
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-slate-100 mb-1 tracking-tight">Subtitle Studio</h1>
              <p className="text-slate-400 text-sm">Select a project and file to start editing.</p>
            </div>

            <div className="flex-1 flex gap-6 min-h-0">
              {/* Projects List */}
              <div className="w-3/10 flex flex-col bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 space-y-3">
                  <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <Folder size={16} className="text-lime-400" />
                    Projects
                  </h2>
                  <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5">
                    <Search size={14} className="text-slate-500" />
                    <input
                      type="text"
                      value={folderQuery}
                      onChange={(e) => setFolderQuery(e.target.value)}
                      placeholder="Search projects..."
                      className="flex-1 bg-transparent text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
                    />
                    {folderQuery && (
                      <button
                        onClick={() => setFolderQuery('')}
                        className="text-slate-500 hover:text-slate-300"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                  {parentVaultLoading ? (
                    <div className="flex items-center justify-center h-32">
                      <div className="w-6 h-6 border-2 border-lime-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : vaultFolders.length === 0 ? (
                    <p className="text-xs text-slate-500 p-3 text-center">No projects available</p>
                  ) : (
                    vaultFolders.filter(folder => folder.name.toLowerCase().includes(folderQuery.toLowerCase())).map((folder) => (
                      <button
                        key={folder.id}
                        onClick={() => setSelectedFolderId(folder.id)}
                        className={`w-full text-left p-3 rounded-xl transition-all ${
                          selectedFolderId === folder.id
                            ? 'bg-lime-600/10 border border-lime-500/20 text-lime-400'
                            : 'hover:bg-slate-800 text-slate-400'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate flex-1">{folder.name}</p>
                          {folder.status && (
                            <span className={`text-[9px] leading-none font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${STATUS_COLORS[folder.status]} text-white shrink-0`}>
                              {STATUS_LABELS[folder.status]}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {folder.files?.filter(f => {
                            const lowerPath = f.relativePath?.toLowerCase() || f.name.toLowerCase();
                            const isInOutput = lowerPath.includes('/output/');
                            const isInSource = lowerPath.includes('/source/');
                            const isSupported = f.name.toLowerCase().endsWith('.srt') ||
                              f.name.toLowerCase().endsWith('.sktproject') ||
                              f.name.toLowerCase().endsWith('.json');
                            return (isInOutput || isInSource) && isSupported;
                          }).length || 0} subtitle files
                        </p>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Files List */}
              <div className="w-7/10 flex flex-col bg-slate-900/40 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                    <File size={16} className="text-lime-400" />
                    {selectedFolder ? selectedFolder.name : 'Select a project'}
                  </h2>
                  {selectedFolder && (
                    <span className="text-xs text-slate-500">
                      {selectedFolder.files?.filter(f => {
                        const lowerPath = f.relativePath?.toLowerCase() || f.name.toLowerCase();
                        const isInOutput = lowerPath.includes('/output/');
                        const isInSource = lowerPath.includes('/source/');
                        const isSupported = f.name.toLowerCase().endsWith('.srt') ||
                          f.name.toLowerCase().endsWith('.sktproject') ||
                          f.name.toLowerCase().endsWith('.json');
                        return (isInOutput || isInSource) && isSupported;
                      }).length || 0} files
                    </span>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {!selectedFolder ? (
                    <div className="h-full flex items-center justify-center text-slate-500">
                      <p className="text-sm">Select a project to view files</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {(() => {
                        const supportedFiles = selectedFolder.files?.filter(f => {
                          const lowerPath = f.relativePath?.toLowerCase() || f.name.toLowerCase();
                          const isInOutput = lowerPath.includes('/output/');
                          const isInSource = lowerPath.includes('/source/');
                          const isSupported = f.name.toLowerCase().endsWith('.srt') ||
                            f.name.toLowerCase().endsWith('.sktproject') ||
                            f.name.toLowerCase().endsWith('.json');
                          return (isInOutput || isInSource) && isSupported;
                        });
                        
                        if (supportedFiles?.length === 0) {
                          return <p className="text-xs text-slate-500 p-4 text-center">No supported files found in source/output folders (.srt, .sktproject, .json)</p>;
                        }
                        
                        return supportedFiles.map((file) => {
                          const lowerPath = file.relativePath?.toLowerCase() || file.name.toLowerCase();
                          let subfolder = '';
                          if (lowerPath.includes('/output/')) subfolder = 'output';
                          else if (lowerPath.includes('/source/')) subfolder = 'source';
                          
                          return (
                            <button
                              key={file.id}
                              onClick={() => handleSelectFile(file)}
                              disabled={fileLoading || parentVaultLoading}
                              className={`w-full text-left p-3 rounded-xl transition-all group disabled:opacity-50 ${
                                selectedFileId === file.id
                                  ? 'bg-lime-600/10 border border-lime-500/20'
                                  : 'hover:bg-slate-800'
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                                  selectedFileId === file.id ? 'bg-lime-600/20' : 'bg-lime-600/10'
                                }`}>
                                  {file.name.toLowerCase().endsWith('.srt') ? (
                                    <Type size={14} className={selectedFileId === file.id ? 'text-lime-300' : 'text-lime-400'} />
                                  ) : (
                                    <FileText size={14} className={selectedFileId === file.id ? 'text-lime-300' : 'text-lime-400'} />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-medium truncate transition-colors ${
                                    selectedFileId === file.id ? 'text-lime-300' : 'text-slate-200 group-hover:text-lime-400'
                                  }`}>
                                    {file.name}
                                  </p>
                                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                                    <span className="uppercase">{file.name.split('.').pop()}</span>
                                    <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                                    <span>{file.duration || '00:00:00'}</span>
                                    <span className="w-1 h-1 rounded-full bg-slate-700"></span>
                                    <span>{file.size}</span>
                                  </p>
                                </div>
                                <ChevronRight size={16} className={selectedFileId === file.id ? 'text-lime-400' : 'text-slate-600 group-hover:text-lime-400'} />
                              </div>
                            </button>
                          );
                        });
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </div>

          </div>
        )}

        {/* Editor with Content */}
        {segments.length > 0 && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header with file info - spans full width above both editor and right panel */}
            {fileName && (
              <div className="relative bg-slate-900 border-b border-slate-800 px-3 sm:px-5 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 shrink-0 z-40 overflow-visible">
                <div
                  className="flex items-center gap-3 overflow-hidden cursor-pointer"
                  onClick={() => setShowTranslationStylePopup(true)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setShowTranslationStylePopup(true);
                    }
                  }}
                  title="Open Translation Style"
                >
                  <div className="p-2 bg-lime-600/10 text-lime-400 rounded-lg shrink-0">
                    <FileText size={18} />
                  </div>
                  <div className="overflow-hidden">
                    <h2 className="text-sm font-bold text-slate-100 truncate">{displayFileName}</h2>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                      <span>{processedSegments.length} SEGMENTS</span>
                      <span className="hidden sm:inline w-1 h-1 rounded-full bg-slate-700"></span>
                      <span>{totalDurationStr}</span>
                    </div>
                  </div>
                </div>

                {/* Right side: Search + Notification buttons */}
                <div className="shrink-0 sm:ml-4 flex items-start gap-2">
                  {/* Search button with dropdown */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        setShowSearchBox(prev => !prev);
                        if (!showSearchBox) {
                          setShowReplaceBox(false);
                          setTimeout(() => searchInputRef.current?.focus(), 0);
                        }
                      }}
                      className={`inline-flex items-center justify-center w-7 h-7 p-0 leading-none rounded-md border transition-colors ${
                        showSearchBox
                          ? 'bg-lime-600/20 border-lime-500/40 text-lime-200'
                          : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-slate-100'
                      }`}
                      title="Search segments"
                      aria-label="Search segments"
                    >
                      <Search size={14} />
                    </button>

                    {/* Search Dropdown - matches original SubtitleToolkit */}
                    {showSearchBox && (
                      <div className="absolute right-0 top-0 -mt-1 z-[60] flex items-stretch p-0.5 bg-slate-800 border border-slate-700 rounded-md min-w-[140px] sm:min-w-[180px] shadow-xl overflow-hidden">
                        {/* Replace toggle sidebar */}
                        <div className="w-[22px] shrink-0 border-r border-slate-700/70 flex">
                          <button
                            type="button"
                            onClick={() => {
                              setShowReplaceBox(prev => !prev);
                              if (!showReplaceBox) {
                                setTimeout(() => replaceInputRef.current?.focus(), 0);
                              }
                            }}
                            title={showReplaceBox ? "Hide replace" : "Show replace"}
                            aria-label={showReplaceBox ? "Hide replace" : "Show replace"}
                            className={`flex-1 flex items-center justify-center transition-all ${showReplaceBox ? 'text-lime-300 rotate-90' : 'text-slate-400 hover:text-slate-200'}`}
                          >
                            <ChevronRight size={14} />
                          </button>
                        </div>

                        {/* Main search area */}
                        <div className="flex flex-col min-w-0 pl-0.5">
                          <div className="inline-flex items-center gap-1 px-0.5 py-0.5">
                            <input
                              ref={searchInputRef}
                              type="text"
                              value={searchQuery}
                              onChange={(e) => setSearchQuery(e.target.value)}
                              placeholder="Search"
                              className="w-full min-w-[120px] sm:min-w-[160px] bg-transparent text-[12px] text-slate-100 outline-none placeholder:text-slate-400"
                            />
                            <button
                              type="button"
                              onClick={() => setSearchCaseSensitive(prev => !prev)}
                              title="Case sensitive"
                              aria-label="Case sensitive"
                              className={`px-0.5 rounded text-[11px] font-semibold transition-colors ${
                                searchCaseSensitive ? 'text-lime-300 bg-lime-500/20' : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              Aa
                            </button>
                            <button
                              type="button"
                              onClick={() => setSearchWholeWord(prev => !prev)}
                              title="Match whole word"
                              aria-label="Match whole word"
                              className={`px-0.5 rounded text-[11px] font-semibold transition-colors ${
                                searchWholeWord ? 'text-lime-300 bg-lime-500/20 underline' : 'text-slate-400 hover:text-slate-200 underline'
                              }`}
                            >
                              ab
                            </button>
                            <button
                              type="button"
                              onClick={() => setSearchRegexMode(prev => !prev)}
                              title="Regex search"
                              aria-label="Regex search"
                              className={`px-0.5 rounded text-[11px] font-semibold transition-colors ${
                                searchRegexMode ? 'text-lime-300 bg-lime-500/20' : 'text-slate-400 hover:text-slate-200'
                              }`}
                            >
                              .*
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSearchQuery('');
                                setShowSearchBox(false);
                              }}
                              title="Clear and close search"
                              aria-label="Clear and close search"
                              className="ml-1 px-1.5 rounded text-[12px] font-bold text-slate-300 border border-slate-700/60 hover:text-rose-300 hover:bg-rose-500/15 transition-colors"
                            >
                              x
                            </button>
                          </div>

                          {/* Replace input row */}
                          {showReplaceBox && (
                            <div className="inline-flex items-center gap-2 px-1 py-0.5 border-t border-slate-700/70">
                              <input
                                ref={replaceInputRef}
                                type="text"
                                value={replaceQuery}
                                onChange={(e) => setReplaceQuery(e.target.value)}
                                placeholder="Replace"
                                className="w-full bg-transparent text-[12px] text-slate-100 outline-none placeholder:text-slate-400"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Notification button */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowToastHistory(prev => !prev)}
                      aria-label="Notification history"
                      title="Notification history"
                      className="inline-flex items-center justify-center w-7 h-7 p-0 leading-none rounded-md bg-slate-800 text-slate-300 hover:text-slate-100 border border-slate-700 transition-colors"
                    >
                      <Bell size={14} />
                    </button>

                    {/* Toast History Dropdown */}
                    {showToastHistory && (
                      <div className="absolute right-0 top-full mt-2 z-[60] w-[320px] max-h-[420px] bg-slate-800/90 border border-slate-700/60 rounded-2xl shadow-2xl overflow-hidden ring-1 ring-lime-500/15">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/60 bg-slate-900/70">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Notification</div>
                          <button
                            onClick={() => setShowToastHistory(false)}
                            aria-label="Close notification history"
                            title="Close"
                            className="p-1 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <div className="max-h-[360px] overflow-y-auto p-3 space-y-2 bg-slate-900/50">
                          {toastHistory.length === 0 ? (
                            <div className="text-sm text-slate-500">No notifications yet.</div>
                          ) : (
                            toastHistory.map(item => (
                              <div key={item.id} className={`border rounded-xl px-3 py-2 ${
                                item.type === 'success'
                                  ? 'bg-emerald-500/10 border-emerald-500/30'
                                  : item.type === 'warning'
                                    ? 'bg-amber-500/10 border-amber-500/30'
                                    : item.type === 'error'
                                      ? 'bg-rose-500/10 border-rose-500/30'
                                      : 'bg-slate-950/60 border-slate-800'
                              }`}>
                                <div className="text-[10px] text-slate-500 mb-1">
                                  {new Date(item.time).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                </div>
                                <div className={`text-sm flex items-center gap-2 ${
                                  item.type === 'success'
                                    ? 'text-emerald-200'
                                    : item.type === 'warning'
                                      ? 'text-amber-200'
                                      : item.type === 'error'
                                        ? 'text-rose-200'
                                        : 'text-slate-200'
                                }`}>
                                  <span className="line-clamp-2" title={item.message}>
                                    {item.message}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Save Button */}
                  <button
                    onClick={() => handleSave(true)}
                    disabled={!isDirty || isSaving}
                    className={`inline-flex items-center justify-center w-7 h-7 p-0 rounded-md border transition-colors ${
                      isDirty
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500 hover:text-white'
                        : 'border-slate-700 bg-slate-800 text-slate-500 cursor-default'
                    }`}
                    title={isDirty ? (isSaving ? 'Saving...' : 'Save (Ctrl+S)') : 'All changes saved'}
                    aria-label="Save project"
                  >
                    {isSaving ? (
                      <div className="w-3 h-3 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                        <polyline points="17 21 17 13 7 13 7 21" />
                        <polyline points="7 3 7 8 15 8" />
                      </svg>
                    )}
                  </button>

                  {/* Reload Button */}
                  <button
                    onClick={() => {
                      const currentFile = selectedFolder?.files.find(f => f.id === selectedFileId);
                      if (currentFile) handleSelectFile(currentFile);
                    }}
                    disabled={!selectedFileId || fileLoading}
                    className={`inline-flex items-center justify-center w-7 h-7 p-0 rounded-md border transition-colors ${
                      fileLoading
                        ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                        : 'border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                    } disabled:opacity-50`}
                    title="Reload file"
                    aria-label="Reload file"
                  >
                    <RefreshCw size={14} className={fileLoading ? 'animate-spin' : ''} />
                  </button>

                  {/* Auto-save Toggle Button */}
                  <button
                    onClick={() => setAutoSaveEnabled(prev => !prev)}
                    className={`inline-flex items-center justify-center w-7 h-7 p-0 rounded-md border transition-colors ${
                      autoSaveEnabled
                        ? 'border-lime-500/30 bg-lime-500/10 text-lime-400 hover:bg-lime-500/20'
                        : 'border-slate-700 bg-slate-800 text-slate-500 hover:text-slate-400'
                    }`}
                    title={autoSaveEnabled ? 'Auto-save: ON (3s)' : 'Auto-save: OFF'}
                    aria-label={autoSaveEnabled ? 'Disable auto-save' : 'Enable auto-save'}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </button>

                  {/* Close Button */}
                  <button
                    onClick={() => {
                      if (isDirty) {
                        setShowCloseConfirmModal(true);
                      } else {
                        onBack?.();
                      }
                    }}
                    className="inline-flex items-center justify-center w-7 h-7 p-0 rounded-md border border-slate-700 bg-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-700 transition-colors"
                    title="Close"
                    aria-label="Close"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>
            )}

            {/* Main content area with editor and right panel */}
            <div className="flex-1 flex overflow-hidden">
              {/* Editor Pane */}
              <div className="flex-1 flex flex-col overflow-hidden bg-slate-950 min-w-0">
                {/* Toolbar */}
              <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/70 backdrop-blur-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSelectAll}
                      className={`p-1.5 rounded-lg border transition-colors ${
                        editorSegments.length > 0 && editorSegments.every(s => selectedIds.has(s.id))
                          ? 'bg-lime-600 border-lime-500 text-white'
                          : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                      }`}
                    >
                      {editorSegments.length > 0 && editorSegments.every(s => selectedIds.has(s.id))
                        ? <CopyX size={16} />
                        : <CopyCheck size={16} />}
                    </button>

                    {(() => {
                      const counts = {
                        translated: processedSegments.filter(s => (s.translatedText || '').trim() !== '').length,
                        untranslated: processedSegments.filter(s => (s.translatedText || '').trim() === '').length,
                        optimized: processedSegments.filter(s => (s.optimizeHistory?.length || 0) > 0).length,
                        safe: processedSegments.filter(s => s.severity === 'safe').length,
                        warning: processedSegments.filter(s => s.severity === 'warning').length,
                        critical: processedSegments.filter(s => s.severity === 'critical').length,
                        timeline: processedSegments.filter(s => s.issueList.some(i => i.toLowerCase().includes('overlap'))).length,
                        invalidTiming: processedSegments.filter(s => s.issueList.some(i => i.toLowerCase().includes('timing') || i.toLowerCase().includes('duration'))).length,
                        foreignWord: processedSegments.filter(s => s.issueList.some(i => i.toLowerCase().includes('non-vietnamese word'))).length,
                        tooLong: processedSegments.filter(s => s.issueList.some(i => i.toLowerCase().includes('more than 2 lines'))).length,
                        singleLineLong: processedSegments.filter(s => s.issueList.some(i => i.toLowerCase().includes('too many words'))).length,
                        lang: processedSegments.filter(s => s.issueList.some(i => {
                          const issue = i.toLowerCase();
                          return (issue.includes('non-chinese') || issue.includes('non-vietnamese characters')) &&
                                 !issue.includes('word');
                        })).length,
                        translationQuotes: processedSegments.filter(s => s.issueList.some(i => i.toLowerCase().includes('quote'))).length,
                      };

                      return (
                        <select
                          value={filter}
                          onChange={(e) => setFilter(e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold bg-slate-800 border border-slate-700 text-slate-200 outline-none"
                        >
                          <option value="all">All Segments ({processedSegments.length})</option>

                          {(counts.translated > 0 || counts.untranslated > 0 || counts.optimized > 0) && (
                            <optgroup label="Status">
                              {counts.translated > 0 && <option value="translated">Translated ({counts.translated})</option>}
                              {counts.untranslated > 0 && <option value="untranslated">Untranslated ({counts.untranslated})</option>}
                              {counts.optimized > 0 && <option value="optimized">Optimized ({counts.optimized})</option>}
                            </optgroup>
                          )}

                          {(counts.safe > 0 || counts.warning > 0 || counts.critical > 0) && (
                            <optgroup label="AI Checks">
                              {counts.safe > 0 && <option value="safe">Safe ({counts.safe})</option>}
                              {counts.warning > 0 && <option value="warning">Warning ({counts.warning})</option>}
                              {counts.critical > 0 && <option value="critical">Critical ({counts.critical})</option>}
                            </optgroup>
                          )}

                          {(counts.timeline > 0 || counts.invalidTiming > 0 || counts.foreignWord > 0 || counts.tooLong > 0 || counts.singleLineLong > 0 || counts.lang > 0 || counts.translationQuotes > 0) && (
                            <optgroup label="Issue Alerts">
                              {counts.timeline > 0 && <option value="timeline">Timeline Overlaps ({counts.timeline})</option>}
                              {counts.invalidTiming > 0 && <option value="invalid-timing">Invalid Timing ({counts.invalidTiming})</option>}
                              {counts.foreignWord > 0 && <option value="foreign-word">Foreign Words ({counts.foreignWord})</option>}
                              {counts.tooLong > 0 && <option value="too-long">Too Many Lines ({counts.tooLong})</option>}
                              {counts.singleLineLong > 0 && <option value="single-line-long">Single Line Too Long ({counts.singleLineLong})</option>}
                              {counts.lang > 0 && <option value="lang">Language Issues ({counts.lang})</option>}
                              {counts.translationQuotes > 0 && <option value="translation-quotes">Translation Quotes ({counts.translationQuotes})</option>}
                            </optgroup>
                          )}
                        </select>
                      );
                    })()}

                    <button
                      onClick={() => {
                        if (aiRunningMode === 'translate') handleStopTranslate();
                        else if (aiRunningMode === 'optimize') handleStopOptimize();
                        else if (aiScope.action === 'translate') handleTranslate();
                        else if (aiScope.action === 'optimize') handleAiOptimize();
                      }}
                      disabled={aiButtonDisabled}
                      className={`relative overflow-hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                        isAiRunning
                          ? 'bg-rose-600/80 border border-rose-500/50 text-rose-100 hover:bg-rose-500/80'
                          : 'bg-lime-700/70 border border-lime-500/40 text-lime-100 hover:bg-lime-600/70 disabled:opacity-60'
                      }`}
                    >
                      {isAiRunning && (
                        <span className="absolute left-0 top-0 h-full bg-white/10 pointer-events-none" style={{ width: `${progress}%` }} />
                      )}
                      <Sparkles size={14} className="relative z-10" />
                      <span className="relative z-10">{aiButtonLabel}</span>
                    </button>

                    {filter === 'translation-quotes' && (
                      <button
                        onClick={handleRemoveTranslationQuotesRequest}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-600/70 border border-amber-500/40 text-amber-100 hover:bg-amber-500/70 transition-colors"
                      >
                        <X size={12} />
                        Remove Quotes
                      </button>
                    )}

                    {(filter === 'single-line-long' || filter === 'too-long') && autoSplitScope.longLineCount > 0 && (
                      <button
                        onClick={handleAutoSplitLongLines}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-600/70 border border-cyan-500/40 text-cyan-100 hover:bg-cyan-500/70 transition-colors"
                      >
                        <Wand2 size={12} />
                        Split Lines ({autoSplitScope.longLineCount})
                      </button>
                    )}
                  </div>

                  {/* Pagination - positioned on the right side of toolbar */}
                  {totalEditorPages > 1 && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isPageEditing ? (
                        <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                          Page
                          <input
                            type="number"
                            min={1}
                            max={totalEditorPages}
                            value={pageInputValue}
                            onChange={(e) => setPageInputValue(e.target.value)}
                            onBlur={() => {
                              const next = Math.min(
                                totalEditorPages,
                                Math.max(1, Number(pageInputValue) || 1)
                              );
                              setCurrentPage(next);
                              setPageInputValue(String(next));
                              setIsPageEditing(false);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const next = Math.min(
                                  totalEditorPages,
                                  Math.max(1, Number(pageInputValue) || 1)
                                );
                                setCurrentPage(next);
                                setPageInputValue(String(next));
                                setIsPageEditing(false);
                              } else if (e.key === 'Escape') {
                                setPageInputValue(String(currentPage));
                                setIsPageEditing(false);
                              }
                            }}
                            className="w-14 bg-slate-950 border border-slate-700 text-slate-200 px-2 py-0.5 rounded text-[10px] font-bold text-center"
                            autoFocus
                          />
                          / {totalEditorPages}
                        </label>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setPageInputValue(String(currentPage));
                            setIsPageEditing(true);
                          }}
                          className="text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap hover:text-slate-300 transition"
                          title="Go to page"
                        >
                          Page {currentPage} / {totalEditorPages}
                        </button>
                      )}
                      <button
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                        disabled={currentPage === 1}
                        className="p-1.5 rounded-md bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        onClick={() => setCurrentPage(prev => Math.min(totalEditorPages, prev + 1))}
                        disabled={currentPage === totalEditorPages}
                        className="p-1.5 rounded-md bg-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronRight size={16} />
                      </button>
                      {/* Hide/Show issues panel button */}
                      <button
                        type="button"
                        onClick={() => setShowQualityDashboard(prev => !prev)}
                        className="w-8 h-8 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition-all flex items-center justify-center"
                        aria-label={showQualityDashboard ? 'Hide issues panel' : 'Show issues panel'}
                        title={showQualityDashboard ? 'Hide issues panel' : 'Show issues panel'}
                      >
                        <span className="sr-only">{showQualityDashboard ? 'Hide issues panel' : 'Show issues panel'}</span>
                        <span className="flex flex-col gap-1">
                          <span className="block w-3 h-[2px] bg-current rounded-full"></span>
                          <span className="block w-3 h-[2px] bg-current rounded-full"></span>
                          <span className="block w-3 h-[2px] bg-current rounded-full"></span>
                        </span>
                      </button>
                    </div>
                  )}
                </div>

              </div>

              {/* Segment List */}
              <SegmentList
                segments={pagedSegments}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
                onUpdateText={updateSegmentText}
                onCommitText={commitSegmentText}
                onUpdateTime={updateSegmentTime}
                onShowOptimizeHistory={handleShowOptimizeHistory}
                focusSegmentId={focusSegmentId}
                onFocusDone={() => setFocusSegmentId(null)}
                searchQuery={searchQuery}
                searchCaseSensitive={searchCaseSensitive}
                searchWholeWord={searchWholeWord}
                searchRegexMode={searchRegexMode}
                disabled={translationState.status === 'running' || isOptimizing}
                isTranslating={translationState.status === 'running'}
              />

            </div>

            {/* Quality Dashboard */}
            {showQualityDashboard && (
              <div className="w-72 border-l border-slate-800 bg-slate-900/30 overflow-y-auto hidden lg:block">
                <AnalyzerPanel
                  data={globalAnalysis?.stats as AnalysisResult}
                  segments={segments}
                  onFilterTrigger={setFilter}
                  activeFilter={filter}
                  safeThreshold={settings.cpsThreshold.safeMax}
                  criticalThreshold={settings.cpsThreshold.warningMax}
                  maxSingleLineWords={settings.maxSingleLineWords}
                />
              </div>
            )}
            </div>{/* End Main content area */}
          </div>
        )}

        {/* Modals */}
        {showClearModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in zoom-in duration-200">
              <h3 className="text-xl font-bold mb-3 text-center">Clear current project?</h3>
              <p className="text-slate-400 text-sm text-center mb-6">All unsaved changes will be lost.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowClearModal(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={performClear}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 rounded-xl font-bold transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Close Confirm Modal */}
        {showCloseConfirmModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in zoom-in duration-200">
              <h3 className="text-xl font-bold mb-3 text-center">Unsaved changes</h3>
              <p className="text-slate-400 text-sm text-center mb-6">All unsaved changes will be lost. Are you sure you want to close?</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowCloseConfirmModal(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setShowCloseConfirmModal(false);
                    onBack?.();
                  }}
                  className="flex-1 py-3 bg-rose-600 hover:bg-rose-500 rounded-xl font-bold transition-colors"
                >
                  Discard and Close
                </button>
              </div>
            </div>
          </div>
        )}

        {showExportModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl p-6 relative animate-in zoom-in duration-200">
              <button
                onClick={() => setShowExportModal(false)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
              >
                <X size={18} />
              </button>
              <h3 className="text-2xl font-bold mb-6">Export</h3>
              <div className="space-y-3">
                <button
                  onClick={() => handleExport('project')}
                  className="w-full p-4 bg-lime-600/10 border border-lime-500/20 rounded-xl text-left hover:bg-lime-600/20 transition-all"
                >
                  <span className="block font-bold text-lime-400">Save Project (.sktproject)</span>
                  <span className="text-[10px] text-slate-500">Save full project state for later editing.</span>
                </button>
                <button
                  onClick={() => handleExport('srt-tran')}
                  className="w-full p-4 bg-lime-600/10 border border-lime-500/20 rounded-xl text-left hover:bg-lime-600/20 transition-all"
                >
                  <span className="block font-bold text-lime-400">Export Translated (.srt)</span>
                  <span className="text-[10px] text-slate-500">Translated Vietnamese version.</span>
                </button>
                <button
                  onClick={() => handleExport('srt-orig')}
                  className="w-full p-4 bg-slate-800 border border-slate-700 rounded-xl text-left hover:bg-slate-700 transition-all"
                >
                  <span className="block font-bold text-slate-400">Export Original (.srt)</span>
                  <span className="text-[10px] text-slate-500">Original Chinese version.</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Translation Style Popup */}
        {showTranslationStylePopup && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[220] flex items-center justify-center p-4">
            <div className="relative w-full max-w-6xl max-h-[90vh] bg-slate-900 border border-slate-800 rounded-[22px] sm:rounded-[28px] shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-lime-600/10 text-lime-400 rounded-lg">
                    <Wand2 size={18} />
                  </div>
                  <div>
                    <div className="text-sm sm:text-base font-bold text-slate-100">Translation Style</div>
                    <div className="text-[11px] text-slate-500">Configure DNA presets for consistent tone and names.</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className={`flex items-center gap-2 px-3 py-1.5 bg-lime-600 hover:bg-lime-500 text-white text-[9px] sm:text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all cursor-pointer shadow-md shadow-lime-600/20 ${isPresetLoading ? 'opacity-30 cursor-not-allowed' : ''}`}>
                    <Upload size={14} /> Import Preset
                    {!isPresetLoading && <input type="file" accept=".json,.sktproject" className="hidden" onChange={handleImportPreset} />}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowTranslationStylePopup(false)}
                    className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
                    aria-label="Close translation style"
                    title="Close"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>
              <div className="max-h-[90vh] overflow-y-auto">
                <PresetPage
                  preset={translationPreset}
                  isLoading={isPresetLoading}
                  onAnalyze={handleDNAAnalyze}
                  onImport={handleImportPreset}
                  onUpdatePreset={setTranslationPreset}
                  fileName={fileName}
                  displayFileName={displayFileName}
                  totalSegments={segments.length}
                  totalDuration={totalDurationStr}
                  draftSummary={presetDraftSummary}
                  onDraftSummaryChange={setPresetDraftSummary}
                />
              </div>
            </div>
          </div>
        )}

        {/* Optimize History Modal */}
        {optimizeHistorySegment && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl p-6 animate-in zoom-in duration-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-100">
                  Optimization History <span className="text-slate-500">#{optimizeHistorySegment.id}</span>
                </h3>
                <button
                  onClick={() => setOptimizeHistorySegmentId(null)}
                  className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mb-4">
                <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">Current Text</div>
                <div className="p-3 bg-slate-800 rounded-lg text-blue-100 text-sm">
                  {optimizeHistorySegment.translatedText || <span className="text-slate-500 italic">No translation</span>}
                </div>
              </div>

              {optimizeHistorySegment.optimizeHistory && optimizeHistorySegment.optimizeHistory.length > 0 && (
                <div className="mb-4">
                  <div className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">History ({optimizeHistorySegment.optimizeHistory.length} versions)</div>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {optimizeHistorySegment.optimizeHistory.map((text, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleRestoreOptimizeHistory(text)}
                        className={`w-full p-3 rounded-lg text-left text-sm transition-colors ${
                          idx === optimizeHistoryIndex
                            ? 'bg-lime-600/20 border border-lime-500/40 text-lime-100'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex-1 truncate">{text}</span>
                          <span className="text-[10px] text-slate-500">v{idx + 1}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setOptimizeHistorySegmentId(null)}
                  className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold transition-colors text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Remove Quotes Modal */}
        {showRemoveQuotesModal && (
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in zoom-in duration-200">
              <h3 className="text-xl font-bold mb-3 text-slate-100">Remove quotes from translations?</h3>
              <p className="text-slate-400 text-sm">
                This will remove all ' and " characters in {translationQuoteCount} segment(s).
              </p>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowRemoveQuotesModal(false)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemoveTranslationQuotesConfirm}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Confirm Overwrite Modal */}
        <ConfirmModal
          open={confirmOverwrite.open}
          title="Project file already exists"
          description="A .sktproject file for this subtitle already exists. Opening this .srt file will overwrite the existing project. Do you want to continue?"
          confirmLabel="Continue and Overwrite"
          variant="danger"
          onClose={() => setConfirmOverwrite({ open: false, srtFile: null, sktProjectPath: '', existingSktProject: null })}
          onConfirm={async () => {
            // Load the .srt file to create a fresh project (overwriting existing .sktproject)
            if (confirmOverwrite.srtFile) {
              await proceedWithFileLoad(confirmOverwrite.srtFile);
            }
          }}
        />
      </Layout>
    </div>
  );
};

export default SubtitleStudioPage;
