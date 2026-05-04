import React, { useState, useEffect } from 'react';
import { X, Upload, Wand2, FileText, Trash2 } from 'lucide-react';
import { TranslationPreset } from '../types';

interface PresetPageProps {
  preset: TranslationPreset | null;
  onAnalyze: (input: string) => void;
  onImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onUpdatePreset: (newPreset: TranslationPreset) => void;
  isLoading: boolean;
  fileName: string;
  displayFileName: string;
  totalSegments: number;
  totalDuration: string;
  draftSummary: string;
  onDraftSummaryChange: (value: string) => void;
}

const TagChip: React.FC<{ label: string; onRemove: () => void }> = ({ label, onRemove }) => (
  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-800 border border-slate-700 rounded-lg text-[11px] font-semibold text-slate-200 animate-in zoom-in duration-200">
    <span className="truncate max-w-[180px]">{label}</span>
    <button
      onClick={onRemove}
      className="text-slate-500 hover:text-rose-400 transition-colors leading-none"
      title="Remove tag"
      aria-label="Remove tag"
      type="button"
    >
      x
    </button>
  </span>
);

const getNextCharacterId = (list: { id: number }[]): number => {
  if (list.length === 0) return 1;
  const maxId = Math.max(...list.map(t => t.id));
  return maxId + 1;
};

