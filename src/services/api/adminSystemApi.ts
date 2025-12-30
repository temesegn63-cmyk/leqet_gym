import { api } from './config';

export interface SystemStatsResponse {
  dbSizeBytes: number;
  uptimeSeconds: number;
  lastBackup: string | null;
}

export interface SystemMonitorLog {
  id: number;
  log_type: string | null;
  message: string;
  created_at: string;
}

export interface PerformancePoint {
  time: string;
  requests: number;
  responseTime: number;
}

export interface SystemMonitorResponse {
  status: string;
  uptimeSeconds: number;
  errorsLast24h: number;
  warningsLast24h: number;
  cpuPercent: number;
  memoryPercent: number;
  memoryTotalBytes: number;
  memoryFreeBytes: number;
  memoryUsedBytes: number;
  storageUsedBytes: number;
  storageLimitBytes: number;
  storagePercent: number;
  bandwidthUsedBytes24h: number;
  bandwidthLimitBytes24h: number;
  bandwidthPercent: number;
  recentLogs: SystemMonitorLog[];
  performance: PerformancePoint[];
}

export interface BackupResponse {
  success: boolean;
  message?: string;
  timestamp?: string;
  filename?: string;
  publicLink?: string | null;
}

export async function getSystemStats(): Promise<SystemStatsResponse> {
  const res = await api.get<SystemStatsResponse>('/admin/system/stats');
  return res.data;
}

export async function getSystemMonitor(): Promise<SystemMonitorResponse> {
  const res = await api.get<SystemMonitorResponse>('/admin/system/monitor');
  return res.data;
}

export async function triggerBackup(): Promise<BackupResponse> {
  const res = await api.post<BackupResponse>('/admin/maintenance/backup');
  return res.data;
}

export async function runHealthCheck(): Promise<{ success: boolean; message?: string; dbOk?: boolean }> {
  const res = await api.post<{ success: boolean; message?: string; dbOk?: boolean }>(
    '/admin/maintenance/health-check'
  );
  return res.data;
}

export async function clearCacheAndLogs(): Promise<{ success: boolean; message?: string; cleared?: number }> {
  const res = await api.post<{ success: boolean; message?: string; cleared?: number }>(
    '/admin/maintenance/clear-cache'
  );
  return res.data;
}
