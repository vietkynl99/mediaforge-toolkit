import React, { lazy, Suspense } from 'react';

const LazyVaultProjectPanel = lazy(() =>
  import('../vault/VaultProjectPanel').then(module => ({ default: module.VaultProjectPanel }))
);
const LazyImportFilesModal = lazy(() =>
  import('../vault/ImportFilesModal').then(module => ({ default: module.ImportFilesModal }))
);
const LazyTemplateSaveModal = lazy(() =>
  import('../pipeline/TemplateSaveModal').then(module => ({ default: module.TemplateSaveModal }))
);
const LazyRunPipelineModal = lazy(() =>
  import('../pipeline/RunPipelineModal').then(module => ({ default: module.RunPipelineModal }))
);
const LazyRenderStudioPage = lazy(() =>
  import('../../RenderStudioPage')
);
const LazyAppContextMenus = lazy(() =>
  import('../menus/AppContextMenus').then(module => ({ default: module.AppContextMenus }))
);

interface AppOverlaysProps {
  toastVisible: boolean;
  toastMessage: string | null;
  toastType: 'info' | 'success' | 'error' | 'warning';
  toastStyles: Record<'info' | 'success' | 'error' | 'warning', string>;
  vaultContextMenu: any;
  closeVaultContextMenu: () => void;
  setVaultFolderId: (id: string | null) => void;
  setVaultFileId: (id: string | null) => void;
  setShowFolderPanel: (open: boolean) => void;
  deleteVaultProject: (folder: any) => void;
  showFolderPanel: boolean;
  selectedFolder: any;
  filteredFiles: any[];
  fileTypeIcons: Record<string, any>;
  fileTypeLabels: Record<string, string>;
  vaultQuery: string;
  setVaultQuery: (value: string) => void;
  vaultTypeFilter: any;
  setVaultTypeFilter: (value: any) => void;
  vaultSort: any;
  setVaultSort: (value: any) => void;
  vaultView: any;
  setVaultView: (value: any) => void;
  groupedFiles: any[];
  vaultGroupCollapsed: Record<string, boolean>;
  setVaultGroupCollapsed: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  openFileContextMenu: (event: React.MouseEvent, file: any) => void;
  selectedFile: any;
  formatOverlapDisplay: (value: any) => string;
  importPopupOpen: boolean;
  setImportPopupOpen: (open: boolean) => void;
  importProjectName: string;
  setImportProjectName: (value: string) => void;
  importProjectPickerOpen: boolean;
  setImportProjectPickerOpen: (open: boolean) => void;
  vaultFolders: any[];
  importFiles: File[];
  setImportFiles: (files: File[]) => void;
  importError: string | null;
  importSubmitting: boolean;
  performImport: () => void;
  templateSaveOpen: boolean;
  setTemplateSaveOpen: (open: boolean) => void;
  templateSaveTaskType: string | null;
  templateSaveError: string | null;
  templateSaveName: string;
  setTemplateSaveName: (value: string) => void;
  confirmSaveTemplate: () => void;
  runPipelineModalProps: any;
  showRenderStudio: boolean;
  runPipelineHasRender: boolean;
  renderStudioProps: any;
  appContextMenusProps: any;
  renderStudioContextMenus: React.ReactNode;
}

