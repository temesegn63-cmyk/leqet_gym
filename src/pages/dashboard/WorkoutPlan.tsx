import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchMemberWorkoutPlan,
  BackendWorkoutPlan,
  getMemberProfile,
  saveMemberProfile,
  type SaveMemberProfilePayload,
  type BackendMemberProfile,
  fetchPlanMessages,
  sendPlanMessage,
  type PlanMessage,
} from '@/services/api/appBackend';
import { TrainerFeedback, type FeedbackMessage } from '@/components/feedback/TrainerFeedback';
import { toast } from '@/hooks/use-toast';
import { 
  Dumbbell, 
  Clock,
  Crown,
  Play,
  CheckCircle,
  Info,
  Calendar
} from 'lucide-react';

const defaultTrainerIntake = {
  primaryGoal: 'general_fitness',
  fitnessLevel: 'beginner',
  daysPerWeek: 4,
  sessionLengthMinutes: 45,
  injuries: '',
  equipment: '',
  preferences: '',
};

const WorkoutPlan: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [selectedWorkout, setSelectedWorkout] = useState<string | null>(null);
  const [backendPlan, setBackendPlan] = useState<BackendWorkoutPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberProfile, setMemberProfile] = useState<BackendMemberProfile | null>(null);
  const [trainerIntake, setTrainerIntake] = useState(defaultTrainerIntake);
  const [isSavingTrainer, setIsSavingTrainer] = useState(false);
  const [planMessages, setPlanMessages] = useState<PlanMessage[]>([]);
  const [isLoadingPlanMessages, setIsLoadingPlanMessages] = useState(false);
  const [newPlanMessage, setNewPlanMessage] = useState('');
  const [isSendingPlanMessage, setIsSendingPlanMessage] = useState(false);

  const readString = (value: unknown) => (typeof value === 'string' ? value : undefined);
  const readNumber = (value: unknown) => {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
  };
  const readObject = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

  const searchParams = new URLSearchParams(location.search);
  const memberIdParam = searchParams.get('memberId');
  const effectiveMemberId: number | null = memberIdParam
    ? Number(memberIdParam)
    : user
    ? user.id
    : null;

  useEffect(() => {
    if (!user || !effectiveMemberId || !Number.isFinite(effectiveMemberId)) {
      setBackendPlan(null);
      setMemberProfile(null);
      setTrainerIntake(defaultTrainerIntake);
      setPlanMessages([]);
      setNewPlanMessage('');
      setIsLoadingPlanMessages(false);
      setIsSendingPlanMessage(false);
      return;
    }

    const loadPlan = async () => {
      setLoading(true);
      setError(null);
      setIsLoadingPlanMessages(true);
      try {
        const [planResult, profileResult, messagesResult] = await Promise.allSettled([
          fetchMemberWorkoutPlan(effectiveMemberId),
          getMemberProfile(effectiveMemberId),
          fetchPlanMessages(effectiveMemberId, 'workout'),
        ]);

        if (planResult.status === 'fulfilled') {
          const plan = planResult.value;
          setBackendPlan(plan ?? null);
        } else {
          console.error('Failed to load workout plan', planResult.reason);
          setBackendPlan(null);
          setError('Failed to load workout plan from server');
        }

        if (profileResult.status === 'fulfilled') {
          const profile = profileResult.value as BackendMemberProfile | null;
          if (profile) {
            setMemberProfile(profile);
            const ti = readObject(profile.trainerIntake);
            setTrainerIntake((prev) => ({
              ...prev,
              primaryGoal: readString(ti.primaryGoal) ?? (profile.goal ?? prev.primaryGoal),
              fitnessLevel: readString(ti.fitnessLevel) ?? prev.fitnessLevel,
              daysPerWeek: readNumber(ti.daysPerWeek) ?? prev.daysPerWeek,
              sessionLengthMinutes: readNumber(ti.sessionLengthMinutes) ?? prev.sessionLengthMinutes,
              injuries: readString(ti.injuries) ?? prev.injuries,
              equipment: readString(ti.equipment) ?? prev.equipment,
              preferences: readString(ti.preferences) ?? prev.preferences,
            }));
          }
        }

        if (messagesResult.status === 'fulfilled') {
          const messages = messagesResult.value as PlanMessage[];
          setPlanMessages(messages || []);
        } else {
          console.error('Failed to load workout plan messages', (messagesResult as PromiseRejectedResult).reason);
          setPlanMessages([]);
        }
      } catch (err) {
        console.error('Failed to load workout plan', err);
        setError('Failed to load workout plan from server');
        setBackendPlan(null);
        setPlanMessages([]);
      } finally {
        setLoading(false);
        setIsLoadingPlanMessages(false);
      }
    };

    loadPlan();
  }, [user, effectiveMemberId, location.search]);

  const handleSaveTrainer = async () => {
    if (!user || !effectiveMemberId || !Number.isFinite(effectiveMemberId)) {
      toast({
        title: 'Please log in',
        description: 'You need to be logged in to update your training preferences.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSavingTrainer(true);

      let profile: BackendMemberProfile | null = memberProfile;
      if (!profile) {
        try {
          profile = await getMemberProfile(effectiveMemberId);
          setMemberProfile(profile);
        } catch (e) {
          console.error('Failed to load member profile before saving training intake', e);
        }
      }

      const base = profile || ({} as BackendMemberProfile);
      const existingTrainerIntake = readObject(base.trainerIntake);
      const nextTrainerIntake = {
        ...existingTrainerIntake,
        primaryGoal: trainerIntake.primaryGoal,
        fitnessLevel: trainerIntake.fitnessLevel,
        daysPerWeek: trainerIntake.daysPerWeek,
        sessionLengthMinutes: trainerIntake.sessionLengthMinutes,
        injuries: trainerIntake.injuries,
        equipment: trainerIntake.equipment,
        preferences: trainerIntake.preferences,
      };

      const payload: SaveMemberProfilePayload = {
        age: base.age ?? undefined,
        gender: base.gender ?? undefined,
        weight_kg: base.weightKg ?? undefined,
        height_cm: base.heightCm ?? undefined,
        goal: base.goal ?? undefined,
        activity_level: base.activityLevel ?? undefined,
        trainer_intake: nextTrainerIntake,
        nutrition_intake: base.nutritionIntake ?? null,
        is_private: base.isPrivate ?? undefined,
        bmr: base.bmr ?? undefined,
        tdee: base.tdee ?? undefined,
        target_calories: base.targetCalories ?? undefined,
        weekly_calorie_goal: base.weeklyCalorieGoal ?? undefined,
        weekly_workout_minutes: base.weeklyWorkoutMinutes ?? undefined,
        daily_steps_goal: base.dailyStepsGoal ?? undefined,
        daily_water_liters: base.dailyWaterLiters ?? undefined,
      };

      const updated = await saveMemberProfile(effectiveMemberId, payload);
      setMemberProfile(updated);
      const updatedTI = readObject(updated.trainerIntake);
      setTrainerIntake((prev) => ({
        ...prev,
        primaryGoal: readString(updatedTI.primaryGoal) ?? prev.primaryGoal,
        fitnessLevel: readString(updatedTI.fitnessLevel) ?? prev.fitnessLevel,
        daysPerWeek: readNumber(updatedTI.daysPerWeek) ?? prev.daysPerWeek,
        sessionLengthMinutes: readNumber(updatedTI.sessionLengthMinutes) ?? prev.sessionLengthMinutes,
        injuries: readString(updatedTI.injuries) ?? prev.injuries,
        equipment: readString(updatedTI.equipment) ?? prev.equipment,
        preferences: readString(updatedTI.preferences) ?? prev.preferences,
      }));

      toast({
        title: 'Training preferences updated',
        description: 'Your trainer will use these to personalize your workout plan.',
      });
    } catch (error) {
      console.error('Failed to save training preferences', error);
      toast({
        title: 'Failed to save preferences',
        description: 'Something went wrong while saving your training preferences.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingTrainer(false);
    }
  };

  const handleSendPlanMessage = async () => {
    if (!user || !effectiveMemberId || !Number.isFinite(effectiveMemberId)) {
      toast({
        title: 'Please log in',
        description: 'You need to be logged in to send a message about your workout plan.',
        variant: 'destructive',
      });
      return;
    }

    const trimmed = newPlanMessage.trim();
    if (!trimmed) return;

    try {
      setIsSendingPlanMessage(true);
      const created = await sendPlanMessage({
        memberId: effectiveMemberId,
        planType: 'workout',
        message: trimmed,
      });
      setPlanMessages((prev) =>
        [...prev, created].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
      );
      setNewPlanMessage('');
    } catch (err) {
      console.error('Failed to send workout plan message', err);
      toast({
        title: 'Failed to send message',
        description: 'Something went wrong while sending your message.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingPlanMessage(false);
    }
  };

  const activePlan: BackendWorkoutPlan | null = backendPlan ?? null;

  const hasTrainerPlan = !!(activePlan && activePlan.type === 'trainer');

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty.toLowerCase()) {
      case 'beginner': return 'bg-green-500/10 text-green-700 border-green-200';
      case 'intermediate': return 'bg-yellow-500/10 text-yellow-700 border-yellow-200';
      case 'advanced': return 'bg-red-500/10 text-red-700 border-red-200';
      default: return 'bg-gray-500/10 text-gray-700 border-gray-200';
    }
  };

  const getCompletionProgress = () => {
    if (!activePlan) return 0;
    const completed = activePlan.workouts.filter(w => w.completed).length;
    return activePlan.workouts.length ? (completed / activePlan.workouts.length) * 100 : 0;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Workout Plan</h1>
          <p className="text-muted-foreground">Your personalized fitness routine</p>
        </div>
        <div className="flex items-center gap-2">
          {hasTrainerPlan && (
            <Badge variant="default" className="gap-1">
              <Crown className="w-3 h-3" />
              Trainer Enhanced
            </Badge>
          )}
        </div>
      </div>

      {/* Plan Overview */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Dumbbell className="w-5 h-5" />
            {activePlan ? activePlan.name : 'No workout plan assigned yet'}
          </CardTitle>
          <CardDescription className="flex items-center gap-4">
            {activePlan ? (
              <>
                <span>{activePlan.goal || ''}</span>
                {activePlan.type === 'trainer' && activePlan.createdBy && (
                  <Badge variant="secondary">
                    Enhanced by {activePlan.createdBy}
                  </Badge>
                )}
              </>
            ) : (
              <span>
                Your trainer has not assigned a workout plan yet. Please check back later.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        {activePlan && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-foreground">{activePlan.weeklyDays}</div>
                <div className="text-sm text-muted-foreground">Days/Week</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-primary">{activePlan.estimatedDuration}</div>
                <div className="text-sm text-muted-foreground">Min/Session</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-secondary">{activePlan.difficulty}</div>
                <div className="text-sm text-muted-foreground">Level</div>
              </div>
              <div className="text-center p-3 bg-muted/50 rounded-lg">
                <div className="text-2xl font-bold text-accent">{Math.round(getCompletionProgress())}%</div>
                <div className="text-sm text-muted-foreground">Complete</div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Weekly Progress</span>
                <span>{Math.round(getCompletionProgress())}% Complete</span>
              </div>
              <Progress value={getCompletionProgress()} />
            </div>
          </CardContent>
        )}
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Your Training Preferences</CardTitle>
          <CardDescription>
            These details are shared with your trainer to personalize your workout plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Injuries, medical conditions, pain</Label>
            <Textarea
              value={trainerIntake.injuries}
              onChange={(e) => setTrainerIntake({ ...trainerIntake, injuries: e.target.value })}
              placeholder="e.g. lower back pain, knee surgery, shoulder issues, asthma"
            />
          </div>

          <div className="space-y-2">
            <Label>Equipment Available</Label>
            <Input
              value={trainerIntake.equipment}
              onChange={(e) => setTrainerIntake({ ...trainerIntake, equipment: e.target.value })}
              placeholder="e.g. gym access, dumbbells, resistance bands, bodyweight only"
            />
          </div>

          <div className="space-y-2">
            <Label>Training Preferences & Limitations</Label>
            <Textarea
              value={trainerIntake.preferences}
              onChange={(e) => setTrainerIntake({ ...trainerIntake, preferences: e.target.value })}
              placeholder="What you enjoy or want to avoid (e.g. no jumping, prefer strength, dislike running)"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveTrainer} disabled={isSavingTrainer}>
              {isSavingTrainer ? 'Saving...' : 'Save Preferences'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Workout Schedule */}
      <div className="grid gap-6">
        {activePlan ? activePlan.workouts.map((workout) => (
          <Card key={workout.id} className="shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span className="font-semibold">{workout.day}</span>
                  </div>
                  <h3 className="text-lg font-medium">{workout.name}</h3>
                  <Badge className={getDifficultyColor(workout.difficulty)}>
                    {workout.difficulty}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="gap-1">
                    <Clock className="w-3 h-3" />
                    {workout.duration} min
                  </Badge>
                  {workout.completed && (
                    <Badge variant="default" className="gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Completed
                    </Badge>
                  )}
                </div>
              </div>
              <CardDescription className="flex items-center gap-4">
                <span>Focus: {workout.focus.join(', ')}</span>
                {workout.tips && (
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 mt-0.5 text-blue-500" />
                    <span className="text-sm">{workout.tips}</span>
                  </div>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {workout.exercises.map((exercise, index) => (
                  <div key={index} className="p-4 bg-muted/30 rounded-lg">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <h4 className="font-medium">{exercise.name}</h4>
                        {exercise.instructions && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {exercise.instructions}
                          </p>
                        )}
                      </div>
                      <div className="text-right text-sm space-y-1">
                        <div><span className="font-medium">{exercise.sets}</span> sets</div>
                        <div><span className="font-medium">{exercise.reps}</span> reps</div>
                        <div><span className="font-medium">{exercise.rest}</span> rest</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {exercise.targetMuscles.map((muscle, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {muscle}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
                
                <div className="flex gap-3 pt-4 border-t border-border">
                   
                   
                </div>
              </div>
            </CardContent>
          </Card>
        )) : (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>No workout plan assigned</CardTitle>
              <CardDescription>
                Your trainer has not assigned a workout plan yet. Please check back later.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Conversation about your workout plan</CardTitle>
          <CardDescription>
            Ask questions or share feedback with your trainer about this plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
            {isLoadingPlanMessages ? (
              <p className="text-sm text-muted-foreground">Loading conversation...</p>
            ) : planMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No messages yet. Start the conversation by sending a message below.
              </p>
            ) : (
              [...planMessages]
                .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
                .map((msg) => {
                  const isMine = user && msg.memberId === user.id && msg.senderRole === 'member';
                  const senderLabel =
                    msg.senderRole === 'member'
                      ? isMine
                        ? 'You'
                        : 'Member'
                      : msg.senderRole === 'trainer'
                      ? 'Trainer'
                      : msg.senderRole === 'nutritionist'
                      ? 'Nutritionist'
                      : 'Admin';
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                          isMine
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-foreground'
                        }`}
                      >
                        <div className="mb-1 text-xs font-medium opacity-80">
                          {senderLabel}
                        </div>
                        <div>{msg.message}</div>
                        <div className="mt-1 text-[0.7rem] opacity-70">
                          {new Date(msg.createdAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="workout-plan-message">Message</Label>
            <Textarea
              id="workout-plan-message"
              value={newPlanMessage}
              onChange={(e) => setNewPlanMessage(e.target.value)}
              placeholder="Ask your trainer a question or request a change..."
              rows={3}
            />
            <div className="flex justify-end">
              <Button
                onClick={handleSendPlanMessage}
                disabled={!newPlanMessage.trim() || isSendingPlanMessage || !user}
              >
                {isSendingPlanMessage ? 'Sending...' : 'Send message'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default WorkoutPlan;