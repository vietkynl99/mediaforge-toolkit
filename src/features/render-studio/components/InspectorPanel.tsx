import React from 'react';
import { 
  Menu,
  ChevronDown,
  ChevronRight,
  Settings,
  Info,
  Trash2,
  Save,
  RotateCcw
} from 'lucide-react';
import { RenderTemplate } from '../../../types/index';

interface InspectorPanelProps {
  activeSection: 'timeline' | 'video' | 'audio' | 'subtitle' | 'text' | 'image';
  renderTemplates: RenderTemplate[];
  selectedTemplateId: string;
  isDirty: boolean;
  onTemplateChange: (id: string) => void;
  onReset: () => void;
  onSave: () => void;
  onDelete: (id: string, name: string) => void;
  // Sections content
  renderParamsDraft: any;
  updateParam: (section: string, key: string, value: any) => void;
  commitParam: (section: string, key: string) => void;
}

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  activeSection,
  renderTemplates,
  selectedTemplateId,
  isDirty,
  onTemplateChange,
  onReset,
  onSave,
  onDelete,
  renderParamsDraft,
  updateParam,
  commitParam
}) => {
  const selectedTemplate = renderTemplates.find(t => t.id === selectedTemplateId);

  return (
    <div className="w-80 border-l border-zinc-800 bg-zinc-900/30 flex flex-col overflow-hidden">
      <div className="h-12 border-b border-zinc-800 flex items-center px-4 bg-zinc-900/20">
        <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">Inspector</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        {/* Template Selector */}
        <div className="flex flex-col gap-2">
          <label className="text-[10px] text-zinc-500 uppercase tracking-widest">Template</label>
          <div className="flex gap-2">
            <select
              value={selectedTemplateId}
              onChange={(e) => onTemplateChange(e.target.value)}
              className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-lime-500/40"
            >
              <option value="custom">Custom Configuration</option>
              {renderTemplates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.id === selectedTemplateId && isDirty ? `* ${t.name}` : t.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Section Tabs - simplified for now */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
            <span className="text-xs font-bold text-zinc-100 capitalize">{activeSection} Settings</span>
            <div className="flex gap-1">
               <button onClick={onReset} className="p-1 hover:bg-zinc-800 rounded text-zinc-500" title="Reset">
                 <RotateCcw size={14} />
               </button>
               <button onClick={onSave} className="p-1 hover:bg-zinc-800 rounded text-zinc-500" title="Save">
                 <Save size={14} />
               </button>
            </div>
          </div>

          {/* Section Content Area */}
          <div className="flex flex-col gap-4">
            {activeSection === 'timeline' && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] text-zinc-500 uppercase">Resolution</label>
                  <select 
                    value={renderParamsDraft.timeline.resolution}
                    onChange={(e) => updateParam('timeline', 'resolution', e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200"
                  >
                    <option value="1920x1080">1920x1080 (16:9)</option>
                    <option value="1080x1920">1080x1920 (9:16)</option>
                  </select>
                </div>
                {/* More timeline settings... */}
              </div>
            )}

            {activeSection === 'video' && (
               <div className="flex flex-col gap-4">
                 <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] text-zinc-500 uppercase">Fit Mode</label>
                    <select 
                      value={renderParamsDraft.video.fit}
                      onChange={(e) => updateParam('video', 'fit', e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-200"
                    >
                      <option value="contain">Contain</option>
                      <option value="cover">Cover</option>
                      <option value="stretch">Stretch</option>
                    </select>
                 </div>
                 {/* More video settings... */}
               </div>
            )}
            
            <div className="text-[10px] text-zinc-600 italic">
              More settings in progress...
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
