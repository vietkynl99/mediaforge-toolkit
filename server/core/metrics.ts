/**
 * System Metrics Module - CPU, memory, and system stats
 */

import * as os from 'os';

// CPU tracking
let lastCpuInfo: { idle: number; total: number } | null = null;

export const getCpuUsage = (): number => {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;

  for (const cpu of cpus) {
    for (const type in cpu.times) {
      total += (cpu.times as any)[type];
    }
    idle += cpu.times.idle;
  }

  if (lastCpuInfo === null) {
    lastCpuInfo = { idle, total };
    return 0; // First call, return 0
  }

  const idleDiff = idle - lastCpuInfo.idle;
  const totalDiff = total - lastCpuInfo.total;
  lastCpuInfo = { idle, total };

  if (totalDiff === 0) return 0;
  const usage = Math.round(((totalDiff - idleDiff) / totalDiff) * 100);
  return Math.max(0, Math.min(100, usage));
};

export const getMemoryUsage = (): { usedPercent: number; usedGB: number; totalGB: number; freeGB: number } => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    usedPercent: Math.round((usedMem / totalMem) * 100),
    usedGB: Math.round((usedMem / (1024 * 1024 * 1024)) * 100) / 100,
    totalGB: Math.round((totalMem / (1024 * 1024 * 1024)) * 100) / 100,
    freeGB: Math.round((freeMem / (1024 * 1024 * 1024)) * 100) / 100
  };
};

export const getCpuCount = () => os.cpus().length;

// Stats cache
const STATS_CACHE_MIN_INTERVAL_MS = 5000; // 5 seconds
let statsCache: {
  data: any;
  timestamp: number;
} | null = null;

export const getServerStats = (getCpuUsageFn: () => number = getCpuUsage, getMemoryUsageFn: () => ReturnType<typeof getMemoryUsage> = getMemoryUsage) => {
  const now = Date.now();
  if (statsCache && now - statsCache.timestamp < STATS_CACHE_MIN_INTERVAL_MS) {
    return statsCache.data;
  }

  const data = {
    cpu: getCpuUsageFn(),
    memory: getMemoryUsageFn(),
    cpuCount: getCpuCount()
  };

  statsCache = { data, timestamp: now };
  return data;
};
