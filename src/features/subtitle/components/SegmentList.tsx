import React from 'react';
import { SubtitleSegment, SubtitleSeverity } from '../types';
import { ConfirmModal } from '../../../components/ConfirmModal';

interface SegmentListProps {
  segments: SubtitleSegment[];
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onUpdateText: (id: number, text: string) => void;
  onCommitText?: (id: number, text: string, prevText?: string) => void;
  onUpdateTime: (id: number, field: 'startTime' | 'endTime', value: string) => void;
  onShowOptimizeHistory?: (id: number) => void;
  onDeleteSegment?: (id: number) => void;
  onGoToSegment?: (id: number) => void;
  focusSegmentId?: number | null;
  onFocusDone?: (id: number) => void;
  currentPage?: number;
  searchQuery?: string;
  searchCaseSensitive?: boolean;
  searchWholeWord?: boolean;
  searchRegexMode?: boolean;
  filter?: string;
  disabled?: boolean; // Disable editing during translation/optimization
  isTranslating?: boolean; // Show loading for untranslated segments
}

const UPDATE_DEBOUNCE_MS = 300;

export const SegmentList: React.FC<SegmentListProps> = ({
  segments,
  selectedIds,
  onToggleSelect,
  onUpdateText,
  onCommitText,
  onUpdateTime,
  onShowOptimizeHistory,
  onDeleteSegment,
  onGoToSegment,
  focusSegmentId,
  onFocusDone,
  currentPage = 1,
  searchQuery = '',
  searchCaseSensitive = false,
  searchWholeWord = false,
  searchRegexMode = false,
  filter = 'all',
  disabled = false,
  isTranslating = false
}) => {
  const [editingTranslationId, setEditingTranslationId] = React.useState<number | null>(null);
  const [editingTime, setEditingTime] = React.useState<{ id: number; field: 'startTime' | 'endTime' } | null>(null);
  const [localText, setLocalText] = React.useState<Record<number, string>>({});
  const [highlightedId, setHighlightedId] = React.useState<number | null>(null);
  const [contextMenu, setContextMenu] = React.useState<{ x: number; y: number; segmentId: number } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = React.useState<number | null>(null);
  const translationTextareaRefs = React.useRef<Record<number, HTMLTextAreaElement | null>>({});
  const segmentRowRefs = React.useRef<Record<number, HTMLDivElement | null>>({});
  const pendingUpdateRef = React.useRef<Map<number, number>>(new Map());
  const editStartTextRef = React.useRef<Record<number, string>>({});
  const listContainerRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    listContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [currentPage]);

  const getSeverityClasses = (severity: SubtitleSeverity) => {
    switch (severity) {
      case 'critical':
        return { text: 'text-rose-400', bg: 'bg-rose-500' };
      case 'warning':
        return { text: 'text-amber-400', bg: 'bg-amber-500' };
      case 'safe':
      default:
        return { text: 'text-emerald-400', bg: 'bg-emerald-500' };
    }
  };

  const pagedSegments = segments;

  const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const buildSearchRegex = (query: string): RegExp | null => {
    const q = query.trim();
    if (!q) return null;
    const basePattern = searchRegexMode ? q : escapeRegExp(q);
    const wrappedPattern = searchWholeWord
      ? `(?<![\\p{L}\\p{N}\\p{M}_])(?:${basePattern})(?![\\p{L}\\p{N}\\p{M}_])`
      : basePattern;
    const flags = `${searchCaseSensitive ? '' : 'i'}u`;
    try {
      return new RegExp(wrappedPattern, flags);
    } catch {
      return null;
    }
  };

  const renderHighlightedText = (text: string, query: string) => {
    const regex = buildSearchRegex(query);
    if (!regex || !text) return text;

    const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`;
    const globalRegex = new RegExp(regex.source, flags);
    const nodes: React.ReactNode[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = globalRegex.exec(text)) !== null) {
      const start = match.index;
      const matched = match[0];

      if (matched.length === 0) {
        globalRegex.lastIndex += 1;
        continue;
      }

      if (start > lastIdx) {
        nodes.push(<React.Fragment key={`t-${start}`}>{text.slice(lastIdx, start)}</React.Fragment>);
      }

      nodes.push(
        <mark key={`m-${start}`} className="bg-amber-300/30 text-amber-100 rounded-sm px-0">
          {matched}
        </mark>
      );
      lastIdx = start + matched.length;
    }

    if (lastIdx < text.length) {
      nodes.push(<React.Fragment key={`t-end`}>{text.slice(lastIdx)}</React.Fragment>);
    }

    return nodes.length > 0 ? <>{nodes}</> : text;
  };

  const resizeTranslationTextarea = (el: HTMLTextAreaElement) => {
    const styles = window.getComputedStyle(el);
    const lineHeight = Number.parseFloat(styles.lineHeight) || 18;
    const paddingTop = Number.parseFloat(styles.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(styles.paddingBottom) || 0;
    const maxHeight = (lineHeight * 2) + paddingTop + paddingBottom;

    el.style.height = 'auto';
    const nextHeight = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };

  React.useEffect(() => {
    (Object.values(translationTextareaRefs.current) as Array<HTMLTextAreaElement | null>).forEach((el) => {
      if (el) resizeTranslationTextarea(el);
    });
  }, [pagedSegments, editingTranslationId, searchQuery]);

  React.useEffect(() => {
    if (!focusSegmentId) return;
    const existsOnPage = pagedSegments.some(seg => seg.id === focusSegmentId);
    if (!existsOnPage) return;
    const row = segmentRowRefs.current[focusSegmentId];
    if (!row) return;
    row.scrollIntoView({ block: 'center', behavior: 'auto' });
    row.focus({ preventScroll: true });
    setHighlightedId(focusSegmentId);
    onFocusDone?.(focusSegmentId);
  }, [focusSegmentId, onFocusDone, pagedSegments, currentPage]);

  React.useEffect(() => {
    if (highlightedId == null) return;
    const timer = window.setTimeout(() => setHighlightedId(null), 1000);
    return () => window.clearTimeout(timer);
  }, [highlightedId]);

  React.useEffect(() => {
    setHighlightedId(null);
  }, [filter]);

  // Close context menu when clicking elsewhere
  React.useEffect(() => {
    if (!contextMenu) return;
    const handleClose = () => setContextMenu(null);
    window.addEventListener('click', handleClose);
    window.addEventListener('contextmenu', handleClose);
    return () => {
      window.removeEventListener('click', handleClose);
      window.removeEventListener('contextmenu', handleClose);
    };
  }, [contextMenu]);

  const scheduleUpdate = React.useCallback((id: number, text: string) => {
    const existing = pendingUpdateRef.current.get(id);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      pendingUpdateRef.current.delete(id);
      onUpdateText(id, text);
    }, UPDATE_DEBOUNCE_MS);
    pendingUpdateRef.current.set(id, timer);
  }, [onUpdateText]);

  const flushUpdate = React.useCallback((id: number, text: string) => {
    const existing = pendingUpdateRef.current.get(id);
    if (existing) window.clearTimeout(existing);
    pendingUpdateRef.current.delete(id);
    if (onCommitText) {
      onCommitText(id, text, editStartTextRef.current[id]);
    } else {
      onUpdateText(id, text);
    }
  }, [onUpdateText, onCommitText]);

  React.useEffect(() => {
    setLocalText(prev => {
      let changed = false;
      const next = { ...prev };
      pagedSegments.forEach(seg => {
        if (editingTranslationId === seg.id) return;
        const value = seg.translatedText || '';
        if (next[seg.id] !== value) {
          next[seg.id] = value;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [pagedSegments, editingTranslationId]);

  React.useEffect(() => {
    return () => {
      for (const timer of pendingUpdateRef.current.values()) {
        window.clearTimeout(timer);
      }
      pendingUpdateRef.current.clear();
    };
  }, []);

  const idSearchQuery = searchQuery.trim().startsWith('#') ? searchQuery.trim().slice(1).trim() : '';

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-950/50 h-full">
      <div ref={listContainerRef} className="flex-1 overflow-y-auto overflow-x-auto p-2 no-scrollbar">
        <div className="min-w-[840px] sm:min-w-[920px]">
          <div className="grid grid-cols-[28px_54px_130px_minmax(220px,0.9fr)_minmax(420px,1.6fr)] gap-2 px-3 py-2 mb-2 bg-slate-900 border border-slate-800 rounded-xl text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <div className="text-center">Sel</div>
            <div>#</div>
            <div>Time</div>
            <div>CN (Original)</div>
            <div className="flex items-center justify-between">
              <span>VN (Translation)</span>
              <span>CPS</span>
            </div>
          </div>

          <div className="space-y-2">
            {pagedSegments.map((seg) => {
              const colors = getSeverityClasses(seg.severity);
              const isSelected = selectedIds.has(seg.id);
              const hasTimelineIssue = seg.issueList.some(issue => issue.toLowerCase().includes('timeline overlap'));
              const hasInvalidTimingIssue = seg.issueList.some(issue => issue.toLowerCase().includes('start time is after end time'));
              const hasOriginLangIssue = seg.issueList.some(issue => issue.toLowerCase().includes('original contains non-chinese characters'));
              const hasTranslatedLangIssue = seg.issueList.some(issue => issue.toLowerCase().includes('translation contains non-vietnamese characters'));
              const optimizeCount = seg.optimizeHistory?.length || 0;
              const displayedTranslation = localText[seg.id] ?? (seg.translatedText || '');

              return (
                <div
                  key={seg.id}
                  ref={(el) => {
                    segmentRowRefs.current[seg.id] = el;
                  }}
                  tabIndex={-1}
                  className={`grid grid-cols-[28px_54px_130px_minmax(220px,0.9fr)_minmax(340px,1.4fr)_92px] gap-2 items-start px-3 py-2 bg-slate-900 border rounded-xl transition-all outline-none select-none ${
                    isSelected
                      ? 'border-lime-500 ring-1 ring-lime-500/20'
                      : 'border-slate-800 hover:border-slate-700'
                  } ${highlightedId === seg.id ? 'ring-2 ring-lime-400/70 border-lime-400/70 bg-lime-500/10' : ''}`}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({ x: e.clientX, y: e.clientY, segmentId: seg.id });
                  }}
                >
                  <div className="pt-2 flex justify-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onToggleSelect(seg.id)}
                      className="w-4 h-4 bg-slate-800 border-slate-700 rounded text-lime-500 focus:ring-lime-500 focus:ring-offset-slate-900 cursor-pointer"
                    />
                  </div>

                  <div className="pt-1">
                    <span className="inline-flex px-2 py-0.5 bg-slate-800 rounded-md text-[10px] font-bold font-mono text-slate-300 select-text">
                      #{idSearchQuery ? renderHighlightedText(seg.id.toString(), idSearchQuery) : seg.id.toString()}
                    </span>
                  </div>

                  <div className={`pt-1 text-[11px] font-bold font-mono leading-tight rounded-md px-1.5 py-1 ${
                    hasTimelineIssue || hasInvalidTimingIssue
                      ? 'text-rose-300 bg-rose-500/10 border border-rose-500/30'
                      : 'text-slate-500'
                  }`}>
                    {editingTime?.id === seg.id && editingTime.field === 'startTime' ? (
                      <input
                        type="text"
                        value={seg.startTime}
                        onChange={(e) => onUpdateTime(seg.id, 'startTime', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => setEditingTime(null)}
                        autoFocus
                        className="w-full bg-transparent border-none outline-none text-[11px] font-bold font-mono leading-tight select-text"
                        placeholder="00:00:00,000"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTime({ id: seg.id, field: 'startTime' });
                        }}
                        className="w-full text-left bg-transparent border-none p-0"
                        title="Click to edit start time"
                      >
                        {renderHighlightedText(seg.startTime, searchQuery)}
                      </button>
                    )}
                    {editingTime?.id === seg.id && editingTime.field === 'endTime' ? (
                      <input
                        type="text"
                        value={seg.endTime}
                        onChange={(e) => onUpdateTime(seg.id, 'endTime', e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => setEditingTime(null)}
                        autoFocus
                        className="w-full bg-transparent border-none outline-none text-[11px] font-bold font-mono leading-tight select-text"
                        placeholder="00:00:00,000"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTime({ id: seg.id, field: 'endTime' });
                        }}
                        className="w-full text-left bg-transparent border-none p-0"
                        title="Click to edit end time"
                      >
                        {renderHighlightedText(seg.endTime, searchQuery)}
                      </button>
                    )}
                  </div>

                  <div className="pt-1">
                    <p
                      className={`text-[13px] leading-snug font-medium whitespace-pre-wrap break-words select-text ${
                        hasOriginLangIssue
                          ? 'text-rose-100 underline decoration-rose-400 decoration-wavy underline-offset-2'
                          : 'text-slate-300'
                      }`}
                    >
                      {seg.originalText ? renderHighlightedText(seg.originalText, searchQuery) : <span className="text-slate-700 italic text-sm">No original text</span>}
                    </p>
                  </div>

                  <div className="pt-0.5">
                    {(() => {
                      // Show loading indicator for untranslated segments during translation
                      if (isTranslating && !displayedTranslation) {
                        return (
                          <div className="flex items-center gap-2 text-slate-400">
                            <div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                            <span className="text-xs italic">Translating...</span>
                          </div>
                        );
                      }

                      // When disabled, show read-only text
                      if (disabled) {
                        return (
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div
                                className={`text-[13px] font-semibold leading-snug whitespace-pre-wrap break-words min-h-[20px] ${
                                  hasTranslatedLangIssue
                                    ? 'text-rose-100 underline decoration-rose-400 decoration-wavy underline-offset-2'
                                    : 'text-blue-100'
                                }`}
                              >
                                {displayedTranslation || <span className="text-slate-700 italic">No translation yet...</span>}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      if (searchQuery.trim() && editingTranslationId !== seg.id) {
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTranslationId(seg.id);
                            }}
                            className="w-full text-left bg-transparent border-none p-0"
                            title="Click to edit translation"
                          >
                            <div className="flex items-start gap-2">
                              <div className="flex-1 min-w-0">
                                <div
                                  className={`text-[13px] font-semibold leading-snug whitespace-pre-wrap break-words min-h-[20px] ${
                                    hasTranslatedLangIssue
                                      ? 'text-rose-100 underline decoration-rose-400 decoration-wavy underline-offset-2'
                                      : 'text-blue-100'
                                  }`}
                                >
                                  {displayedTranslation
                                    ? renderHighlightedText(displayedTranslation, searchQuery)
                                    : <span className="text-slate-700 italic">No translation yet...</span>}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      }

                      return (
                        <>
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <textarea
                                ref={(el) => {
                                  translationTextareaRefs.current[seg.id] = el;
                                  if (el) resizeTranslationTextarea(el);
                                }}
                                className={`w-full bg-transparent border-none outline-none resize-none text-[13px] font-semibold leading-snug placeholder:text-slate-700 placeholder:italic select-text ${
                                  hasTranslatedLangIssue
                                    ? 'text-rose-100 underline decoration-rose-400 decoration-wavy underline-offset-2'
                                    : 'text-blue-100'
                                }`}
                                placeholder="No translation yet..."
                                rows={1}
                                value={displayedTranslation}
                                onChange={(e) => {
                                  const nextValue = e.target.value;
                                  setLocalText(prev => ({ ...prev, [seg.id]: nextValue }));
                                  resizeTranslationTextarea(e.currentTarget);
                                }}
                                onKeyDown={(e) => {
                                  // Enter (without Shift) commits the edit, Shift+Enter adds newline
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    e.currentTarget.blur();
                                  }
                                }}
                                onFocus={() => {
                                  editStartTextRef.current[seg.id] = displayedTranslation;
                                  setEditingTranslationId(seg.id);
                                }}
                                autoFocus={editingTranslationId === seg.id}
                                onBlur={() => {
                                  flushUpdate(seg.id, localText[seg.id] ?? displayedTranslation);
                                  delete editStartTextRef.current[seg.id];
                                  setEditingTranslationId(null);
                                }}
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  <div className="pt-1 flex items-center justify-end gap-2">
                    {optimizeCount > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onShowOptimizeHistory?.(seg.id);
                        }}
                        className="px-1.5 py-0.5 rounded-full text-[9px] font-bold tracking-normal bg-lime-500/15 text-lime-200 border border-lime-500/30 hover:bg-lime-500/25 transition"
                        title="View optimization history"
                      >
                        optimized
                      </button>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold font-mono ${colors.text}`}>
                        {seg.cps.toFixed(1)}
                      </span>
                      <div className={`w-2 h-2 rounded-full ${colors.bg}`} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {segments.length === 0 && (
          <div className="p-12 text-center border-2 border-dashed border-slate-800 rounded-3xl">
            <p className="text-sm text-slate-500 italic">No segments match the current filter.</p>
          </div>
        )}
      </div>

      {/* Segment Context Menu */}
      {contextMenu && (onDeleteSegment || onGoToSegment) && (
        <div
          className="fixed z-[700] bg-slate-900 border border-slate-800 rounded-xl shadow-2xl py-2 w-48 animate-in fade-in zoom-in duration-100"
          style={{
            left: Math.min(contextMenu.x, window.innerWidth - 200),
            top: Math.min(contextMenu.y, window.innerHeight - (onDeleteSegment && onGoToSegment ? 90 : 60))
          }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1 mb-1 border-b border-slate-800">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
              Segment #{contextMenu.segmentId}
            </p>
          </div>
          {onGoToSegment && (
            <button
              onClick={() => {
                onGoToSegment(contextMenu.segmentId);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-lime-400 hover:bg-lime-500/10 transition-colors text-left"
            >
              Go to this segment
            </button>
          )}
          {onDeleteSegment && (
            <button
              onClick={() => {
                setPendingDeleteId(contextMenu.segmentId);
                setContextMenu(null);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors text-left"
            >
              Delete segment
            </button>
          )}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={pendingDeleteId !== null}
        title="Delete Segment"
        description={`Are you sure you want to delete segment #${pendingDeleteId}? This action cannot be undone.`}
        confirmLabel="Delete"
        variant="danger"
        onClose={() => setPendingDeleteId(null)}
        onConfirm={() => {
          if (pendingDeleteId !== null && onDeleteSegment) {
            onDeleteSegment(pendingDeleteId);
          }
          setPendingDeleteId(null);
        }}
      />
    </div>
  );
};

export default SegmentList;
