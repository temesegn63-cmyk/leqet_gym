import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  fetchMemberDashboardSummary,
  fetchMemberOverview,
  type MemberDashboardSummary,
  type MemberOverview,
} from '@/services/api/appBackend';
import { differenceInDays, format, parseISO } from 'date-fns';
import { BarChart3, Target, TrendingUp, Users } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

type RangeKey = '7' | '14' | '30';

const clampPercent = (v: number) => Math.max(0, Math.min(100, v));

const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

const safeDate = (value?: string | null) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isFinite(d.getTime()) ? d : null;
};

const NutritionistAnalytics: React.FC = () => {
  const [members, setMembers] = useState<MemberOverview[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [range, setRange] = useState<RangeKey>('14');

  const [summary, setSummary] = useState<MemberDashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedMember = useMemo(() => {
    const id = Number(selectedMemberId);
    if (!id) return null;
    return members.find((m) => m.id === id) ?? null;
  }, [members, selectedMemberId]);

  useEffect(() => {
    const loadMembers = async () => {
      try {
        setIsLoading(true);
        const m = await fetchMemberOverview();
        setMembers(m || []);
        setError(null);
      } catch (e) {
        console.error('Failed to load nutritionist analytics members', e);
        setError('Failed to load clients');
      } finally {
        setIsLoading(false);
      }
    };
    loadMembers();
  }, []);

  useEffect(() => {
    const loadSummary = async () => {
      if (!selectedMember) {
        setSummary(null);
        return;
      }

      try {
        setIsLoading(true);
        const s = await fetchMemberDashboardSummary(selectedMember.id, Number(range));
        setSummary(s);
        setError(null);
      } catch (e) {
        console.error('Failed to load nutritionist analytics summary', e);
        setError('Failed to load analytics');
        setSummary(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadSummary();
  }, [selectedMember, range]);

  const days = useMemo(() => summary?.days ?? [], [summary]);

  const calorieSeries = useMemo(() => {
    return days.map((d) => ({
      date: d.label,
      consumed: Math.round(Number(d.calories_consumed) || 0),
    }));
  }, [days]);

  const macroSeries = useMemo(() => {
    const last = days.length ? days[days.length - 1] : null;
    const protein = Math.round(Number(last?.protein) || 0);
    const carbs = Math.round(Number(last?.carbs) || 0);
    const fat = Math.round(Number(last?.fat) || 0);

    return [
      { name: 'Protein', value: protein },
      { name: 'Carbs', value: carbs },
      { name: 'Fat', value: fat },
    ];
  }, [days]);

  const compliance = useMemo(() => {
    if (!selectedMember) return 0;
    // heuristic: meals today (0-3+) with recency penalty
    const mealsTarget = 3;
    const base = clampPercent(Math.round(((Number(selectedMember.meals_today) || 0) / mealsTarget) * 100));
    const last = safeDate(selectedMember.last_activity);
    const daysSince = last ? differenceInDays(new Date(), last) : 999;
    const penalty = daysSince <= 1 ? 0 : Math.min(40, daysSince * 5);
    return clampPercent(base - penalty);
  }, [selectedMember]);

  const weekOverWeek = useMemo(() => {
    if (days.length < 14) return null;
    const first = days.slice(0, 7);
    const second = days.slice(days.length - 7);
    const firstAvg = sum(first.map((d) => Number(d.calories_consumed) || 0)) / 7;
    const secondAvg = sum(second.map((d) => Number(d.calories_consumed) || 0)) / 7;
    const delta = secondAvg - firstAvg;
    const pct = firstAvg ? (delta / firstAvg) * 100 : 0;
    return { firstAvg, secondAvg, delta, pct };
  }, [days]);

  const recentActivityLabel = useMemo(() => {
    if (!selectedMember?.last_activity) return 'No activity yet';
    const d = safeDate(selectedMember.last_activity);
    if (!d) return 'No activity yet';
    const ds = differenceInDays(new Date(), d);
    if (ds <= 0) return 'Today';
    if (ds === 1) return 'Yesterday';
    return `${ds} days ago`;
  }, [selectedMember]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Nutrition Analytics</h1>
        <p className="text-muted-foreground">Track client nutrition trends and compliance</p>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-foreground flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Filters
          </CardTitle>
          <CardDescription>Select a client and time range</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
            <SelectTrigger>
              <SelectValue placeholder="Select a client" />
            </SelectTrigger>
            <SelectContent>
              {members.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.full_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger>
              <SelectValue placeholder="Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {error && <div className="text-sm text-destructive">{error}</div>}
      {isLoading && <div className="text-sm text-muted-foreground">Loading analytics...</div>}

      {!selectedMember && !isLoading && (
        <div className="text-sm text-muted-foreground">Select a client to view analytics.</div>
      )}

      {selectedMember && !isLoading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Meals Today</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{selectedMember.meals_today}</div>
                <p className="text-xs text-muted-foreground">Last activity: {recentActivityLabel}</p>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Compliance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-2xl font-bold text-foreground">{compliance}%</div>
                  <Badge variant={compliance >= 80 ? 'secondary' : compliance >= 60 ? 'outline' : 'destructive'}>
                    {compliance >= 80 ? 'On track' : compliance >= 60 ? 'Watch' : 'At risk'}
                  </Badge>
                </div>
                <Progress value={compliance} className="mt-2" />
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Avg Calories (range)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">
                  {days.length ? Math.round(sum(days.map((d) => Number(d.calories_consumed) || 0)) / days.length) : 0}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Week-over-week</CardTitle>
              </CardHeader>
              <CardContent>
                {weekOverWeek ? (
                  <div>
                    <div className="text-2xl font-bold text-foreground">{weekOverWeek.pct >= 0 ? '+' : ''}{weekOverWeek.pct.toFixed(0)}%</div>
                    <p className="text-xs text-muted-foreground">
                      {Math.round(weekOverWeek.firstAvg)} → {Math.round(weekOverWeek.secondAvg)} cal/day
                    </p>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">Need 14+ days data</div>
                )}
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="calories" className="space-y-4">
            <TabsList>
              <TabsTrigger value="calories">Calories</TabsTrigger>
              <TabsTrigger value="macros">Macros (latest day)</TabsTrigger>
            </TabsList>

            <TabsContent value="calories" className="space-y-4">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-primary" />
                    Calories Trend
                  </CardTitle>
                  <CardDescription>Daily calories consumed</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={calorieSeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="consumed" stroke="hsl(var(--primary))" strokeWidth={2} name="Consumed" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="macros" className="space-y-4">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <BarChart3 className="h-5 w-5 text-primary" />
                    Macro Breakdown
                  </CardTitle>
                  <CardDescription>Latest day macros from dashboard summary</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={macroSeries}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="value" fill="hsl(var(--primary))" name="grams" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="text-foreground flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    Latest day details
                  </CardTitle>
                  <CardDescription>
                    {days.length ? format(parseISO(days[days.length - 1].date), 'PPP') : 'No data'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {days.length ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="rounded-lg border border-border p-3">
                        <div className="text-xs text-muted-foreground">Calories</div>
                        <div className="text-lg font-bold text-foreground">{Math.round(days[days.length - 1].calories_consumed)}</div>
                      </div>
                      <div className="rounded-lg border border-border p-3">
                        <div className="text-xs text-muted-foreground">Protein</div>
                        <div className="text-lg font-bold text-foreground">{Math.round(days[days.length - 1].protein)}g</div>
                      </div>
                      <div className="rounded-lg border border-border p-3">
                        <div className="text-xs text-muted-foreground">Carbs</div>
                        <div className="text-lg font-bold text-foreground">{Math.round(days[days.length - 1].carbs)}g</div>
                      </div>
                      <div className="rounded-lg border border-border p-3">
                        <div className="text-xs text-muted-foreground">Fat</div>
                        <div className="text-lg font-bold text-foreground">{Math.round(days[days.length - 1].fat)}g</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No dashboard summary data yet.</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
};

export default NutritionistAnalytics;
