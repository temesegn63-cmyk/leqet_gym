import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Activity,
  Server,
  Database,
  HardDrive,
  Cpu,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Zap
} from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

import { getSystemMonitor, SystemMonitorResponse } from '@/services/api/adminSystemApi';

interface UiSystemHealth {
  status: string;
  uptime: string;
  responseTime: string;
  errors: number;
  warnings: number;
}

interface UiResourceUsage {
  cpu: number;
  memory: number;
  storage: number;
  bandwidth: number;
}

interface UiEvent {
  id: string;
  timestamp: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  details: string;
}

const AdminSystemMonitor: React.FC = () => {
  const [data, setData] = useState<SystemMonitorResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let idx = 0;
    let value = bytes;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
  };

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getSystemMonitor();
        setData(res);
      } catch (err) {
        console.error('Failed to load system monitor data', err);
        setError('Failed to load system monitor data');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const formatUptimePercent = (uptimeSeconds: number) => {
    const THIRTY_DAYS = 30 * 24 * 60 * 60;
    if (!uptimeSeconds) return '0%';
    const pct = Math.max(0, Math.min(100, (uptimeSeconds / THIRTY_DAYS) * 100));
    return `${pct.toFixed(1)}%`;
  };

  const timeAgo = (dateStr: string) => {
    const d = new Date(dateStr);
    const diffMs = Date.now() - d.getTime();
    const minutes = Math.floor(diffMs / (1000 * 60));
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  };

  const systemHealth: UiSystemHealth = data
    ? {
        status: data.status,
        uptime: formatUptimePercent(data.uptimeSeconds),
        responseTime: `${Math.round(
          data.performance.length
            ? data.performance.reduce((sum, p) => sum + p.responseTime, 0) / data.performance.length
            : 120
        )}ms`,
        errors: data.errorsLast24h,
        warnings: data.warningsLast24h,
      }
    : {
        status: 'unknown',
        uptime: '0%',
        responseTime: '0ms',
        errors: 0,
        warnings: 0,
      };

  const resourceUsage: UiResourceUsage = {
    cpu: data?.cpuPercent ?? 0,
    memory: data?.memoryPercent ?? 0,
    storage: data?.storagePercent ?? 0,
    bandwidth: data?.bandwidthPercent ?? 0,
  };

  const performanceData = data?.performance ?? [];

  const recentErrors: UiEvent[] = (data?.recentLogs ?? []).map((log) => {
    const severity: 'error' | 'warning' | 'info' =
      log.log_type === 'error' || log.log_type === 'warning'
        ? (log.log_type as 'error' | 'warning')
        : 'info';
    return {
      id: String(log.id),
      timestamp: timeAgo(log.created_at),
      severity,
      message: log.message,
      details: log.log_type ? `Type: ${log.log_type}` : 'Log entry',
    };
  });

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-warning" />;
      default:
        return <CheckCircle2 className="w-4 h-4 text-success" />;
    }
  };

  const getSeverityBadge = (severity: string) => {
    switch (severity) {
      case 'error':
        return <Badge variant="destructive">Error</Badge>;
      case 'warning':
        return <Badge className="bg-warning text-warning-foreground">Warning</Badge>;
      default:
        return <Badge variant="outline">Info</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">System Monitor</h1>
        <p className="text-muted-foreground">Real-time system health and performance metrics</p>
      </div>

      {/* System Health Overview */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Status</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{systemHealth.status}</div>
            <p className="text-xs text-muted-foreground">Live server metrics</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{systemHealth.uptime}</div>
            <p className="text-xs text-muted-foreground">last 30 days</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response</CardTitle>
            <Zap className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{systemHealth.responseTime}</div>
            <p className="text-xs text-muted-foreground">last 24 hours</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Errors</CardTitle>
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{systemHealth.errors}</div>
            <p className="text-xs text-muted-foreground">last 24 hours</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Warnings</CardTitle>
            <AlertTriangle className="h-4 w-4 text-warning" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{systemHealth.warnings}</div>
            <p className="text-xs text-muted-foreground">needs attention</p>
          </CardContent>
        </Card>
      </div>

      {/* Resource Usage */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-foreground">Resource Usage</CardTitle>
          <CardDescription>Current system resource utilization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">CPU Usage</span>
                </div>
                <span className="text-sm font-bold text-foreground">{resourceUsage.cpu}%</span>
              </div>
              <Progress value={resourceUsage.cpu} />
              <p className="text-xs text-muted-foreground">Normal load</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-secondary" />
                  <span className="text-sm font-medium text-foreground">Memory</span>
                </div>
                <span className="text-sm font-bold text-foreground">{resourceUsage.memory}%</span>
              </div>
              <Progress value={resourceUsage.memory} />
              <p className="text-xs text-muted-foreground">
                {formatBytes(data?.memoryUsedBytes ?? 0)} / {formatBytes(data?.memoryTotalBytes ?? 0)}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-accent" />
                  <span className="text-sm font-medium text-foreground">Database Size</span>
                </div>
                <span className="text-sm font-bold text-foreground">{resourceUsage.storage}%</span>
              </div>
              <Progress value={resourceUsage.storage} />
              <p className="text-xs text-muted-foreground">
                {formatBytes(data?.storageUsedBytes ?? 0)} / {formatBytes(data?.storageLimitBytes ?? 0)}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">API Traffic (24h)</span>
                </div>
                <span className="text-sm font-bold text-foreground">{resourceUsage.bandwidth}%</span>
              </div>
              <Progress value={resourceUsage.bandwidth} />
              <p className="text-xs text-muted-foreground">
                {formatBytes(data?.bandwidthUsedBytes24h ?? 0)} / {formatBytes(data?.bandwidthLimitBytes24h ?? 0)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Performance Charts */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-foreground">Performance Metrics</CardTitle>
          <CardDescription>Request load and response times over 24 hours</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="requests"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.3}
                name="Requests"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="responseTime"
                stroke="hsl(var(--secondary))"
                strokeWidth={2}
                name="Response Time (ms)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Recent Events */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-foreground">Recent System Events</CardTitle>
          <CardDescription>Latest errors, warnings, and system notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {recentErrors.map((error) => (
              <div
                key={error.id}
                className="flex items-start gap-3 p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="mt-0.5">
                  {getSeverityIcon(error.severity)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-foreground">{error.message}</p>
                    {getSeverityBadge(error.severity)}
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">{error.details}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {error.timestamp}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSystemMonitor;
