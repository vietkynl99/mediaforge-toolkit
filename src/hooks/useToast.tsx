import React, { useState, useCallback, useEffect } from 'react';

export type ToastType = 'info' | 'success' | 'warning' | 'error';

interface ToastState {
  message: string | null;
  type: ToastType;
  visible: boolean;
}

const toastStyles: Record<ToastType, string> = {
  info: 'bg-zinc-800 border-zinc-700 text-zinc-100',
  success: 'bg-lime-500/10 border-lime-500/50 text-lime-200',
  warning: 'bg-amber-500/10 border-amber-500/50 text-amber-200',
  error: 'bg-red-500/10 border-red-500/50 text-red-200'
};

export function useToast() {
  const [state, setState] = useState<ToastState>({
    message: null,
    type: 'info',
    visible: false
  });

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    setState({ message, type, visible: true });
  }, []);

  useEffect(() => {
    if (state.visible) {
      const timer = setTimeout(() => {
        setState(prev => ({ ...prev, visible: false }));
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state.visible]);

  return { showToast, toastState: state };
}

export const Toast: React.FC<{ state: ToastState }> = ({ state }) => {
  if (!state.visible || !state.message) return null;

  return (
    <div className={`fixed bottom-6 right-6 z-[100] px-4 py-2 rounded-lg border text-sm shadow-lg backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-4 ${toastStyles[state.type]}`}>
      {state.message}
    </div>
  );
};
