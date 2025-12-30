import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Exercise } from '@/types';
import { toast } from '@/hooks/use-toast';
import { 
  Plus, 
  Dumbbell, 
  Flame, 
  Timer,
  Activity,
  TrendingUp,
  Play,
  Pause,
  Square,
  Footprints,
  Search
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchExercises,
  getTodayWorkouts,
  logWorkout,
  deleteWorkoutItem,
} from '@/services/api/appBackend';

interface WorkoutEntry {
  exercise: Exercise;
  duration: number;
  intensity: 'low' | 'medium' | 'high';
  caloriesBurned: number;
  itemId?: number;
  weightUsed?: number;
  weightUnit?: string;
}

const inferExerciseCategory = (name: string): string => {
  const lower = name.toLowerCase();
  if (lower.includes('run') || lower.includes('cycle') || lower.includes('bike') || lower.includes('walk')) {
    return 'cardio';
  }
  if (lower.includes('press') || lower.includes('squat') || lower.includes('deadlift') || lower.includes('bench')) {
    return 'strength';
  }
  if (lower.includes('yoga') || lower.includes('stretch')) {
    return 'flexibility';
  }
  return 'sports';
};

const WorkoutLogging: React.FC = () => {
  const { user } = useAuth();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const [duration, setDuration] = useState<number>(30);
  const [intensity, setIntensity] = useState<'low' | 'medium' | 'high'>('medium');
  const [weightUsed, setWeightUsed] = useState<string>('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg');
  const [todayWorkouts, setTodayWorkouts] = useState<WorkoutEntry[]>([]);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [dailySteps, setDailySteps] = useState<number>(0);
  const [stepsInput, setStepsInput] = useState<string>('');
  const [exerciseSearchTerm, setExerciseSearchTerm] = useState<string>('');

  React.useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds(seconds => seconds + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  useEffect(() => {
    if (!user) {
      setTodayWorkouts([]);
      return;
    }

    const load = async () => {
      try {
        const [exerciseRows, workoutRows] = await Promise.all([
          fetchExercises(exerciseSearchTerm ? exerciseSearchTerm : undefined),
          getTodayWorkouts(user.id),
        ]);

        const mappedExercises: Exercise[] = exerciseRows.map((e) => ({
          id: e.id,
          name: e.name,
          category: inferExerciseCategory(e.name),
          caloriesPerMinute: e.caloriesPerMinute,
        }));

        setExercises(mappedExercises);

        const entries: WorkoutEntry[] = workoutRows.map((item) => {
          const baseExercise =
            mappedExercises.find((e) => Number(e.id) === item.exercise_id) || {
              id: String(item.exercise_id),
              name: item.exercise_name,
              category: inferExerciseCategory(item.exercise_name),
              caloriesPerMinute:
                item.duration_minutes > 0
                  ? Math.round(item.calories_burned / item.duration_minutes)
                  : 0,
            };

          return {
            exercise: baseExercise,
            duration: Number(item.duration_minutes) || 0,
            intensity: 'medium',
            caloriesBurned: Number(item.calories_burned) || 0,
            itemId: item.item_id,
            weightUsed: item.weight_used != null ? Number(item.weight_used) : undefined,
            weightUnit: item.weight_unit ?? undefined,
          };
        });

        setTodayWorkouts(entries);
      } catch (error) {
        console.error('Failed to load workouts from backend', error);
      }
    };

    load();
  }, [user, exerciseSearchTerm]);

  const calculateCaloriesBurned = (exercise: Exercise, duration: number, intensity: 'low' | 'medium' | 'high') => {
    const intensityMultiplier = {
      low: 0.8,
      medium: 1.0,
      high: 1.3
    };
    return Math.round(exercise.caloriesPerMinute * duration * intensityMultiplier[intensity]);
  };

  const addWorkout = async () => {
    if (!user) {
      toast({
        title: "Please log in",
        description: "You need to be logged in to log workouts",
        variant: "destructive"
      });
      return;
    }

    if (!selectedExercise) {
      toast({
        title: "Please select an exercise",
        description: "Choose an exercise to add to your workout",
        variant: "destructive"
      });
      return;
    }

    const caloriesBurned = calculateCaloriesBurned(selectedExercise, duration, intensity);

    const parsedWeightUsed = weightUsed.trim() ? Number(weightUsed) : undefined;
    const safeWeightUsed =
      parsedWeightUsed != null && Number.isFinite(parsedWeightUsed) && parsedWeightUsed >= 0
        ? parsedWeightUsed
        : undefined;
    const workoutEntry: WorkoutEntry = {
      exercise: selectedExercise,
      duration,
      intensity,
      caloriesBurned,
      weightUsed: safeWeightUsed,
      weightUnit: safeWeightUsed != null ? weightUnit : undefined,
    };

    try {
      const res = await logWorkout({
        member_id: user.id,
        exercise_id: selectedExercise.id,
        exercise_name: selectedExercise.name,
        duration_minutes: duration,
        calories_burned: caloriesBurned,
        weight_used: safeWeightUsed,
        weight_unit: safeWeightUsed != null ? weightUnit : undefined,
      });

      workoutEntry.itemId = res.item_id;

      setTodayWorkouts(prev => [...prev, workoutEntry]);

      toast({
        title: "Workout logged successfully!",
        description: `Added ${duration} minutes of ${selectedExercise.name}`,
      });
    } catch (error) {
      console.error('Failed to log workout', error);
      toast({
        title: "Failed to log workout",
        description: "Something went wrong while saving to the server",
        variant: "destructive"
      });
    }

    setSelectedExercise(null);
    setDuration(30);
    setIntensity('medium');
    setWeightUsed('');
    setWeightUnit('kg');
  };

  const removeWorkout = async (index: number) => {
    const entry = todayWorkouts[index];

    setTodayWorkouts(prev => prev.filter((_, i) => i !== index));

    if (entry?.itemId) {
      try {
        await deleteWorkoutItem(entry.itemId);
      } catch (error) {
        console.error('Failed to delete workout item', error);
      }
    }
  };

  const getTotalStats = () => {
    return todayWorkouts.reduce(
      (totals, workout) => ({
        duration: totals.duration + workout.duration,
        calories: totals.calories + workout.caloriesBurned
      }),
      { duration: 0, calories: 0 }
    );
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const totalStats = getTotalStats();
  const weeklyGoal = 300; // minutes
  const weeklyProgress = (totalStats.duration / weeklyGoal) * 100;
  const dailyStepsGoal = 10000;
  const stepsProgress = (dailySteps / dailyStepsGoal) * 100;

  const handleAddSteps = () => {
    const steps = parseInt(stepsInput);
    if (isNaN(steps) || steps <= 0) {
      toast({
        title: "Invalid steps",
        description: "Please enter a valid number of steps",
        variant: "destructive"
      });
      return;
    }
    setDailySteps(prev => prev + steps);
    setStepsInput('');
    toast({
      title: "Steps logged!",
      description: `Added ${steps.toLocaleString()} steps to your daily total`,
    });
  };

  const exercisesByCategory = exercises.reduce((acc, exercise) => {
    if (!acc[exercise.category]) {
      acc[exercise.category] = [];
    }
    acc[exercise.category].push(exercise);
    return acc;
  }, {} as Record<string, Exercise[]>);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Workout Logging</h1>
          <p className="text-muted-foreground">Track your exercise sessions and calories burned</p>
        </div>
        <div className="flex items-center gap-2 justify-start md:justify-end flex-wrap">
          <Button variant="outline" size="sm">
            <TrendingUp className="w-4 h-4 mr-2" />
            View Progress
          </Button>
        </div>
      </div>

      {/* Daily Summary */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Today's Workout Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{totalStats.duration}</div>
              <div className="text-sm text-muted-foreground">Minutes</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-secondary">{totalStats.calories}</div>
              <div className="text-sm text-muted-foreground">Calories Burned</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-accent">{todayWorkouts.length}</div>
              <div className="text-sm text-muted-foreground">Exercises</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-info">{dailySteps.toLocaleString()}</div>
              <div className="text-sm text-muted-foreground">Steps</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{Math.round(weeklyProgress)}%</div>
              <div className="text-sm text-muted-foreground">Weekly Goal</div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Weekly Exercise Goal Progress</span>
                <span>{totalStats.duration} of {weeklyGoal} minutes</span>
              </div>
              <Progress value={weeklyProgress} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Daily Steps Goal Progress</span>
                <span>{dailySteps.toLocaleString()} of {dailyStepsGoal.toLocaleString()} steps</span>
              </div>
              <Progress value={Math.min(stepsProgress, 100)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Steps Tracking */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Footprints className="w-5 h-5 text-info" />
            Daily Steps Tracker
          </CardTitle>
          <CardDescription>Log your total steps for the day</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Enter Steps</label>
              <Input
                type="number"
                placeholder="e.g., 5000"
                value={stepsInput}
                onChange={(e) => setStepsInput(e.target.value)}
                min="0"
              />
            </div>
            <Button onClick={handleAddSteps} className="w-full md:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Add Steps
            </Button>
          </div>
          <div className="mt-4 p-4 bg-info/10 rounded-lg text-center">
            <div className="text-3xl font-bold text-info">{dailySteps.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Total Steps Today</div>
            <div className="text-xs text-muted-foreground mt-1">
              {stepsProgress >= 100 ? '🎉 Goal reached!' : `${Math.round(dailyStepsGoal - dailySteps).toLocaleString()} steps to go`}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Exercise Timer & Logger */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Timer className="w-5 h-5" />
              Exercise Timer & Logger
            </CardTitle>
            <CardDescription>Log your workouts with built-in timer</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Timer Section */}
            <div className="text-center p-6 bg-gradient-primary text-white rounded-lg">
              <div className="text-4xl font-bold mb-2">{formatTime(timerSeconds)}</div>
              <div className="flex justify-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/20 text-white border-white/30 hover:bg-white/30"
                  onClick={() => setIsTimerRunning(!isTimerRunning)}
                >
                  {isTimerRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="bg-white/20 text-white border-white/30 hover:bg-white/30"
                  onClick={() => {
                    setIsTimerRunning(false);
                    setTimerSeconds(0);
                  }}
                >
                  <Square className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Search Exercises</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search exercises..."
                  value={exerciseSearchTerm}
                  onChange={(e) => setExerciseSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Tabs defaultValue="cardio" className="w-full">
              <TabsList className="w-full grid grid-cols-2 sm:grid-cols-4 gap-1">
                <TabsTrigger value="cardio">Cardio</TabsTrigger>
                <TabsTrigger value="strength">Strength</TabsTrigger>
                <TabsTrigger value="flexibility">Flexibility</TabsTrigger>
                <TabsTrigger value="sports">Sports</TabsTrigger>
              </TabsList>

              {Object.entries(exercisesByCategory).map(([category, exercises]) => (
                <TabsContent key={category} value={category} className="space-y-3 mt-4">
                  {exercises.map((exercise) => (
                    <div
                      key={exercise.id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedExercise?.id === exercise.id
                          ? 'border-primary bg-primary/10'
                          : 'border-border hover:bg-muted/50'
                      }`}
                      onClick={() => setSelectedExercise(exercise)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium text-foreground">{exercise.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {exercise.caloriesPerMinute} cal/min
                          </div>
                          {exercise.equipment && (
                            <div className="text-xs text-muted-foreground mt-1">
                              Equipment: {exercise.equipment}
                            </div>
                          )}
                        </div>
                        <Badge variant="outline">{exercise.category}</Badge>
                      </div>
                    </div>
                  ))}
                </TabsContent>
              ))}
            </Tabs>

            {selectedExercise && (
              <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{selectedExercise.name}</span>
                  <Badge variant="secondary">{selectedExercise.category}</Badge>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Duration (minutes)</label>
                    <Input
                      type="number"
                      value={duration}
                      onChange={(e) => setDuration(parseInt(e.target.value) || 0)}
                      min="1"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Intensity</label>
                    <Select value={intensity} onValueChange={(value: 'low' | 'medium' | 'high') => setIntensity(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Weight Used (optional)</label>
                    <Input
                      type="number"
                      value={weightUsed}
                      onChange={(e) => setWeightUsed(e.target.value)}
                      min="0"
                      placeholder="e.g., 40"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Unit</label>
                    <Select value={weightUnit} onValueChange={(value: 'kg' | 'lb') => setWeightUnit(value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="lb">lb</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="text-center p-3 bg-secondary/10 rounded">
                  <div className="text-lg font-bold text-secondary">
                    {calculateCaloriesBurned(selectedExercise, duration, intensity)} calories
                  </div>
                  <div className="text-sm text-muted-foreground">Estimated burn</div>
                </div>

                <Button onClick={addWorkout} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Log Workout
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Today's Workouts */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Dumbbell className="w-5 h-5" />
              Today's Workouts
            </CardTitle>
            <CardDescription>Your logged exercises for today</CardDescription>
          </CardHeader>
          <CardContent>
            {todayWorkouts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Dumbbell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No workouts logged today</p>
                <p className="text-sm">Start by selecting an exercise!</p>
              </div>
            ) : (
              <div className="space-y-3">
                {todayWorkouts.map((workout, index) => (
                  <div key={index} className="p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-foreground">{workout.exercise.name}</div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeWorkout(index)}
                      >
                        Remove
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                      <div>
                        <div className="text-muted-foreground">Duration</div>
                        <div className="font-medium">{workout.duration} min</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Intensity</div>
                        <div className="font-medium capitalize">{workout.intensity}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Calories</div>
                        <div className="font-medium text-secondary">{workout.caloriesBurned}</div>
                      </div>
                    </div>

                    {workout.weightUsed != null && workout.weightUnit && (
                      <div className="mt-2 text-sm">
                        <span className="text-muted-foreground">Weight Used</span>
                        <span className="font-medium ml-2">
                          {workout.weightUsed} {workout.weightUnit}
                        </span>
                      </div>
                    )}

                    <div className="mt-2 text-xs text-muted-foreground">
                      Category: {workout.exercise.category}
                      {workout.exercise.equipment && ` • Equipment: ${workout.exercise.equipment}`}
                    </div>
                  </div>
                ))}

                <div className="pt-3 border-t border-border">
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold text-primary">{totalStats.duration}</div>
                      <div className="text-sm text-muted-foreground">Total Minutes</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-secondary">{totalStats.calories}</div>
                      <div className="text-sm text-muted-foreground">Total Calories</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default WorkoutLogging;