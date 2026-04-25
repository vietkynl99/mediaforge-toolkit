import React from 'react';

export type RenderStudioPageContextValue = Record<string, any>;

const RenderStudioPageContext = React.createContext<RenderStudioPageContextValue | null>(null);

export const RenderStudioPageProvider = RenderStudioPageContext.Provider;

export const useRenderStudioPage = () => {
  const value = React.useContext(RenderStudioPageContext);
  if (!value) {
    throw new Error('useRenderStudioPage must be used within RenderStudioPageProvider');
  }
  return value;
};

