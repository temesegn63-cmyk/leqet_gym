import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/contexts/AuthContext';
import {
  getMemberProfile,
  type BackendMemberProfile,
  fetchExercises,
  saveManualWorkoutPlan,
  type SaveManualWorkoutPlanPayload,
  type ManualWorkoutDayPayload,
  type ManualWorkoutExercisePayload,
  type ExerciseSummary,
} from '@/services/api/appBackend';
import { toast } from '@/hooks/use-toast';
import { Dumbbell, Clock, Activity, ArrowLeft } from 'lucide-react';

const TrainerWorkoutPlanBuilder: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const memberIdParam = searchParams.get('memberId');
  const memberId = memberIdParam ? Number(memberIdParam) : null;

  const [memberProfile, setMemberProfile] = useState<BackendMemberProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [days, setDays] = useState<ManualWorkoutDayPayload[]>([]);
  const [planName, setPlanName] = useState('');
  const [planGoal, setPlanGoal] = useState('');
  const [exerciseSearchContext, setExerciseSearchContext] = useState<
    { dayIndex: number; exIndex: number } | null
  >(null);
  const [exerciseSearchQuery, setExerciseSearchQuery] = useState('');
  const [exerciseSearchResults, setExerciseSearchResults] = useState<ExerciseSummary[]>([]);
  const [exerciseSearchLoading, setExerciseSearchLoading] = useState(false);

  useEffect(() => {
    if (!user || !memberId || !Number.isFinite(memberId)) return;

    const load = async () => {
      setLoading(true);
      try {
        const profile = await getMemberProfile(memberId);
        setMemberProfile(profile);
        if (profile?.goal) setPlanGoal(profile.goal);
      } catch (error) {
        console.error('Failed to load member profile for workout builder', error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user, memberId]);

  const openExerciseSearch = (dayIndex: number, exIndex: number) => {
    setExerciseSearchContext({ dayIndex, exIndex });
    setExerciseSearchQuery('');
    setExerciseSearchResults([]);
    setExerciseSearchLoading(false);
  };

  const closeExerciseSearch = () => {
    setExerciseSearchContext(null);
    setExerciseSearchQuery('');
    setExerciseSearchResults([]);
    setExerciseSearchLoading(false);
  };

  const performExerciseSearch = async () => {
    if (!exerciseSearchQuery.trim()) return;
    try {
      setExerciseSearchLoading(true);
      const results = await fetchExercises(exerciseSearchQuery.trim());
      setExerciseSearchResults(results);
    } catch (error) {
      console.error('Failed to search exercises', error);
    } finally {
      setExerciseSearchLoading(false);
    }
  };

  const addDay = () => {
    setDays((prev) => [
      ...prev,
      {
        dayOfWeek: '',
        name: '',
        durationMinutes: 45,
        difficulty: 'Beginner',
        focus: '',
        tips: '',
        exercises: [],
      },
    ]);
  };

  const updateDay = (index: number, patch: Partial<ManualWorkoutDayPayload>) => {
    setDays((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  };

  const addExercise = (dayIndex: number) => {
    setDays((prev) =>
      prev.map((d, i) =>
        i === dayIndex
          ? {
              ...d,
              exercises: [
                ...d.exercises,
                {
                  name: '',
                  sets: 3,
                  reps: '8-12',
                  rest: '60s',
                  durationMinutes: null,
                  intensity: '',
                  instructions: '',
                  targetMuscles: '',
                  category: '',
                } as ManualWorkoutExercisePayload,
              ],
            }
          : d
      )
    );
  };

  const updateExercise = (
    dayIndex: number,
    exIndex: number,
    patch: Partial<ManualWorkoutExercisePayload>
  ) => {
    setDays((prev) =>
      prev.map((d, i) =>
        i === dayIndex
          ? {
              ...d,
              exercises: d.exercises.map((ex, j) => (j === exIndex ? { ...ex, ...patch } : ex)),
            }
          : d
      )
    );
  };

  const removeExercise = (dayIndex: number, exIndex: number) => {
    setDays((prev) =>
      prev.map((d, i) =>
        i === dayIndex
          ? { ...d, exercises: d.exercises.filter((_, j) => j !== exIndex) }
          : d
      )
    );
  };

  const handleSelectExercise = (exercise: ExerciseSummary) => {
    if (!exerciseSearchContext) return;

    const { dayIndex, exIndex } = exerciseSearchContext;
    updateExercise(dayIndex, exIndex, {
      exerciseId: exercise.id,
      name: exercise.name,
    });

    closeExerciseSearch();
  };

  const handleSave = async () => {
    if (!user || !memberId || !Number.isFinite(memberId)) {
      toast({
        title: 'Missing member',
        description: 'No valid member selected for this workout plan.',
        variant: 'destructive',
      });
      return;
    }

    if (!days.length) {
      toast({
        title: 'Add at least one day',
        description: 'Please add at least one workout day with exercises before saving.',
        variant: 'destructive',
      });
      return;
    }

    const normalisedDays: ManualWorkoutDayPayload[] = days.map((d) => ({
      ...d,
      exercises: d.exercises.filter((ex) => ex.name && ex.name.trim().length > 0),
    }));

    if (!normalisedDays.some((d) => d.exercises.length > 0)) {
      toast({
        title: 'Add exercises',
        description: 'Each plan must have at least one exercise.',
        variant: 'destructive',
      });
      return;
    }

    const payload: SaveManualWorkoutPlanPayload = {
      name: planName || undefined,
      goal: planGoal || memberProfile?.goal || undefined,
      days: normalisedDays,
    };

    try {
      setSaving(true);
      await saveManualWorkoutPlan(memberId, payload);
      toast({
        title: 'Workout plan saved',
        description: 'The custom workout plan has been assigned to the member.',
      });
      navigate('/dashboard');
    } catch (error) {
      console.error('Failed to save manual workout plan', error);
      const status =
        error && typeof error === 'object' && 'response' in error
          ? (error as any).response?.status
          : undefined;
      const backendMessage =
        error && typeof error === 'object' && 'response' in error
          ? (error as any).response?.data?.message
          : undefined;
      const message =
        typeof backendMessage === 'string' && backendMessage.trim().length > 0
          ? backendMessage
          : error instanceof Error
            ? error.message
            : 'Something went wrong while saving the plan.';
      const description = status ? `${message} (HTTP ${status})` : message;
      toast({
        title: 'Failed to save workout plan',
        description,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  if (!memberId || !Number.isFinite(memberId)) {
    return (
      <div className="p-6">
        <Button variant="outline" onClick={() => navigate('/dashboard')} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </Button>
        <Card>
          <CardHeader>
            <CardTitle>Workout Plan Builder</CardTitle>
            <CardDescription>No member selected. Please open this from the trainer dashboard.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Dumbbell className="w-6 h-6" />
            Build Workout Plan
          </h1>
          <p className="text-muted-foreground">
            Review member preferences and compose a personalized workout plan.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Saving...' : 'Save & Assign Plan'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Member Overview</CardTitle>
            <CardDescription>Key profile and preferences</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading member details...</p>
            ) : !memberProfile ? (
              <p className="text-sm text-muted-foreground">No profile data available.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <Label>Goal</Label>
                  <p className="mt-1">
                    <Badge variant="outline">{memberProfile.goal || 'Not set'}</Badge>
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Fitness Level</Label>
                    <p className="mt-1 text-muted-foreground">
                      {(memberProfile.trainerIntake as any)?.fitnessLevel || 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <Label>Days / Week</Label>
                    <p className="mt-1 text-muted-foreground">
                      {(memberProfile.trainerIntake as any)?.daysPerWeek ?? '-'}
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Session Length (min)</Label>
                    <p className="mt-1 text-muted-foreground">
                      {(memberProfile.trainerIntake as any)?.sessionLengthMinutes ?? '-'}
                    </p>
                  </div>
                  <div>
                    <Label>Equipment</Label>
                    <p className="mt-1 text-muted-foreground break-words">
                      {(memberProfile.trainerIntake as any)?.equipment || 'Not specified'}
                    </p>
                  </div>
                </div>
                <div>
                  <Label>Injuries / Limitations</Label>
                  <p className="mt-1 text-muted-foreground break-words">
                    {(memberProfile.trainerIntake as any)?.injuries || 'None reported'}
                  </p>
                </div>
                <div>
                  <Label>Preferences</Label>
                  <p className="mt-1 text-muted-foreground break-words">
                    {(memberProfile.trainerIntake as any)?.preferences || 'No specific preferences'}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Plan Structure</CardTitle>
            <CardDescription>Define days and assign exercises.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Plan Name</Label>
                <Input
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  placeholder="e.g. 4-Week Strength & Conditioning"
                />
              </div>
              <div className="space-y-2">
                <Label>Goal</Label>
                <Input
                  value={planGoal}
                  onChange={(e) => setPlanGoal(e.target.value)}
                  placeholder="e.g. muscle_gain, fat_loss, endurance"
                />
              </div>
            </div>

            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>Build out workout days with appropriate focus and difficulty.</span>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addDay}>
                Add Day
              </Button>
            </div>

            {days.length === 0 ? (
              <p className="text-sm text-muted-foreground mt-4">
                No days added yet. Click "Add Day" to start building the plan.
              </p>
            ) : (
              <ScrollArea className="mt-4 max-h-[70vh] pr-2">
                <div className="space-y-4">
                  {days.map((day, dayIndex) => (
                    <Card key={dayIndex} className="border-muted">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Activity className="w-4 h-4" />
                            <CardTitle className="text-base">Day {dayIndex + 1}</CardTitle>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label>Day of Week</Label>
                            <Input
                              value={day.dayOfWeek ?? ''}
                              onChange={(e) =>
                                updateDay(dayIndex, { dayOfWeek: e.target.value || null })
                              }
                              placeholder="e.g. Monday"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Session Name</Label>
                            <Input
                              value={day.name ?? ''}
                              onChange={(e) => updateDay(dayIndex, { name: e.target.value || null })}
                              placeholder="e.g. Upper Body Strength"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Focus</Label>
                            <Input
                              value={day.focus ?? ''}
                              onChange={(e) => updateDay(dayIndex, { focus: e.target.value || null })}
                              placeholder="strength, cardio, mobility"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <Label>Duration (minutes)</Label>
                            <Input
                              type="number"
                              value={day.durationMinutes ?? ''}
                              onChange={(e) =>
                                updateDay(dayIndex, {
                                  durationMinutes: e.target.value
                                    ? Number(e.target.value)
                                    : null,
                                })
                              }
                              min={10}
                              max={180}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Difficulty</Label>
                            <Input
                              value={day.difficulty ?? ''}
                              onChange={(e) =>
                                updateDay(dayIndex, { difficulty: e.target.value || null })
                              }
                              placeholder="Beginner, Intermediate, Advanced"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Tips / Notes</Label>
                            <Input
                              value={day.tips ?? ''}
                              onChange={(e) => updateDay(dayIndex, { tips: e.target.value || null })}
                              placeholder="Warm-up, reminders, etc."
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-2">
                          <Label>Exercises</Label>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => addExercise(dayIndex)}
                          >
                            Add Exercise
                          </Button>
                        </div>

                        {day.exercises.length === 0 ? (
                          <p className="text-xs text-muted-foreground mt-2">
                            No exercises yet. Click "Add Exercise" to add movements.
                          </p>
                        ) : (
                          <div className="space-y-3 mt-2">
                            {day.exercises.map((ex, exIndex) => (
                              <div
                                key={exIndex}
                                className="grid grid-cols-1 md:grid-cols-5 gap-3 border rounded-lg p-3"
                              >
                                <div className="space-y-1">
                                  <Label>Exercise Name</Label>
                                  <Input
                                    value={ex.name}
                                    onChange={(e) =>
                                      updateExercise(dayIndex, exIndex, {
                                        name: e.target.value,
                                      })
                                    }
                                    placeholder="e.g. Squat, Bench Press, Jogging"
                                  />
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="mt-1"
                                    onClick={() => openExerciseSearch(dayIndex, exIndex)}
                                  >
                                    Search exercises
                                  </Button>
                                </div>
                                <div className="space-y-1">
                                  <Label>Sets</Label>
                                  <Input
                                    type="number"
                                    value={ex.sets ?? ''}
                                    onChange={(e) =>
                                      updateExercise(dayIndex, exIndex, {
                                        sets: e.target.value ? Number(e.target.value) : null,
                                      })
                                    }
                                    min={1}
                                    max={10}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>Reps</Label>
                                  <Input
                                    value={ex.reps ?? ''}
                                    onChange={(e) =>
                                      updateExercise(dayIndex, exIndex, {
                                        reps: e.target.value || null,
                                      })
                                    }
                                    placeholder="e.g. 8-12 or 10"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>Rest</Label>
                                  <Input
                                    value={ex.rest ?? ''}
                                    onChange={(e) =>
                                      updateExercise(dayIndex, exIndex, {
                                        rest: e.target.value || null,
                                      })
                                    }
                                    placeholder="e.g. 60s"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>Duration (optional)</Label>
                                  <Input
                                    type="number"
                                    value={ex.durationMinutes ?? ''}
                                    onChange={(e) =>
                                      updateExercise(dayIndex, exIndex, {
                                        durationMinutes: e.target.value
                                          ? Number(e.target.value)
                                          : null,
                                      })
                                    }
                                    min={0}
                                    max={180}
                                  />
                                </div>
                                <div className="space-y-1 md:col-span-2">
                                  <Label>Intensity / Notes</Label>
                                  <Textarea
                                    value={ex.intensity ?? ''}
                                    onChange={(e) =>
                                      updateExercise(dayIndex, exIndex, {
                                        intensity: e.target.value,
                                      })
                                    }
                                    placeholder="e.g. RPE 7-8, moderate pace, etc."
                                    rows={2}
                                  />
                                </div>
                                <div className="space-y-1 md:col-span-2">
                                  <Label>Target Muscles / Category</Label>
                                  <Input
                                    value={ex.targetMuscles ?? ''}
                                    onChange={(e) =>
                                      updateExercise(dayIndex, exIndex, {
                                        targetMuscles: e.target.value,
                                      })
                                    }
                                    placeholder="e.g. chest, triceps, cardio, mobility"
                                  />
                                </div>
                                <div className="flex items-end justify-end">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => removeExercise(dayIndex, exIndex)}
                                  >
                                    Remove
                                  </Button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>

      {exerciseSearchContext && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
          <Card className="w-full max-w-lg max-h-[80vh] flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle>Search exercises</CardTitle>
                <CardDescription>
                  Search the exercise library and pick one for this workout.
                </CardDescription>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={closeExerciseSearch}>
                Close
              </Button>
            </CardHeader>
            <CardContent className="space-y-3 flex-1 flex flex-col">
              <div className="flex gap-2">
                <Input
                  autoFocus
                  placeholder="Search by name, e.g. squat, row..."
                  value={exerciseSearchQuery}
                  onChange={(e) => setExerciseSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void performExerciseSearch();
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void performExerciseSearch()}
                  disabled={exerciseSearchLoading || !exerciseSearchQuery.trim()}
                >
                  {exerciseSearchLoading ? 'Searching...' : 'Search'}
                </Button>
              </div>
              <div className="text-xs text-muted-foreground">
                Results come from saved exercises and the external exercise API.
              </div>
              <ScrollArea className="mt-2 flex-1 border rounded-md">
                <div className="p-2 space-y-2">
                  {exerciseSearchLoading ? (
                    <p className="text-sm text-muted-foreground">Searching...</p>
                  ) : exerciseSearchResults.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No results yet. Try a different search term.
                    </p>
                  ) : (
                    exerciseSearchResults.map((exResult) => (
                      <div
                        key={exResult.id}
                        className="flex items-center justify-between gap-2 rounded-md border px-2 py-1"
                      >
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{exResult.name}</span>
                          <span className="text-xs text-muted-foreground">
                            ~{Math.round(exResult.caloriesPerMinute)} kcal / min
                          </span>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleSelectExercise(exResult)}
                        >
                          Select
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default TrainerWorkoutPlanBuilder;
