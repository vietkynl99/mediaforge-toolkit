import React, { useState, useEffect, useRef } from 'react';

interface PromptModalProps {
  open: boolean;
  title: string;
  description?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
  onClose: () => void;
  onSubmit: (value: string) => void | Promise<void>;
}

export const PromptModal: React.FC<PromptModalProps> = ({
  open,
  title,
  description,
  placeholder,
  initialValue = '',
  confirmLabel,
  variant = 'primary',
  onClose,
  onSubmit
}) => {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialValue]);

  if (!open) return null;

  const handleSubmit = async () => {
    if (!value.trim()) return;
    await Promise.resolve(onSubmit(value.trim()));
    onClose();
  };

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
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') onClose();
          }}
          placeholder={placeholder}
          className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-lime-500"
        />
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold border border-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-100 hover:border-zinc-700"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!value.trim()}
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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
