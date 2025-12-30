import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import ProgressCharts from '@/components/charts/ProgressCharts';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  getMemberProfile,
  getTodayMeals,
  getTodayWorkouts,
  fetchMemberDashboardSummary,
  fetchMemberProgressSummary,
  type BackendMemberProfile,
  type TodayMealItem,
  type TodayWorkoutItem,
  type MemberDashboardSummary,
  type MemberProgressSummary,
} from '@/services/api/appBackend';
import { 
  Activity, 
  Target, 
  TrendingUp, 
  Flame, 
  UtensilsCrossed,
  Dumbbell,
  Calendar,
  CheckCircle2
} from 'lucide-react';

const MemberDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<BackendMemberProfile | null>(null);
  const [todayMeals, setTodayMeals] = useState<TodayMealItem[]>([]);
  const [todayWorkouts, setTodayWorkouts] = useState<TodayWorkoutItem[]>([]);
  const [summary, setSummary] = useState<MemberDashboardSummary | null>(null);
  const [progressSummary, setProgressSummary] = useState<MemberProgressSummary | null>(null);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setTodayMeals([]);
      setTodayWorkouts([]);
      setProgressSummary(null);
      return;
    }

    const load = async () => {
      try {
        const progressPromise = fetchMemberProgressSummary(user.id);
        const [p, meals, workouts, dash] = await Promise.all([
          getMemberProfile(user.id),
          getTodayMeals(user.id),
          getTodayWorkouts(user.id),
          fetchMemberDashboardSummary(user.id),
        ]);

        setProfile(p);
        setTodayMeals(meals);
        setTodayWorkouts(workouts);
        setSummary(dash);

        try {
          const progress = await progressPromise;
          setProgressSummary(progress);
        } catch (progressError) {
          console.error('Failed to load progress summary', progressError);
          setProgressSummary(null);
        }
      } catch (error) {
        console.error('Failed to load member dashboard data', error);
      }
    };

    load();
  }, [user]);

  const caloriesConsumed = todayMeals.reduce(
    (sum, item) => sum + (Number(item.calories) || 0),
    0
  );
  const caloriesBurned = todayWorkouts.reduce(
    (sum, item) => sum + (Number(item.calories_burned) || 0),
    0
  );

  const caloriesTarget =
    (profile?.targetCalories != null && profile.targetCalories > 0
      ? profile.targetCalories
      : profile?.tdee && profile.tdee > 0
        ? profile.tdee
        : 1700);

  const mealsLogged = todayMeals.length;

  const todayStats = {
    caloriesConsumed: Math.round(caloriesConsumed),
    caloriesTarget: Math.round(caloriesTarget),
    caloriesBurned: Math.round(caloriesBurned),
    waterIntake: 0,
    waterTarget: profile?.dailyWaterLiters ? Number(profile.dailyWaterLiters) * 4 : 8,
    workoutCompleted: todayWorkouts.length > 0,
    mealLogged: mealsLogged,
    mealsTarget: 4,
  };

  // Weekly workout adherence derived from last 7 days
  const workoutsCompleted = summary ? summary.days.filter((d) => d.calories_burned > 0).length : 0;
  const workoutsTarget = profile?.weeklyWorkoutMinutes
    ? Math.max(1, Math.round(profile.weeklyWorkoutMinutes / 30))
    : 5;
  const adherence = workoutsTarget ? Math.round((workoutsCompleted / workoutsTarget) * 100) : 0;

  const weeklyProgress = {
    weight: profile?.weightKg ?? 0,
    targetWeight: profile?.weightKg ?? 0,
    adherence,
    workoutsCompleted,
    workoutsTarget,
  };

  // Chart data based on real backend summary
  const weightData =
    progressSummary && progressSummary.charts.weight && progressSummary.charts.weight.length > 0
      ? progressSummary.charts.weight.map((row) => ({
          date: row.date,
          weight: Number(row.weight) || 0,
          target:
            progressSummary.stats.current_weight_kg != null
              ? Number(progressSummary.stats.current_weight_kg)
              : Number(row.weight) || 0,
        }))
      : summary
        ? summary.days.map((d) => ({
            date: d.label,
            weight: profile?.weightKg ?? 0,
            target: profile?.weightKg ?? 0,
          }))
        : [];

  const calorieData = summary
    ? summary.days.map((d) => ({
        date: d.label,
        consumed: Math.round(d.calories_consumed),
        burned: Math.round(d.calories_burned),
        target: Math.round(caloriesTarget),
      }))
    : [];

  const todaySummary = summary && summary.days.length > 0 ? summary.days[summary.days.length - 1] : null;

  const macroData = todaySummary
    ? [
        { name: 'Protein', value: Math.round(todaySummary.protein), color: 'hsl(var(--primary))' },
        { name: 'Carbs', value: Math.round(todaySummary.carbs), color: 'hsl(var(--secondary))' },
        { name: 'Fats', value: Math.round(todaySummary.fat), color: 'hsl(var(--accent))' },
      ]
    : [
        { name: 'Protein', value: 0, color: 'hsl(var(--primary))' },
        { name: 'Carbs', value: 0, color: 'hsl(var(--secondary))' },
        { name: 'Fats', value: 0, color: 'hsl(var(--accent))' },
      ];

  const calorieProgress = (todayStats.caloriesConsumed / todayStats.caloriesTarget) * 100;
  const waterProgress = (todayStats.waterIntake / todayStats.waterTarget) * 100;

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">My Dashboard</h1>
          <p className="text-muted-foreground">Track your fitness journey</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate('/dashboard/schedule')}>
            <Calendar className="w-4 h-4 mr-2" />
            View Schedule
          </Button>
          <Button size="sm" className="bg-gradient-primary" onClick={() => navigate('/dashboard/meals')}>
            <UtensilsCrossed className="w-4 h-4 mr-2" />
            Log Meal
          </Button>
        </div>
      </div>

      {/* Today's Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Calories Card */}
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Calories Today</CardTitle>
            <Flame className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {todayStats.caloriesConsumed}
            </div>
            <p className="text-xs text-muted-foreground">
              of {todayStats.caloriesTarget} target
            </p>
            <Progress value={calorieProgress} className="mt-2" />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Consumed</span>
              <span>{Math.round(calorieProgress)}%</span>
            </div>
          </CardContent>
        </Card>

        {/* Workout Card */}
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Workout</CardTitle>
            <Dumbbell className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-foreground">
                  {todayStats.caloriesBurned}
                </div>
                <p className="text-xs text-muted-foreground">calories burned</p>
              </div>
              {todayStats.workoutCompleted ? (
                <Badge variant="secondary" className="bg-success text-success-foreground">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Complete
                </Badge>
              ) : (
                <Badge variant="outline">Pending</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Water Intake Card */}
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Water Intake</CardTitle>
            <Activity className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {todayStats.waterIntake}
            </div>
            <p className="text-xs text-muted-foreground">
              of {todayStats.waterTarget} glasses
            </p>
            <Progress value={waterProgress} className="mt-2" />
            <div className="flex justify-between text-xs text-muted-foreground mt-1">
              <span>Progress</span>
              <span>{Math.round(waterProgress)}%</span>
            </div>
          </CardContent>
        </Card>

        {/* Weekly Progress Card */}
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Weekly Progress</CardTitle>
            <TrendingUp className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {weeklyProgress.adherence}%
            </div>
            <p className="text-xs text-muted-foreground">adherence rate</p>
            <div className="flex items-center mt-2 text-xs">
              <span className="text-muted-foreground">
                Workouts: {weeklyProgress.workoutsCompleted}/{weeklyProgress.workoutsTarget}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-foreground">Quick Actions</CardTitle>
          <CardDescription>Manage your daily fitness activities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button variant="outline" className="h-20 flex-col" onClick={() => navigate('/dashboard/meals')}>
              <UtensilsCrossed className="w-6 h-6 mb-2" />
              <span className="text-sm">Log Meal</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col" onClick={() => navigate('/dashboard/workouts')}>
              <Dumbbell className="w-6 h-6 mb-2" />
              <span className="text-sm">Log Workout</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col" onClick={() => navigate('/dashboard/profile')}>
              <Target className="w-6 h-6 mb-2" />
              <span className="text-sm">Update Goals</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col" onClick={() => navigate('/dashboard/progress')}>
              <TrendingUp className="w-6 h-6 mb-2" />
              <span className="text-sm">View Progress</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Progress Charts */}
      <ProgressCharts 
        weightData={weightData}
        calorieData={calorieData}
        macroData={macroData}
      />

      {/* Recent Activities */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-foreground">Recent Activities</CardTitle>
          <CardDescription>Your latest fitness activities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {summary && summary.activities.length > 0 ? (
              summary.activities.map((activity) => {
                const isMeal = activity.type === 'meal';
                const title = isMeal
                  ? `Logged ${activity.meal_type ?? 'meal'} meal`
                  : 'Workout logged';
                const timeLabel = new Date(activity.logged_at).toLocaleString();
                const caloriesLabel = `${Math.round(activity.calories)} cal${isMeal ? '' : ' burned'}`;

                return (
                  <div
                    key={`${activity.type}-${activity.id}-${activity.logged_at}`}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full ${
                          isMeal ? 'bg-secondary' : 'bg-primary'
                        }`}
                      />
                      <div>
                        <p className="text-sm font-medium text-foreground">{title}</p>
                        <p className="text-xs text-muted-foreground">{timeLabel}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {caloriesLabel}
                    </Badge>
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-muted-foreground">No recent activities yet. Start logging meals and workouts!</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default MemberDashboard;