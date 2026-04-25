export const formatBytes = (bytes: number) => {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

export const truncateLabel = (value: string, max = 48) => {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 3))}...`;
};

export const formatRelativeTime = (iso: string) => {
  if (!iso) return 'Unknown';
  const time = new Date(iso).getTime();
  const diff = Date.now() - time;
  if (Number.isNaN(diff)) return iso;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
};

export const formatDurationFine = (seconds?: number) => {
  if (seconds === undefined || seconds === null || seconds < 0) return '00:00.00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const hundredths = Math.floor(((seconds - Math.floor(seconds)) + 1e-6) * 100);
  const base = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  if (hrs > 0) return `${hrs}:${base}`;
  return base;
};

export const formatDurationMs = (ms: number) => {
  if (!ms || ms <= 0) return '00:00';
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

export const formatLocalDateTime = (iso: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  return date.toLocaleString();
};
