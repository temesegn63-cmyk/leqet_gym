import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress as ProgressBar } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Trophy, TrendingUp, Target, Calendar, Flame, Dumbbell, Apple, Award, Eye, Lock } from "lucide-react";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { useAuth } from '@/contexts/AuthContext';
import { fetchMemberProgressSummary, type MemberProgressSummary, fetchMemberCheckIns, createMemberCheckIn, type MemberCheckIn } from '@/services/api/appBackend';
import { useEffect, useMemo, useState } from 'react';

const Progress = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<MemberProgressSummary | null>(null);
  const [checkIns, setCheckIns] = useState<MemberCheckIn[]>([]);
  const [checkInForm, setCheckInForm] = useState({
    adherence: "3",
    fatigue: "3",
    pain: "1",
    weightKg: "",
    notes: "",
  });
  const [savingCheckIn, setSavingCheckIn] = useState(false);

  useEffect(() => {
    if (!user) {
      setSummary(null);
      setCheckIns([]);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const [s, ci] = await Promise.all([
          fetchMemberProgressSummary(user.id),
          fetchMemberCheckIns(user.id, 10),
        ]);
        setSummary(s);
        setCheckIns(ci);
      } catch (error) {
        console.error('Failed to load progress summary', error);
        setSummary(null);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user]);

  const handleSaveCheckIn = async () => {
    if (!user) return;

    try {
      setSavingCheckIn(true);
      const payload = {
        adherence: checkInForm.adherence ? Number(checkInForm.adherence) : null,
        fatigue: checkInForm.fatigue ? Number(checkInForm.fatigue) : null,
        pain: checkInForm.pain ? Number(checkInForm.pain) : null,
        weightKg: checkInForm.weightKg ? Number(checkInForm.weightKg) : null,
        notes: checkInForm.notes || null,
      };

      const created = await createMemberCheckIn(user.id, payload);
      setCheckIns((prev) => [created, ...prev].slice(0, 10));
      setCheckInForm((prev) => ({
        ...prev,
        notes: "",
      }));
    } catch (error) {
      console.error('Failed to save check-in', error);
    } finally {
      setSavingCheckIn(false);
    }
  };

  const isPublicProfile = summary ? !summary.profile.is_private : true;

  const weightData = useMemo(() => {
    const current = summary?.stats.current_weight_kg ?? null;
    return (summary?.charts.weight || []).map((row) => ({
      date: row.date,
      weight: row.weight,
      target: current ?? row.weight,
    }));
  }, [summary]);

  const weightChange = useMemo(() => {
    if (summary?.stats.start_weight_kg == null || summary?.stats.current_weight_kg == null) return null;
    const delta = Number(summary.stats.current_weight_kg) - Number(summary.stats.start_weight_kg);
    return Number(delta.toFixed(1));
  }, [summary]);

  const weightChangePercent = useMemo(() => {
    if (summary?.stats.start_weight_kg == null || weightChange == null) return 0;
    const start = Number(summary.stats.start_weight_kg);
    if (!Number.isFinite(start) || start === 0) return 0;
    const pct = (Math.abs(weightChange) / Math.abs(start)) * 100;
    return Math.min(100, Math.max(0, Math.round(pct)));
  }, [summary, weightChange]);

  const monthlyWorkouts = summary?.stats.workouts_this_month ?? 0;
  const monthlyWorkoutTarget = summary?.targets.monthly_workout_sessions_target ?? 0;
  const monthlyWorkoutProgress =
    monthlyWorkoutTarget > 0 ? Math.min(100, Math.round((monthlyWorkouts / monthlyWorkoutTarget) * 100)) : 0;

  const calorieConsistency = summary?.stats.calorie_consistency_percent ?? 0;

  const workoutData = useMemo(() => {
    const target = summary?.targets.weekly_workout_sessions_target ?? 5;
    return (summary?.charts.workouts || []).map((row, idx) => ({
      week: `Week ${idx + 1}`,
      sessions: row.sessions,
      target,
    }));
  }, [summary]);

  const calorieData = useMemo(() => {
    return (summary?.charts.calories || []).map((row) => ({
      day: row.day,
      calories: row.calories,
      target: row.target,
    }));
  }, [summary]);

  const achievements = useMemo(() => {
    const started = summary?.stats.started_at ? String(summary.stats.started_at).slice(0, 10) : null;
    const weightLost = summary?.stats.total_weight_lost_kg ?? 0;
    const workouts = summary?.stats.workouts_completed ?? 0;
    const consistency = summary?.stats.calorie_consistency_percent ?? 0;

    return [
      {
        id: 1,
        title: 'Started Journey',
        description: 'Began tracking your progress',
        icon: Trophy,
        earned: Boolean(started),
        date: started,
      },
      {
        id: 2,
        title: '5kg Lost',
        description: 'Lost 5 kilograms (from logged weigh-ins)',
        icon: TrendingUp,
        earned: weightLost >= 5,
        date: null,
      },
      {
        id: 3,
        title: 'Consistency',
        description: 'Stayed close to your calorie target this week',
        icon: Flame,
        earned: consistency >= 70,
        date: null,
      },
      {
        id: 4,
        title: '100 Workouts',
        description: 'Logged 100 workout exercises',
        icon: Dumbbell,
        earned: workouts >= 100,
        date: null,
      },
      {
        id: 5,
        title: 'Perfect Week',
        description: 'Hit calorie target most days this week',
        icon: Award,
        earned: consistency >= 90,
        date: null,
      },
      {
        id: 6,
        title: 'Goal Crusher',
        description: 'Reached a major milestone based on your logs',
        icon: Target,
        earned: weightLost >= 10 || workouts >= 200,
        date: null,
      },
    ];
  }, [summary]);

  const milestones = useMemo(() => {
    const started = summary?.stats.started_at ? String(summary.stats.started_at).slice(0, 10) : null;
    const startWeight = summary?.stats.start_weight_kg;
    const currentWeight = summary?.stats.current_weight_kg;
    const lost = summary?.stats.total_weight_lost_kg;

    const list: { id: number; title: string; date: string; description: string }[] = [];
    if (started) {
      list.push({ id: 1, title: 'Started Journey', date: started, description: 'Began fitness journey tracking' });
    }
    if (startWeight != null && currentWeight != null) {
      list.push({
        id: 2,
        title: 'Latest Weight',
        date: new Date().toISOString().slice(0, 10),
        description: `Current: ${currentWeight}kg (Start: ${startWeight}kg${lost != null ? `, Change: ${lost}kg` : ''})`,
      });
    }
    return list;
  }, [summary]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Progress Tracking</h1>
          <p className="text-muted-foreground">
            Track your fitness journey and celebrate your achievements
          </p>
        </div>
        <Badge variant={isPublicProfile ? "default" : "secondary"} className="gap-2">
          {isPublicProfile ? (
            <>
              <Eye className="w-4 h-4" />
              Public Profile
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              Private Profile
            </>
          )}
        </Badge>
      </div>

      {/* Overall Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Days Active</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.stats.days_active ?? (loading ? '...' : 0)}</div>
            <p className="text-xs text-muted-foreground">
              {summary?.stats.started_at
                ? `Since ${String(summary.stats.started_at).slice(0, 10)}`
                : 'No activity yet'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Weight Lost</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {summary?.stats.total_weight_lost_kg != null ? `${summary.stats.total_weight_lost_kg} kg` : (loading ? '...' : '—')}
            </div>
            <p className="text-xs text-muted-foreground">
              {summary?.stats.start_weight_kg != null && summary?.stats.current_weight_kg != null
                ? `From ${summary.stats.start_weight_kg}kg to ${summary.stats.current_weight_kg}kg`
                : 'Log weigh-ins to see weight changes'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Workouts Completed</CardTitle>
            <Dumbbell className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.stats.workouts_completed ?? (loading ? '...' : 0)}</div>
            <p className="text-xs text-muted-foreground">+{summary?.stats.workouts_this_month ?? 0} this month</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Meal Logs</CardTitle>
            <Apple className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{summary?.stats.meal_logs ?? (loading ? '...' : 0)}</div>
            <p className="text-xs text-muted-foreground">Average {summary?.stats.meals_per_day_avg ?? 0}/day</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="achievements">Achievements</TabsTrigger>
          <TabsTrigger value="milestones">Milestones</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Weekly Check-In</CardTitle>
              <CardDescription>Share how you are feeling so your coach can adjust your plan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Adherence (1-5)</p>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={checkInForm.adherence}
                    onChange={(e) => setCheckInForm({ ...checkInForm, adherence: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Fatigue (1-5)</p>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={checkInForm.fatigue}
                    onChange={(e) => setCheckInForm({ ...checkInForm, fatigue: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Pain (1-5)</p>
                  <Input
                    type="number"
                    min={1}
                    max={5}
                    value={checkInForm.pain}
                    onChange={(e) => setCheckInForm({ ...checkInForm, pain: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">Weight (kg)</p>
                  <Input
                    type="number"
                    value={checkInForm.weightKg}
                    onChange={(e) => setCheckInForm({ ...checkInForm, weightKg: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Notes</p>
                <Textarea
                  value={checkInForm.notes}
                  onChange={(e) => setCheckInForm({ ...checkInForm, notes: e.target.value })}
                  placeholder="Anything your trainer or nutritionist should know about this week"
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {checkIns.length > 0
                    ? `Last check-in: ${new Date(checkIns[0].loggedAt).toLocaleDateString()}`
                    : 'No check-ins yet'}
                </div>
                <Button onClick={handleSaveCheckIn} disabled={savingCheckIn || !user}>
                  {savingCheckIn ? 'Saving...' : 'Save Check-In'}
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">Recent check-ins</p>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {checkIns.length === 0 ? (
                    <p className="text-xs text-muted-foreground">You have not logged any check-ins yet.</p>
                  ) : (
                    checkIns.map((ci) => (
                      <div key={ci.id} className="flex items-center justify-between text-xs border border-border rounded-md px-3 py-2">
                        <div className="space-y-0.5">
                          <p className="font-medium">
                            {new Date(ci.loggedAt).toLocaleDateString()}
                          </p>
                          <p className="text-muted-foreground">
                            A {ci.adherence ?? '-'} · F {ci.fatigue ?? '-'} · P {ci.pain ?? '-'}{' '}
                            {ci.weightKg != null ? `· ${ci.weightKg}kg` : ''}
                          </p>
                        </div>
                        {ci.notes && (
                          <p className="ml-4 max-w-xs truncate text-muted-foreground">{ci.notes}</p>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Weight Progress */}
          <Card>
            <CardHeader>
              <CardTitle>Weight Progress</CardTitle>
              <CardDescription>Your weight journey over the past 6 months</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={weightData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Area type="monotone" dataKey="weight" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                  <Line type="monotone" dataKey="target" stroke="hsl(var(--destructive))" strokeDasharray="5 5" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Workout Consistency */}
            <Card>
              <CardHeader>
                <CardTitle>Workout Consistency</CardTitle>
                <CardDescription>Weekly workout sessions vs target</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={workoutData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="week" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="sessions" fill="hsl(var(--primary))" />
                    <Line type="monotone" dataKey="target" stroke="hsl(var(--destructive))" strokeDasharray="5 5" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Calorie Adherence */}
            <Card>
              <CardHeader>
                <CardTitle>Calorie Adherence</CardTitle>
                <CardDescription>Daily calorie intake vs target (this week)</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={calorieData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="calories" stroke="hsl(var(--primary))" strokeWidth={2} />
                    <Line type="monotone" dataKey="target" stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Current Goals Progress */}
          <Card>
            <CardHeader>
              <CardTitle>Current Goals</CardTitle>
              <CardDescription>Your progress towards active goals</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Weight Change</span>
                  <span className="text-sm text-muted-foreground">
                    {summary?.stats.start_weight_kg != null && summary?.stats.current_weight_kg != null
                      ? `${summary.stats.start_weight_kg}kg → ${summary.stats.current_weight_kg}kg`
                      : 'No weigh-ins logged'}
                  </span>
                </div>
                <ProgressBar value={weightChangePercent} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Monthly Workouts</span>
                  <span className="text-sm text-muted-foreground">
                    {monthlyWorkouts} / {monthlyWorkoutTarget || 0}
                  </span>
                </div>
                <ProgressBar value={monthlyWorkoutProgress} />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Calorie Consistency</span>
                  <span className="text-sm text-muted-foreground">{calorieConsistency}%</span>
                </div>
                <ProgressBar value={calorieConsistency} />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="achievements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Achievements</CardTitle>
              <CardDescription>Unlock achievements as you progress on your fitness journey</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                {achievements.map((achievement) => {
                  const Icon = achievement.icon;
                  return (
                    <div
                      key={achievement.id}
                      className={`flex items-start space-x-4 rounded-lg border p-4 ${
                        achievement.earned ? 'bg-card' : 'bg-muted/50 opacity-60'
                      }`}
                    >
                      <div className={`rounded-lg p-2 ${achievement.earned ? 'bg-primary' : 'bg-muted'}`}>
                        <Icon className={`h-6 w-6 ${achievement.earned ? 'text-primary-foreground' : 'text-muted-foreground'}`} />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold">{achievement.title}</p>
                          {achievement.earned && <Badge variant="secondary">Earned</Badge>}
                        </div>
                        <p className="text-sm text-muted-foreground">{achievement.description}</p>
                        {achievement.earned && achievement.date && (
                          <p className="text-xs text-muted-foreground">Earned on {achievement.date}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="milestones" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Journey Milestones</CardTitle>
              <CardDescription>Key moments in your fitness journey</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-8">
                {milestones.map((milestone, index) => (
                  <div key={milestone.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary">
                        <Trophy className="h-5 w-5 text-primary-foreground" />
                      </div>
                      {index < milestones.length - 1 && (
                        <div className="h-full w-px bg-border my-2"></div>
                      )}
                    </div>
                    <div className="flex-1 pb-8">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold">{milestone.title}</h3>
                        <Badge variant="outline">{milestone.date}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{milestone.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Progress;
