import { useState, useCallback } from 'react';
import { VaultFile, VaultFileType } from '../../../types/index';
import { MediaBinTypeFilter } from '../components/MediaBin';

export function useRenderStudioUI() {
  const [renderStudioLeftMenuOpen, setRenderStudioLeftMenuOpen] = useState(false);
  const [renderStudioMediaBinOpen, setRenderStudioMediaBinOpen] = useState(false);
  const [renderStudioProjectOpen, setRenderStudioProjectOpen] = useState(false);
  const [renderStudioInspectorOpen, setRenderStudioInspectorOpen] = useState<
    Record<'timeline' | 'video' | 'audio' | 'subtitle' | 'text' | 'effects' | 'image', boolean>
  >({
    timeline: false,
    video: false,
    audio: false,
    subtitle: false,
    text: false,
    effects: false,
    image: false
  });

  const [renderStudioMediaBinContextMenu, setRenderStudioMediaBinContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    file: VaultFile | null;
  }>({
    open: false,
    x: 0,
    y: 0,
    file: null
  });

  const [renderStudioTimelineContextMenu, setRenderStudioTimelineContextMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    track: { type: 'video' | 'audio' | 'subtitle' | 'image' | 'text' | 'effect'; id?: string; index?: number } | null;
  }>({
    open: false,
    x: 0,
    y: 0,
    track: null
  });

  const toggleInspector = useCallback((key: keyof typeof renderStudioInspectorOpen) => {
    setRenderStudioInspectorOpen(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  }, []);

  const closeContextMenus = useCallback(() => {
    setRenderStudioMediaBinContextMenu(prev => ({ ...prev, open: false, file: null }));
    setRenderStudioTimelineContextMenu(prev => ({ ...prev, open: false, track: null }));
  }, []);

  const [renderConfirmOpen, setRenderConfirmOpen] = useState(false);
  const [customRenderStart, setCustomRenderStart] = useState('00:00:00.0');
  const [customRenderEnd, setCustomRenderEnd] = useState('');
  const [templateSaveConfirmOpen, setTemplateSaveConfirmOpen] = useState(false);
  const [templateDiffOpen, setTemplateDiffOpen] = useState(false);
  const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
  const [addTrackMenuOpen, setAddTrackMenuOpen] = useState(false);
  const [renderStudioMediaBinTypeFilter, setRenderStudioMediaBinTypeFilter] = useState<MediaBinTypeFilter>('all');

  return {
    renderStudioLeftMenuOpen,
    setRenderStudioLeftMenuOpen,
    renderStudioMediaBinOpen,
    setRenderStudioMediaBinOpen,
    renderStudioProjectOpen,
    setRenderStudioProjectOpen,
    renderStudioInspectorOpen,
    toggleInspector,
    renderStudioMediaBinContextMenu,
    setRenderStudioMediaBinContextMenu,
    renderStudioTimelineContextMenu,
    setRenderStudioTimelineContextMenu,
    closeContextMenus,
    renderConfirmOpen,
    setRenderConfirmOpen,
    customRenderStart,
    setCustomRenderStart,
    customRenderEnd,
    setCustomRenderEnd,
    templateSaveConfirmOpen,
    setTemplateSaveConfirmOpen,
    templateDiffOpen,
    setTemplateDiffOpen,
    templateMenuOpen,
    setTemplateMenuOpen,
    addTrackMenuOpen,
    setAddTrackMenuOpen,
    renderStudioMediaBinTypeFilter,
    setRenderStudioMediaBinTypeFilter
  };
}
