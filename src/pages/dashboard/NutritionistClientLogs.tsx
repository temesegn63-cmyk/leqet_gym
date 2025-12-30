import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Calendar, RefreshCw } from 'lucide-react';
import {
  fetchMemberOverview,
  getMealsByDate,
  type MealsByDateRow,
  type MemberOverview,
} from '@/services/api/appBackend';

const mealOrder = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

const NutritionistClientLogs: React.FC = () => {
  const [members, setMembers] = useState<MemberOverview[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [isLoadingMeals, setIsLoadingMeals] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<MealsByDateRow[]>([]);

  const selectedMember = useMemo(() => {
    const id = Number(selectedMemberId);
    if (!id) return null;
    return members.find((m) => m.id === id) ?? null;
  }, [members, selectedMemberId]);

  useEffect(() => {
    const loadMembers = async () => {
      try {
        setIsLoadingMembers(true);
        const m = await fetchMemberOverview();
        setMembers(m || []);
        setError(null);
      } catch (e) {
        console.error('Failed to load members', e);
        setError('Failed to load clients');
      } finally {
        setIsLoadingMembers(false);
      }
    };
    loadMembers();
  }, []);

  const loadMeals = async () => {
    if (!selectedMember) return;

    try {
      setIsLoadingMeals(true);
      const res = await getMealsByDate(selectedMember.id, date);
      setRows(res || []);
      setError(null);
    } catch (e) {
      console.error('Failed to load meals by date', e);
      setRows([]);
      setError('Failed to load meal logs');
      toast({
        title: 'Failed to load meal logs',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingMeals(false);
    }
  };

  useEffect(() => {
    if (!selectedMemberId) {
      setRows([]);
      return;
    }
    loadMeals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMemberId, date]);

  const byType = useMemo(() => {
    const map: Record<string, MealsByDateRow> = {};
    for (const r of rows) {
      map[r.meal_type] = r;
    }
    return map;
  }, [rows]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        acc.calories += Number(r.total_calories) || 0;
        acc.protein += Number(r.total_protein) || 0;
        acc.carbs += Number(r.total_carbs) || 0;
        acc.fat += Number(r.total_fat) || 0;
        acc.items += Number(r.items_count) || 0;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, items: 0 }
    );
  }, [rows]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Client Logs</h1>
        <p className="text-muted-foreground">Review client meal logging by date</p>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-foreground">Filters</CardTitle>
          <CardDescription>Select a client and date</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="w-full md:w-72">
              <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingMembers ? 'Loading clients...' : 'Select a client'} />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-full md:w-auto">
              <div className="relative">
                <Calendar className="h-4 w-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-10 w-full md:w-[180px] rounded-md border border-input bg-background px-10 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>
            </div>
          </div>

          <Button variant="outline" onClick={loadMeals} disabled={!selectedMember || isLoadingMeals}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardContent>
      </Card>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {!selectedMember && !isLoadingMembers && (
        <div className="text-sm text-muted-foreground">Select a client to view meal logs.</div>
      )}

      {selectedMember && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Calories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{Math.round(totals.calories)}</div>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Protein</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{Math.round(totals.protein)}g</div>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Carbs</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{Math.round(totals.carbs)}g</div>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Fat</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-foreground">{Math.round(totals.fat)}g</div>
              </CardContent>
            </Card>
          </div>

          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-foreground">Meals</CardTitle>
              <CardDescription>
                {selectedMember.full_name} · {date}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingMeals ? (
                <div className="text-sm text-muted-foreground">Loading meals...</div>
              ) : (
                <div className="space-y-3">
                  {mealOrder.map((type) => {
                    const r = byType[type];
                    const has = r != null && (Number(r.items_count) || 0) > 0;

                    return (
                      <div
                        key={type}
                        className="flex flex-col gap-2 rounded-lg border border-border p-3 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="flex items-center justify-between md:block">
                          <div className="font-medium text-foreground capitalize">{type}</div>
                          <Badge variant={has ? 'secondary' : 'outline'}>
                            {has ? `${r.items_count} items` : 'No log'}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-2 md:flex md:items-center md:gap-4 text-sm">
                          <div className="text-muted-foreground">
                            <span className="font-medium text-foreground">{has ? Math.round(r.total_calories) : 0}</span> cal
                          </div>
                          <div className="text-muted-foreground">
                            <span className="font-medium text-foreground">{has ? Math.round(r.total_protein) : 0}</span> p
                          </div>
                          <div className="text-muted-foreground">
                            <span className="font-medium text-foreground">{has ? Math.round(r.total_carbs) : 0}</span> c
                          </div>
                          <div className="text-muted-foreground">
                            <span className="font-medium text-foreground">{has ? Math.round(r.total_fat) : 0}</span> f
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default NutritionistClientLogs;