export const AppOverlays: React.FC<AppOverlaysProps> = ({
  toastVisible,
  toastMessage,
  toastType,
  toastStyles,
  vaultContextMenu,
  closeVaultContextMenu,
  setVaultFolderId,
  setVaultFileId,
  setShowFolderPanel,
  deleteVaultProject,
  showFolderPanel,
  selectedFolder,
  filteredFiles,
  fileTypeIcons,
  fileTypeLabels,
  vaultQuery,
  setVaultQuery,
  vaultTypeFilter,
  setVaultTypeFilter,
  vaultSort,
  setVaultSort,
  vaultView,
  setVaultView,
  groupedFiles,
  vaultGroupCollapsed,
  setVaultGroupCollapsed,
  openFileContextMenu,
  selectedFile,
  formatOverlapDisplay,
  importPopupOpen,
  setImportPopupOpen,
  importProjectName,
  setImportProjectName,
  importProjectPickerOpen,
  setImportProjectPickerOpen,
  vaultFolders,
  importFiles,
  setImportFiles,
  importError,
  importSubmitting,
  performImport,
  templateSaveOpen,
  setTemplateSaveOpen,
  templateSaveTaskType,
  templateSaveError,
  templateSaveName,
  setTemplateSaveName,
  confirmSaveTemplate,
  runPipelineModalProps,
  showRenderStudio,
  runPipelineHasRender,
  renderStudioProps,
  appContextMenusProps,
  renderStudioContextMenus
}) => {
  return (
    <>
      {toastVisible && toastMessage && (
        <div className={`fixed bottom-6 right-6 z-[70] px-4 py-2 rounded-lg border text-sm shadow-lg ${toastStyles[toastType]}`}>
          {toastMessage}
        </div>
      )}

      {vaultContextMenu.open && vaultContextMenu.folder && (
        <div className="fixed inset-0 z-[80]" onClick={closeVaultContextMenu}>
          <div
            className="absolute bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl p-2 w-48 text-xs text-zinc-200"
            style={{ left: vaultContextMenu.x, top: vaultContextMenu.y }}
            onClick={event => event.stopPropagation()}
          >
            <button
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-zinc-800 transition-colors"
              onClick={() => {
                const folder = vaultContextMenu.folder;
                if (!folder) return;
                setVaultFolderId(folder.id);
                setVaultFileId(folder.files[0]?.id ?? null);
                setShowFolderPanel(true);
                closeVaultContextMenu();
              }}
            >
              Open Project
            </button>
            <button
              className="w-full text-left px-3 py-2 rounded-lg text-red-300 hover:bg-red-500/10 transition-colors"
              onClick={() => {
                const folder = vaultContextMenu.folder;
                if (!folder) return;
                closeVaultContextMenu();
                deleteVaultProject(folder);
              }}
            >
              Delete Project
            </button>
          </div>
        </div>
      )}

      {showFolderPanel && selectedFolder && (
        <Suspense fallback={<div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm"><div className="text-sm text-zinc-400">Loading project panel...</div></div>}>
          <LazyVaultProjectPanel
            open={showFolderPanel}
            selectedFolder={selectedFolder}
            onClose={() => setShowFolderPanel(false)}
            filteredFiles={filteredFiles}
            fileTypeIcons={fileTypeIcons}
            fileTypeLabels={fileTypeLabels}
            vaultQuery={vaultQuery}
            setVaultQuery={setVaultQuery}
            vaultTypeFilter={vaultTypeFilter}
            setVaultTypeFilter={setVaultTypeFilter}
            vaultSort={vaultSort}
            setVaultSort={setVaultSort}
            vaultView={vaultView}
            setVaultView={setVaultView}
            groupedFiles={groupedFiles}
            vaultGroupCollapsed={vaultGroupCollapsed}
            setVaultGroupCollapsed={setVaultGroupCollapsed}
            openFileContextMenu={openFileContextMenu}
            setVaultFileId={setVaultFileId}
            selectedFile={selectedFile}
            formatOverlapDisplay={formatOverlapDisplay}
          />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <LazyImportFilesModal
          open={importPopupOpen}
          onClose={() => setImportPopupOpen(false)}
          importProjectName={importProjectName}
          setImportProjectName={setImportProjectName}
          importProjectPickerOpen={importProjectPickerOpen}
          setImportProjectPickerOpen={setImportProjectPickerOpen}
          vaultFolders={vaultFolders}
          importFiles={importFiles}
          setImportFiles={setImportFiles}
          importError={importError}
          importSubmitting={importSubmitting}
          onImport={performImport}
        />
      </Suspense>

      <Suspense fallback={null}>
        <LazyTemplateSaveModal
          open={templateSaveOpen}
          onClose={() => setTemplateSaveOpen(false)}
          templateSaveTaskType={templateSaveTaskType}
          templateSaveError={templateSaveError}
          templateSaveName={templateSaveName}
          setTemplateSaveName={setTemplateSaveName}
          onConfirm={confirmSaveTemplate}
        />
      </Suspense>

      <Suspense fallback={null}>
        <LazyRunPipelineModal {...runPipelineModalProps} />
      </Suspense>

      {showRenderStudio && runPipelineHasRender && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-zinc-950 text-zinc-400 flex items-center justify-center">Loading render studio...</div>}>
          <LazyRenderStudioPage {...renderStudioProps} />
        </Suspense>
      )}

      <Suspense fallback={null}>
        <LazyAppContextMenus {...appContextMenusProps} />
      </Suspense>

      {showRenderStudio && renderStudioContextMenus}
    </>
  );
};
