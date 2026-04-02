import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Hammer, 
  Database, 
  Settings, 
  Terminal, 
  Play, 
  Pause, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  ChevronRight,
  MoreVertical,
  Download,
  Trash2,
  RefreshCw,
  Cpu,
  Activity,
  HardDrive,
  Plus,
  FileVideo,
  FileAudio,
  Type,
  Languages,
  Scissors,
  Search,
  Filter
} from 'lucide-react';
import { MOCK_JOBS, NODE_ICONS, MediaJob, JobStatus } from './types';

// --- Components ---

const SidebarItem = ({ icon: Icon, label, active, onClick }: { icon: any, label: string, active?: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={`flex items-center w-full gap-3 px-4 py-3 transition-colors rounded-lg group ${
      active ? 'bg-lime-500/10 text-lime-400' : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
    }`}
  >
    <Icon size={20} className={active ? 'text-lime-400' : 'group-hover:text-zinc-100'} />
    <span className="text-sm font-medium">{label}</span>
  </button>
);

const StatusBadge = ({ status }: { status: JobStatus }) => {
  const configs = {
    queued: { icon: Clock, color: 'text-zinc-400 bg-zinc-400/10', label: 'Queued' },
    processing: { icon: RefreshCw, color: 'text-blue-400 bg-blue-400/10', label: 'Processing' },
    awaiting_input: { icon: AlertCircle, color: 'text-amber-400 bg-amber-400/10', label: 'Awaiting Review' },
    completed: { icon: CheckCircle2, color: 'text-lime-400 bg-lime-400/10', label: 'Completed' },
    failed: { icon: AlertCircle, color: 'text-red-400 bg-red-400/10', label: 'Failed' },
  };
  const config = configs[status];
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider ${config.color}`}>
      <Icon size={12} className={status === 'processing' ? 'animate-spin-soft' : ''} />
      {config.label}
    </div>
  );
};

const JobRow = ({ job }: { job: MediaJob }) => (
  <motion.div 
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    className="grid grid-cols-[1fr_auto_150px_120px_auto] items-center gap-4 p-4 border-b border-zinc-800 hover:bg-zinc-800/30 transition-colors group"
  >
    <div className="flex flex-col gap-1 overflow-hidden">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-zinc-100 truncate">{job.name}</span>
        <span className="text-[10px] text-zinc-500 font-mono bg-zinc-800 px-1.5 py-0.5 rounded uppercase">{job.id}</span>
      </div>
      <span className="text-xs text-zinc-500 truncate">{job.fileName} • {job.fileSize}</span>
    </div>

    <div className="flex items-center gap-1.5 px-4">
      {job.nodes.map((node, i) => {
        const Icon = NODE_ICONS[node.type];
        return (
          <React.Fragment key={node.id}>
            <div 
              title={node.name}
              className={`p-1.5 rounded-md ${
                node.status === 'done' ? 'bg-lime-500/20 text-lime-400' : 
                node.status === 'active' ? 'bg-blue-500/20 text-blue-400 animate-pulse' : 
                'bg-zinc-800 text-zinc-600'
              }`}
            >
              <Icon size={14} />
            </div>
            {i < job.nodes.length - 1 && <ChevronRight size={12} className="text-zinc-700" />}
          </React.Fragment>
        );
      })}
    </div>

    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[10px] font-mono text-zinc-400">
        <span>{job.progress}%</span>
        <span>{job.eta || '--'}</span>
      </div>
      <div className="h-1 w-full bg-zinc-800 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${job.progress}%` }}
          className={`h-full ${job.status === 'failed' ? 'bg-red-500' : 'bg-lime-500'}`}
        />
      </div>
    </div>

    <div className="flex justify-center">
      <StatusBadge status={job.status} />
    </div>

    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <button className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 rounded-md"><Play size={16} /></button>
      <button className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 rounded-md"><Download size={16} /></button>
      <button className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-400/10 rounded-md"><Trash2 size={16} /></button>
    </div>
  </motion.div>
);