export const PresetPage: React.FC<PresetPageProps> = ({
  preset,
  onAnalyze,
  onImport,
  onUpdatePreset,
  isLoading,
  fileName,
  displayFileName,
  totalSegments,
  totalDuration,
  draftSummary,
  onDraftSummaryChange
}) => {
  const [titleInput, setTitleInput] = useState('');
  const [genreInput, setGenreInput] = useState('');
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    if (draftSummary !== titleInput) {
      setTitleInput(draftSummary);
    }
  }, [draftSummary, titleInput]);

  const handleAddTag = (type: 'genres', value: string) => {
    if (!preset) return;
    const cleanValue = value.trim();
    if (!cleanValue) return;

    if (preset[type].length >= 5) {
      setWarning('Maximum 5 genres.');
      return;
    }

    if (preset[type].includes(cleanValue)) {
      setGenreInput('');
      return;
    }

    onUpdatePreset({
      ...preset,
      [type]: [...preset[type], cleanValue]
    });

    setGenreInput('');
    setWarning(null);
  };

  const handleRemoveTag = (type: 'genres', index: number) => {
    if (!preset) return;
    const newList = [...preset[type]];
    newList.splice(index, 1);
    onUpdatePreset({ ...preset, [type]: newList });
    setWarning(null);
  };

  const handleHumorChange = (val: number) => {
    if (!preset || isLoading) return;
    onUpdatePreset({ ...preset, humor_level: val });
  };

  const handleAddCharacter = () => {
    if (!preset || isLoading) return;
    const list = preset.character_names || [];
    const nextId = getNextCharacterId(list);
    onUpdatePreset({
      ...preset,
      character_names: [...list, { id: nextId, cn: "", vn: "" }]
    });
  };

  const handleUpdateCharacter = (index: number, field: "cn" | "vn", value: string) => {
    if (!preset || isLoading) return;
    const list = preset.character_names || [];
    const next = [...list];
    next[index] = { ...next[index], [field]: value };
    onUpdatePreset({ ...preset, character_names: next });
  };

  const handleRemoveCharacter = (index: number) => {
    if (!preset || isLoading) return;
    const list = preset.character_names || [];
    const next = [...list];
    next.splice(index, 1);
    onUpdatePreset({ ...preset, character_names: next });
  };

  const handleAnalyzeClick = () => {
    if (!titleInput.trim()) return;
    onAnalyze(titleInput);
  };

  if (!fileName) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 bg-slate-950">
        <div className="w-full max-w-lg text-center space-y-6">
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-slate-900 border border-slate-800 rounded-3xl flex items-center justify-center mx-auto text-slate-700">
            <Wand2 size={32} />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-200">No Project Loaded</h2>
          <p className="text-slate-500 text-sm sm:text-base">Please upload an SRT file before configuring the Translation Preset.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 sm:p-7 overflow-y-auto bg-slate-950 no-scrollbar pb-16">
      <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in duration-500">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 sm:gap-5 items-stretch">
          <div className="bg-slate-900 border border-slate-800 rounded-[18px] sm:rounded-[22px] p-4 sm:p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-lime-600/10 text-lime-400 rounded-lg shrink-0">
                <FileText size={18} />
              </div>
              <div className="overflow-hidden">
                <div className="text-sm font-bold text-slate-100 truncate">{displayFileName}</div>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  <span>{totalSegments} segments</span>
                  <span className="hidden sm:inline w-1 h-1 rounded-full bg-slate-700"></span>
                  <span>{totalDuration}</span>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.08em] opacity-60 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Title / Summary
              </h3>
              <textarea
                placeholder="Enter a title or plot summary for the AI to analyze the style..."
                value={titleInput}
                onChange={(e) => {
                  const next = e.target.value;
                  setTitleInput(next);
                  onDraftSummaryChange(next);
                }}
                disabled={isLoading}
                className="w-full min-h-[160px] bg-slate-800 border border-slate-700 focus:border-lime-500/50 outline-none p-3.5 sm:p-4 rounded-2xl text-slate-100 text-[13px] sm:text-[14px] leading-relaxed resize-none font-medium transition-colors"
              />
              <button
                onClick={handleAnalyzeClick}
                disabled={isLoading || !titleInput.trim()}
                className="w-full py-2.5 sm:py-3 bg-lime-600 hover:bg-lime-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-2xl transition-all shadow-md shadow-lime-600/20 flex items-center justify-center gap-3 text-[13px] sm:text-[14px]"
              >
                {isLoading ? (
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <Wand2 size={18} />
                )}
                Analyze
              </button>
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-[20px] sm:rounded-[26px] p-4 sm:p-6 space-y-5 sm:space-y-6 shadow-lg flex flex-col relative overflow-hidden">
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.08em] opacity-60 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-lime-500"></span> STYLE CONFIGS
              </h3>
              {warning && (
                <span className="text-[9px] font-bold text-rose-500 uppercase tracking-widest animate-pulse">
                  {warning}
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center space-y-3 animate-in fade-in duration-300">
                <div className="w-8 h-8 border-3 border-lime-500/20 border-t-lime-500 rounded-full animate-spin"></div>
                <div className="text-[12px] font-medium text-slate-400">AI is analyzing style DNA...</div>
              </div>
            ) : preset ? (
              <div className="space-y-3 flex-1 animate-in fade-in duration-500">
                <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
                  <div className="flex items-center gap-2 text-[9px] text-slate-500 font-bold uppercase tracking-[0.08em] opacity-70">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Genres (Max 5)
                  </div>
                  <div className="flex flex-wrap gap-2 min-h-[36px] p-2 bg-slate-900 border border-slate-700 rounded-xl focus-within:border-lime-500/40 transition-colors">
                    {preset.genres.map((g, idx) => (
                      <TagChip key={g} label={g} onRemove={() => handleRemoveTag('genres', idx)} />
                    ))}
                    <input
                      type="text"
                      placeholder={preset.genres.length < 5 ? 'Add genre and press Enter...' : ''}
                      value={genreInput}
                      onChange={(e) => setGenreInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTag('genres', genreInput)}
                      disabled={preset.genres.length >= 5}
                      className="bg-transparent border-none outline-none text-[12px] text-slate-300 placeholder:text-slate-600 flex-1 min-w-[160px]"
                    />
                  </div>
                </div>

                <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[9px] text-slate-500 font-bold uppercase tracking-[0.08em] opacity-70">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span> Humor Intensity
                    </div>
                    <div className="text-[13px] font-semibold text-slate-200">{preset.humor_level} <span className="text-[9px] text-slate-500 font-medium">/ 10</span></div>
                  </div>

                  <div className="space-y-1.5">
                    <input
                      type="range"
                      min="0"
                      max="10"
                      value={preset.humor_level}
                      onChange={(e) => handleHumorChange(Number(e.target.value))}
                      disabled={isLoading}
                      className="w-full h-[3px] bg-slate-800 rounded-full appearance-none accent-lime-500 cursor-pointer focus:ring-4 focus:ring-lime-500/10 custom-range-slider"
                    />
                    <div className="flex justify-between text-[9px] font-bold text-slate-500 opacity-50 uppercase tracking-widest">
                      <span>Serious (0-2)</span>
                      <span>Comedic (9-10)</span>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 bg-slate-900/60 border border-slate-800 rounded-2xl space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-[9px] text-slate-500 font-bold uppercase tracking-[0.08em] opacity-70">
                      <span className="w-1.5 h-1.5 rounded-full bg-lime-500"></span> Character Name Normalization
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="grid grid-cols-12 gap-y-2 gap-x-2 text-[9px] font-bold text-slate-600 uppercase tracking-widest">
                      <div className="col-span-5">Chinese Name</div>
                      <div className="col-span-5">Vietnamese Name (Canonical)</div>
                      <div className="col-span-2"></div>
                    </div>
                    {(preset.character_names || []).length > 0 && (
                      <div className="space-y-2">
                        {(preset.character_names || []).map((t, idx) => (
                          <div key={t.id} className="grid grid-cols-12 gap-y-2 gap-x-2">
                            <input
                              type="text"
                              placeholder="Chinese name..."
                              value={t.cn}
                              onChange={(e) => handleUpdateCharacter(idx, "cn", e.target.value)}
                              disabled={isLoading}
                              className="col-span-5 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-200 outline-none focus:border-lime-500/50 transition-colors"
                            />
                            <input
                              type="text"
                              placeholder="Vietnamese name..."
                              value={t.vn}
                              onChange={(e) => handleUpdateCharacter(idx, "vn", e.target.value)}
                              disabled={isLoading}
                              className="col-span-5 bg-slate-900 border border-slate-700 rounded-xl px-2.5 py-1.5 text-[11px] text-slate-200 outline-none focus:border-lime-500/50 transition-colors"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveCharacter(idx)}
                              disabled={isLoading}
                              className="col-span-2 w-full bg-slate-800 hover:bg-rose-500/20 text-rose-400 rounded-xl flex items-center justify-center transition-colors"
                              aria-label="Remove row"
                              title="Remove row"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleAddCharacter}
                      disabled={isLoading}
                      className="w-7 h-7 flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-full text-[14px] font-bold transition-colors"
                      aria-label="Add row"
                      title="Add row"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center space-y-3 text-center p-5">
                <div className="p-3 bg-slate-800 rounded-2xl text-slate-600">
                  <Wand2 size={24} />
                </div>
                <p className="text-[12px] text-slate-500 italic">Enter a title/summary and click Analyze to get started.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      <style>{`
        .custom-range-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          background: #3b82f6;
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .custom-range-slider::-moz-range-thumb {
          width: 14px;
          height: 14px;
          background: #3b82f6;
          border-radius: 50%;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .custom-range-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }
      `}</style>
    </div>
  );
};

export default PresetPage;
