import React from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  secondaryLabel?: string;
  variant?: 'danger' | 'primary';
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  onSecondary?: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  description,
  confirmLabel,
  secondaryLabel,
  variant = 'primary',
  onClose,
  onConfirm,
  onSecondary
}) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-zinc-950/70 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-[min(520px,92vw)] bg-zinc-900/95 border border-zinc-800 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl">
        <div>
          <div className="text-lg font-semibold text-zinc-100 mt-2">{title}</div>
          {description && (
            <div className="text-sm text-zinc-500 mt-2">{description}</div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
          >
            Cancel
          </button>
          {secondaryLabel && (
            <button
              onClick={() => {
                onSecondary?.();
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-300 hover:text-zinc-100 hover:border-zinc-700"
            >
              {secondaryLabel}
            </button>
          )}
          <button
            onClick={async () => {
              await Promise.resolve(onConfirm());
              onClose();
            }}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors ${
              variant === 'danger'
                ? 'bg-red-500 text-zinc-950 hover:bg-red-400'
                : 'bg-lime-500 text-zinc-950 hover:bg-lime-400'
            }`}
          >
            {confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};