// --- Main App ---

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-300 font-sans selection:bg-lime-500/30 selection:text-lime-200">
      {/* Sidebar Navigation Rail */}
      <aside className="w-64 border-r border-zinc-800 flex flex-col p-4 gap-6">
        <div className="flex items-center gap-3 px-2 mb-2">
          <div className="w-8 h-8 bg-lime-500 rounded-lg flex items-center justify-center text-zinc-950 font-black italic">MF</div>
          <h1 className="text-lg font-bold text-zinc-100 tracking-tight">MediaForge</h1>
        </div>

        <nav className="flex flex-col gap-1 flex-1">
          <SidebarItem 
            icon={LayoutDashboard} 
            label="Dashboard" 
            active={activeTab === 'dashboard'} 
            onClick={() => setActiveTab('dashboard')} 
          />
          <SidebarItem 
            icon={Hammer} 
            label="Pipeline Forge" 
            active={activeTab === 'forge'} 
            onClick={() => setActiveTab('forge')} 
          />
          <SidebarItem 
            icon={Database} 
            label="Media Vault" 
            active={activeTab === 'vault'} 
            onClick={() => setActiveTab('vault')} 
          />
          <div className="my-4 border-t border-zinc-800/50" />
          <SidebarItem 
            icon={Settings} 
            label="Settings" 
            active={activeTab === 'settings'} 
            onClick={() => setActiveTab('settings')} 
          />
          <SidebarItem 
            icon={Terminal} 
            label="System Logs" 
            active={activeTab === 'logs'} 
            onClick={() => setActiveTab('logs')} 
          />
        </nav>

        {/* System Health */}
        <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800 flex flex-col gap-3">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-zinc-500">
            <span>System Health</span>
            <Activity size={12} className="text-lime-500" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-zinc-400"><Cpu size={12} /> CPU</div>
              <span className="font-mono text-zinc-200">42%</span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-lime-500 w-[42%]" />
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-zinc-400"><HardDrive size={12} /> Disk</div>
              <span className="font-mono text-zinc-200">1.2 TB</span>
            </div>
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 w-[68%]" />
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header / Search */}
        <header className="h-16 border-b border-zinc-800 flex items-center justify-between px-8 bg-zinc-950/50 backdrop-blur-md z-10">
          <div className="flex items-center gap-4 flex-1 max-w-xl relative">
            <Search size={18} className="absolute left-3 text-zinc-500" />
            <input 
              type="text" 
              placeholder="Search jobs, files, or pipelines..."
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-lime-500/50 transition-colors"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 rounded-lg transition-colors">
              <Filter size={18} />
              Filter
            </button>
            <button 
              onClick={() => setActiveTab('forge')}
              className="flex items-center gap-2 px-4 py-2 bg-lime-500 text-zinc-950 rounded-lg font-bold text-sm hover:bg-lime-400 transition-colors shadow-lg shadow-lime-500/10"
            >
              <Plus size={18} strokeWidth={3} />
              New Job
            </button>
          </div>
        </header>

        {/* Content View */}
        <div className="flex-1 overflow-y-auto">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-8"
              >
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h2 className="text-2xl font-bold text-zinc-100">Job Dashboard</h2>
                    <p className="text-sm text-zinc-500">Monitoring 3 active processing pipelines</p>
                  </div>
                  <div className="flex gap-2">
                    <div className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs font-mono">
                      <span className="text-zinc-500 mr-2">Uptime:</span>
                      <span className="text-lime-400">12d 04h 22m</span>
                    </div>
                  </div>
                </div>

                {/* Job List Table */}
                <div className="bg-zinc-900/30 border border-zinc-800 rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto_150px_120px_auto] gap-4 px-4 py-3 bg-zinc-900/50 border-b border-zinc-800 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                    <span>Job Details</span>
                    <span className="px-4">Pipeline Map</span>
                    <span>Progress</span>
                    <span className="text-center">Status</span>
                    <span className="w-[100px]">Actions</span>
                  </div>
                  
                  <div className="flex flex-col">
                    {MOCK_JOBS.map(job => (
                      <JobRow key={job.id} job={job} />
                    ))}
                  </div>
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-3 gap-6 mt-8">
                  <div className="p-6 bg-zinc-900/30 border border-zinc-800 rounded-xl">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg"><RefreshCw size={20} /></div>
                      <h3 className="font-semibold text-zinc-200">Throughput</h3>
                    </div>
                    <div className="text-3xl font-bold text-zinc-100 mb-1">4.2 GB/hr</div>
                    <p className="text-xs text-zinc-500">Average processing speed today</p>
                  </div>
                  <div className="p-6 bg-zinc-900/30 border border-zinc-800 rounded-xl">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-lime-500/10 text-lime-400 rounded-lg"><CheckCircle2 size={20} /></div>
                      <h3 className="font-semibold text-zinc-200">Success Rate</h3>
                    </div>
                    <div className="text-3xl font-bold text-zinc-100 mb-1">98.4%</div>
                    <p className="text-xs text-zinc-500">24 jobs completed, 0 failed</p>
                  </div>
                  <div className="p-6 bg-zinc-900/30 border border-zinc-800 rounded-xl">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg"><Clock size={20} /></div>
                      <h3 className="font-semibold text-zinc-200">Queue Time</h3>
                    </div>
                    <div className="text-3xl font-bold text-zinc-100 mb-1">0m 45s</div>
                    <p className="text-xs text-zinc-500">Current average wait for GPU</p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'forge' && (
              <motion.div 
                key="forge"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-8 h-full flex flex-col"
              >
                <div className="mb-8">
                  <h2 className="text-2xl font-bold text-zinc-100">Pipeline Forge</h2>
                  <p className="text-sm text-zinc-500">Construct a multi-step processing sequence</p>
                </div>

                <div className="flex-1 grid grid-cols-[1fr_350px] gap-8 min-h-0">
                  {/* Pipeline Builder Canvas */}
                  <div className="bg-zinc-900/20 border-2 border-dashed border-zinc-800 rounded-2xl flex flex-col items-center justify-center p-12 relative overflow-hidden">
                    {/* Grid Background Effect */}
                    <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
                    
                    <div className="flex flex-col items-center gap-6 z-10">
                      <div className="w-16 h-16 bg-zinc-800 rounded-full flex items-center justify-center text-zinc-500 border border-zinc-700">
                        <Plus size={32} />
                      </div>
                      <div className="text-center">
                        <h3 className="text-lg font-semibold text-zinc-300">Start your pipeline</h3>
                        <p className="text-sm text-zinc-500 max-w-xs mt-2">Drag a file here or select a source to begin building your media sequence.</p>
                      </div>
                      <button className="px-6 py-2 bg-zinc-800 text-zinc-100 rounded-lg font-semibold hover:bg-zinc-700 transition-colors border border-zinc-700">
                        Select Source File
                      </button>
                    </div>
                  </div>

                  {/* Node Library / Inspector */}
                  <div className="flex flex-col gap-6">
                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Available Nodes</h4>
                      <div className="flex flex-col gap-2">
                        {[
                          { icon: FileAudio, label: 'Vocal Removal (UVR)', desc: 'Separate stems using MDX-Net' },
                          { icon: Type, label: 'Speech-to-Text', desc: 'Whisper-based transcription' },
                          { icon: Languages, label: 'Translation', desc: 'Multi-language subtitle sync' },
                          { icon: Scissors, label: 'Video Trimmer', desc: 'Basic cut/crop operations' },
                          { icon: FileVideo, label: 'Subtitle Burn', desc: 'Hardcode subs into video' }
                        ].map((node, i) => (
                          <button key={i} className="flex items-start gap-3 p-3 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-lime-500/50 hover:bg-zinc-800 transition-all text-left group">
                            <div className="p-2 bg-zinc-800 rounded-md text-zinc-400 group-hover:text-lime-400 transition-colors">
                              <node.icon size={18} />
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-zinc-200">{node.label}</div>
                              <div className="text-[10px] text-zinc-500">{node.desc}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 flex-1">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-4">Pipeline Settings</h4>
                      <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-zinc-400">Output Format</label>
                          <select className="bg-zinc-900 border border-zinc-800 rounded-md p-2 text-sm focus:outline-none">
                            <option>MP4 (H.264)</option>
                            <option>MKV (Lossless)</option>
                            <option>MOV (ProRes)</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-zinc-400">Priority</label>
                          <div className="grid grid-cols-3 gap-2">
                            {['Low', 'Normal', 'High'].map(p => (
                              <button key={p} className={`py-1.5 text-xs rounded border ${p === 'Normal' ? 'bg-lime-500/10 border-lime-500/50 text-lime-400' : 'bg-zinc-900 border-zinc-800 text-zinc-500'}`}>
                                {p}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      
                      <div className="mt-auto pt-6">
                        <button className="w-full py-3 bg-lime-500 text-zinc-950 rounded-xl font-black uppercase tracking-widest text-xs hover:bg-lime-400 transition-all shadow-lg shadow-lime-500/20">
                          Launch Pipeline
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
