import React from 'react';
import { Scissors, Combine, Languages, Clapperboard, Wrench } from 'lucide-react';

interface ToolsPageProps {
  onOpenTool?: (tool: 'split-srt' | 'combine-srt' | 'subtitle-studio' | 'render-studio') => void;
}

interface ToolCardProps {
  icon: any;
  title: string;
  description: string;
  category: 'subtitle' | 'edit';
  onClick: () => void;
}

const ToolCard: React.FC<ToolCardProps> = ({ icon: Icon, title, description, category, onClick }) => {
  const categoryColors = {
    subtitle: 'bg-blue-500/10 text-blue-400 border-blue-500/20 hover:border-blue-500/40',
    edit: 'bg-purple-500/10 text-purple-400 border-purple-500/20 hover:border-purple-500/40'
  };

  return (
    <button
      onClick={onClick}
      className={`w-full bg-zinc-900 border rounded-xl p-4 text-left transition-all group hover:scale-[1.02] ${categoryColors[category]}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-transform group-hover:scale-110 ${
        category === 'subtitle' ? 'bg-blue-500/20' : 'bg-purple-500/20'
      }`}>
        <Icon size={18} />
      </div>
      <h3 className="text-base font-bold text-zinc-100 mb-1">{title}</h3>
      <p className="text-xs text-zinc-500 line-clamp-2">{description}</p>
      <div className="mt-3 flex items-center gap-2">
        <span className={`text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-lg ${
          category === 'subtitle' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300'
        }`}>
          {category === 'subtitle' ? 'Subtitle' : 'Edit'}
        </span>
      </div>
    </button>
  );
};

const ToolsPage: React.FC<ToolsPageProps> = ({ onOpenTool }) => {
  const tools = [
    {
      id: 'split-srt' as const,
      icon: Scissors,
      title: 'Split SRT',
      description: 'Split an SRT file into multiple parts by duration, segment count, or manual markers.',
      category: 'subtitle' as const
    },
    {
      id: 'combine-srt' as const,
      icon: Combine,
      title: 'Combine SRT',
      description: 'Merge multiple SRT files into a single output with proper timing adjustment.',
      category: 'subtitle' as const
    },
    {
      id: 'subtitle-studio' as const,
      icon: Languages,
      title: 'Subtitle Studio',
      description: 'Advanced subtitle editor with AI translation, optimization, and quality analysis.',
      category: 'subtitle' as const
    },
    {
      id: 'render-studio' as const,
      icon: Clapperboard,
      title: 'Render Studio',
      description: 'Professional video editor with multi-track timeline and rendering capabilities.',
      category: 'edit' as const
    }
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 bg-lime-500/10 text-lime-500 rounded-xl flex items-center justify-center">
            <Wrench size={20} />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">Tools</h1>
        </div>
        <p className="text-zinc-500">Select a tool to get started with subtitle editing or video processing.</p>
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {tools.map((tool) => (
          <ToolCard
            key={tool.id}
            icon={tool.icon}
            title={tool.title}
            description={tool.description}
            category={tool.category}
            onClick={() => onOpenTool?.(tool.id)}
          />
        ))}
      </div>

    </div>
  );
};

export default ToolsPage;
