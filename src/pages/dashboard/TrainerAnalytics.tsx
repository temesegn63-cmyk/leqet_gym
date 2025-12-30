import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMemberOverview, fetchTrainerSchedule, MemberOverview, TrainerScheduleRow } from '@/services/api/appBackend';
import { differenceInDays, endOfMonth, format, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns';
import {
  TrendingUp,
  Users,
  Award,
  Target,
  Activity,
  Calendar,
  CheckCircle2,
  AlertCircle,
  BarChart3
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const TrainerAnalytics: React.FC = () => {
  const { user } = useAuth();
  const [members, setMembers] = useState<MemberOverview[]>([]);
  const [sessions, setSessions] = useState<TrainerScheduleRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const [membersRes, sessionsRes] = await Promise.all([
          fetchMemberOverview(),
          fetchTrainerSchedule(),
        ]);
        setMembers(membersRes || []);
        setSessions(sessionsRes || []);
        setError(null);
      } catch (err) {
        console.error('Failed to load analytics data', err);
        setError('Failed to load analytics data');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const assignedMembers = members;

  const clampPercent = (v: number) => Math.max(0, Math.min(100, v));

  const parseDate = (value?: string | null) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isFinite(d.getTime()) ? d : null;
  };

  const adherenceForMember = (m: MemberOverview) => {
    const workoutsTarget = 3;
    const mealsTarget = 3;
    const workoutPct = clampPercent(Math.round(((Number(m.workouts_this_week) || 0) / workoutsTarget) * 100));
    const mealPct = clampPercent(Math.round(((Number(m.meals_today) || 0) / mealsTarget) * 100));

    const last = parseDate(m.last_activity);
    const days = last ? differenceInDays(new Date(), last) : 999;
    const penalty = days <= 1 ? 0 : Math.min(40, days * 5);
    return clampPercent(Math.round((workoutPct + mealPct) / 2 - penalty));
  };

  const avgAdherence = assignedMembers.length
    ? Math.round(assignedMembers.reduce((sum, m) => sum + adherenceForMember(m), 0) / assignedMembers.length)
    : 0;

  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);

  const prevMonthStart = startOfMonth(subMonths(now, 1));
  const prevMonthEnd = endOfMonth(subMonths(now, 1));

  const newMembersThisMonth = assignedMembers.filter((m) => {
    const d = parseDate(m.created_at);
    return d != null && d >= monthStart && d <= monthEnd;
  }).length;

  const newMembersPrevMonth = assignedMembers.filter((m) => {
    const d = parseDate(m.created_at);
    return d != null && d >= prevMonthStart && d <= prevMonthEnd;
  }).length;

  const memberDelta = newMembersThisMonth - newMembersPrevMonth;

  const sessionsThisMonth = sessions.filter((s) => {
    const d = parseDate(String(s.session_date));
    return d != null && d >= monthStart && d <= monthEnd;
  });

  const monthCompleted = sessionsThisMonth.filter((s) => s.status === 'completed').length;
  const monthTotal = sessionsThisMonth.length;
  const monthSuccessRate = monthTotal ? Math.round((monthCompleted / monthTotal) * 100) : 0;

  const growthMonths = Array.from({ length: 6 }, (_, i) => subMonths(startOfMonth(now), 5 - i));
  const memberGrowthData = growthMonths.map((m) => {
    const end = endOfMonth(m);
    const count = assignedMembers.filter((mem) => {
      if (!mem.created_at) return false;
      const d = parseDate(mem.created_at);
      return d != null && d <= end;
    }).length;
    return { month: format(m, 'MMM'), members: count };
  });

  const goalBucket = (goal?: string | null) => {
    const g = (goal || '').toLowerCase();
    if (g.includes('loss')) return 'Weight Loss';
    if (g.includes('muscle') || g.includes('gain')) return 'Muscle Gain';
    if (g.includes('maint')) return 'Maintenance';
    if (g.includes('strength')) return 'Strength';
    return 'Other';
  };

  const goalCounts = assignedMembers.reduce<Record<string, number>>((acc, m) => {
    const k = goalBucket(m.goal);
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});

  const memberGoalsData = [
    { name: 'Weight Loss', value: goalCounts['Weight Loss'] || 0, color: 'hsl(var(--primary))' },
    { name: 'Muscle Gain', value: goalCounts['Muscle Gain'] || 0, color: 'hsl(var(--secondary))' },
    { name: 'Maintenance', value: goalCounts['Maintenance'] || 0, color: 'hsl(var(--accent))' },
    { name: 'Strength', value: goalCounts['Strength'] || 0, color: 'hsl(var(--muted))' },
    { name: 'Other', value: goalCounts['Other'] || 0, color: 'hsl(var(--border))' },
  ].filter((x) => x.value > 0);

  const weeklyStarts = Array.from({ length: 4 }, (_, i) => startOfWeek(subWeeks(now, 3 - i), { weekStartsOn: 1 }));
  const sessionData = weeklyStarts.map((weekStart, idx) => {
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekSessions = sessions.filter((s) => {
      const d = parseDate(String(s.session_date));
      return d != null && d >= weekStart && d < weekEnd;
    });

    const completed = weekSessions.filter((s) => s.status === 'completed').length;
    const cancelled = weekSessions.filter((s) => s.status === 'cancelled').length;
    const total = weekSessions.length;
    return { week: `Week ${idx + 1}`, completed, cancelled, total };
  });

  const performance = assignedMembers
    .map((m) => {
      const adherence = adherenceForMember(m);
      const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(m.full_name || String(m.id))}`;
      const last = parseDate(m.last_activity);
      const days = last ? differenceInDays(new Date(), last) : 999;
      return {
        id: String(m.id),
        name: m.full_name || 'Member',
        avatar,
        adherence,
        daysSinceActivity: days,
        joinDate: m.created_at || undefined,
      };
    })
    .sort((a, b) => b.adherence - a.adherence);

  const topPerformers = performance.slice(0, 3).map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    adherence: p.adherence,
    progress: p.adherence >= 90 ? 'Excellent' : p.adherence >= 80 ? 'Great' : 'Good',
  }));

  const needsAttention = performance
    .filter((p) => p.adherence < 70 || p.daysSinceActivity >= 3)
    .slice(0, 3)
    .map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      adherence: p.adherence,
      lastActivity: p.daysSinceActivity >= 999 ? 'unknown' : `${p.daysSinceActivity} days ago`,
      issue: p.daysSinceActivity >= 3 ? 'Inactive' : 'Low adherence',
    }));

  return (
    <div className="space-y-6">
      {isLoading && <div className="text-sm text-muted-foreground">Loading analytics...</div>}
      {error && <div className="text-sm text-destructive">{error}</div>}
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-foreground">Analytics Dashboard</h1>
        <p className="text-muted-foreground">Track your training performance and member progress</p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{assignedMembers.length}</div>
            <p className={memberDelta >= 0 ? 'text-xs text-success' : 'text-xs text-destructive'}>
              {memberDelta >= 0 ? `+${memberDelta}` : `${memberDelta}`} from last month
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Adherence</CardTitle>
            <Target className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{avgAdherence}%</div>
            <p className="text-xs text-muted-foreground">Based on logs & recency</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sessions This Month</CardTitle>
            <Calendar className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{monthTotal}</div>
            <p className="text-xs text-muted-foreground">{monthCompleted} completed</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
            <Award className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{monthSuccessRate}%</div>
            <p className="text-xs text-muted-foreground">Session completion rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <Tabs defaultValue="growth" className="space-y-4">
        <TabsList>
          <TabsTrigger value="growth">Member Growth</TabsTrigger>
          <TabsTrigger value="sessions">Session Stats</TabsTrigger>
          <TabsTrigger value="goals">Member Goals</TabsTrigger>
        </TabsList>

        <TabsContent value="growth" className="space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-foreground">Member Growth</CardTitle>
              <CardDescription>Number of active members over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={memberGrowthData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line 
                    type="monotone" 
                    dataKey="members" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={2}
                    name="Members"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sessions" className="space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-foreground">Session Statistics</CardTitle>
              <CardDescription>Completed vs cancelled sessions</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={sessionData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="completed" fill="hsl(var(--primary))" name="Completed" />
                  <Bar dataKey="cancelled" fill="hsl(var(--destructive))" name="Cancelled" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="goals" className="space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-foreground">Member Goals Distribution</CardTitle>
              <CardDescription>Breakdown of member fitness goals</CardDescription>
            </CardHeader>
            <CardContent className="flex justify-center">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={memberGoalsData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {memberGoalsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top Performers */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Award className="w-5 h-5 text-primary" />
              Top Performers
            </CardTitle>
            <CardDescription>Members with excellent progress</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {topPerformers.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.avatar} />
                      <AvatarFallback>
                        {member.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-foreground">{member.name}</p>
                      <p className="text-xs text-muted-foreground">{member.progress} progress</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="secondary" className="bg-success text-success-foreground">
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {member.adherence}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Needs Attention */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <AlertCircle className="w-5 h-5 text-destructive" />
              Needs Attention
            </CardTitle>
            <CardDescription>Members requiring follow-up</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {needsAttention.map((member) => (
                <div key={member.id} className="flex items-center justify-between p-3 bg-destructive/10 rounded-lg border border-destructive/20">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.avatar} />
                      <AvatarFallback>
                        {member.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-foreground">{member.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Last active: {member.lastActivity}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <Badge variant="destructive">
                      {member.adherence}%
                    </Badge>
                    <p className="text-xs text-destructive mt-1">{member.issue}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Member Performance Overview */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-foreground">All Members Performance</CardTitle>
          <CardDescription>Adherence rates and progress tracking</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {performance.map((member) => (
              <div key={member.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={member.avatar} />
                      <AvatarFallback>
                        {member.name.split(' ').map((n) => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium text-foreground">{member.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Member since {member.joinDate ? new Date(member.joinDate).toLocaleDateString() : '-'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-medium text-foreground">{member.adherence}%</p>
                      <p className="text-xs text-muted-foreground">adherence</p>
                    </div>
                  </div>
                </div>
                <Progress value={member.adherence} className="h-2" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TrainerAnalytics;
