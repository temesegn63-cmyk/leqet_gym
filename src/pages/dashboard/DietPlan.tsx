import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchMemberDietPlan,
  BackendDietPlan,
  getMemberProfile,
  saveMemberProfile,
  type SaveMemberProfilePayload,
  type BackendMemberProfile,
  fetchPlanMessages,
  sendPlanMessage,
  type PlanMessage,
} from '@/services/api/appBackend';
import { toast } from '@/hooks/use-toast';
import {
  UtensilsCrossed,
  Clock,
  Crown,
  Calendar,
  Info,
  CheckCircle,
} from 'lucide-react';

interface MealPlan {
  id: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  foods: {
    name: string;
    nameAmharic?: string;
    quantity: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
  }[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  tips?: string;
}

interface DietPlan {
  id: string;
  name: string;
  type: 'system' | 'trainer';
  goal: string;
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFat: number;
  meals: MealPlan[];
  createdBy?: string;
  createdAt: string;
  active: boolean;
}

const DietPlan: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [backendPlan, setBackendPlan] = useState<BackendDietPlan | null>(null);
  const [memberProfile, setMemberProfile] = useState<BackendMemberProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nutritionIntake, setNutritionIntake] = useState({
    allergies: '',
    dietPreferences: '',
    mealsPerDay: 3,
    budget: 'medium',
    notes: '',
  });
  const [isSavingNutrition, setIsSavingNutrition] = useState(false);
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
      setNutritionIntake({
        allergies: '',
        dietPreferences: '',
        mealsPerDay: 3,
        budget: 'medium',
        notes: '',
      });
      return;
    }

    const loadPlanAndProfile = async () => {
      setLoading(true);
      setError(null);
      setIsLoadingPlanMessages(true);
      try {
        const [planResult, profileResult, messagesResult] = await Promise.allSettled([
          fetchMemberDietPlan(effectiveMemberId),
          getMemberProfile(effectiveMemberId),
          fetchPlanMessages(effectiveMemberId, 'diet'),
        ]);

        if (planResult.status === 'fulfilled') {
          const plan = planResult.value;
          setBackendPlan(plan ?? null);
        } else {
          console.error('Failed to load diet plan', planResult.reason);
          setBackendPlan(null);
          setError('Failed to load diet plan from server');
        }

        if (profileResult.status === 'fulfilled') {
          const profile = profileResult.value as BackendMemberProfile | null;
          if (profile) {
            setMemberProfile(profile);
            const ni = readObject(profile.nutritionIntake);
            setNutritionIntake((prev) => ({
              ...prev,
              allergies: readString(ni.allergies) ?? prev.allergies,
              dietPreferences: readString(ni.dietPreferences) ?? prev.dietPreferences,
              mealsPerDay: readNumber(ni.mealsPerDay) ?? prev.mealsPerDay,
              budget: readString(ni.budget) ?? prev.budget,
              notes: readString(ni.notes) ?? prev.notes,
            }));
          }
        }

        if (messagesResult.status === 'fulfilled') {
          const messages = messagesResult.value as PlanMessage[];
          setPlanMessages(messages || []);
        } else {
          console.error('Failed to load plan messages', (messagesResult as PromiseRejectedResult).reason);
          setPlanMessages([]);
        }
      } catch (err) {
        console.error('Failed to load diet plan or profile', err);
        setError('Failed to load data from server');
        setBackendPlan(null);
        setMemberProfile(null);
        setPlanMessages([]);
      } finally {
        setLoading(false);
        setIsLoadingPlanMessages(false);
      }
    };

    loadPlanAndProfile();
  }, [user, effectiveMemberId, location.search]);

  const handleSaveNutrition = async () => {
    if (!user || !effectiveMemberId || !Number.isFinite(effectiveMemberId)) {
      toast({
        title: 'Please log in',
        description: 'You need to be logged in to update your nutrition preferences.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSavingNutrition(true);

      let profile: BackendMemberProfile | null = memberProfile;
      if (!profile) {
        try {
          profile = await getMemberProfile(effectiveMemberId);
          setMemberProfile(profile);
        } catch (e) {
          console.error('Failed to load member profile before saving nutrition intake', e);
        }
      }

      const base = profile || ({} as BackendMemberProfile);
      const existingIntake = readObject(base.nutritionIntake);
      const nextNutritionIntake = {
        ...existingIntake,
        allergies: nutritionIntake.allergies,
        dietPreferences: nutritionIntake.dietPreferences,
        mealsPerDay: nutritionIntake.mealsPerDay,
        budget: nutritionIntake.budget,
        notes: nutritionIntake.notes,
      };

      const payload: SaveMemberProfilePayload = {
        age: base.age ?? undefined,
        gender: base.gender ?? undefined,
        weight_kg: base.weightKg ?? undefined,
        height_cm: base.heightCm ?? undefined,
        goal: base.goal ?? undefined,
        activity_level: base.activityLevel ?? undefined,
        trainer_intake: base.trainerIntake ?? null,
        nutrition_intake: nextNutritionIntake,
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
      const updatedIntake = readObject(updated.nutritionIntake);
      setNutritionIntake((prev) => ({
        ...prev,
        allergies: readString(updatedIntake.allergies) ?? prev.allergies,
        dietPreferences: readString(updatedIntake.dietPreferences) ?? prev.dietPreferences,
        mealsPerDay: readNumber(updatedIntake.mealsPerDay) ?? prev.mealsPerDay,
        budget: readString(updatedIntake.budget) ?? prev.budget,
        notes: readString(updatedIntake.notes) ?? prev.notes,
      }));

      toast({
        title: 'Nutrition preferences updated',
        description: 'Your nutritionist will use these to personalize your diet plan.',
      });
    } catch (error) {
      console.error('Failed to save nutrition preferences', error);
      toast({
        title: 'Failed to save preferences',
        description: 'Something went wrong while saving your nutrition preferences.',
        variant: 'destructive',
      });
    } finally {
      setIsSavingNutrition(false);
    }
  };

  const handleSendPlanMessage = async () => {
    if (!user || !effectiveMemberId || !Number.isFinite(effectiveMemberId)) {
      toast({
        title: 'Please log in',
        description: 'You need to be logged in to send a message about your diet plan.',
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
        planType: 'diet',
        message: trimmed,
      });
      setPlanMessages((prev) => [...prev, created].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()));
      setNewPlanMessage('');
    } catch (err) {
      console.error('Failed to send diet plan message', err);
      toast({
        title: 'Failed to send message',
        description: 'Something went wrong while sending your message.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingPlanMessage(false);
    }
  };

  const activePlan = backendPlan;
  const hasTrainerPlan = !!(backendPlan && backendPlan.type === 'trainer');

  const getMealTypeIcon = (mealType: string) => {
    switch (mealType) {
      case 'breakfast': return '🌅';
      case 'lunch': return '☀️';
      case 'dinner': return '🌙';
      case 'snack': return '🍎';
      default: return '🍽️';
    }
  };

  const dailyTotals = activePlan
    ? activePlan.meals.reduce(
        (totals, meal) => ({
          calories: totals.calories + meal.totalCalories,
          protein: totals.protein + meal.totalProtein,
          carbs: totals.carbs + meal.totalCarbs,
          fat: totals.fat + meal.totalFat,
        }),
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      )
    : { calories: 0, protein: 0, carbs: 0, fat: 0 };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Diet Plan</h1>
          <p className="text-muted-foreground">Your personalized nutrition plan</p>
        </div>
        <div className="flex items-center gap-2">
          {hasTrainerPlan && (
            <Badge variant="default" className="gap-1">
              <Crown className="w-3 h-3" />
              Nutritionist Customized
            </Badge>
          )}
        </div>
      </div>

      {/* Plan Overview */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UtensilsCrossed className="w-5 h-5" />
            {activePlan ? activePlan.name : 'No diet plan assigned yet'}
          </CardTitle>
          <CardDescription className="flex items-center gap-4">
            <span>{activePlan?.goal || ''}</span>
            {activePlan && activePlan.type === 'trainer' && activePlan.createdBy && (
              <Badge variant="secondary">
                Customized by {activePlan.createdBy}
              </Badge>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-foreground">{Math.round(dailyTotals.calories)}</div>
              <div className="text-sm text-muted-foreground">Calories</div>
              <Progress value={75} className="mt-2 h-2" />
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">{Math.round(dailyTotals.protein)}g</div>
              <div className="text-sm text-muted-foreground">Protein</div>
              <Progress value={85} className="mt-2 h-2" />
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-secondary">{Math.round(dailyTotals.carbs)}g</div>
              <div className="text-sm text-muted-foreground">Carbs</div>
              <Progress value={65} className="mt-2 h-2" />
            </div>
            <div className="text-center p-3 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-accent">{Math.round(dailyTotals.fat)}g</div>
              <div className="text-sm text-muted-foreground">Fat</div>
              <Progress value={70} className="mt-2 h-2" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Your Nutrition Preferences</CardTitle>
          <CardDescription>
            These details are shared with your nutritionist to personalize your diet plan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Allergies / Intolerances</Label>
            <Input
              value={nutritionIntake.allergies}
              onChange={(e) => setNutritionIntake({ ...nutritionIntake, allergies: e.target.value })}
              placeholder="e.g. dairy, gluten, peanuts"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Diet Preference</Label>
              <Input
                value={nutritionIntake.dietPreferences}
                onChange={(e) => setNutritionIntake({ ...nutritionIntake, dietPreferences: e.target.value })}
                placeholder="e.g. vegetarian, halal"
              />
            </div>
            <div className="space-y-2">
              <Label>Meals / Day</Label>
              <Input
                type="number"
                min={1}
                max={8}
                value={nutritionIntake.mealsPerDay}
                onChange={(e) =>
                  setNutritionIntake({ ...nutritionIntake, mealsPerDay: Number(e.target.value) || 0 })
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Budget</Label>
            <Select
              value={nutritionIntake.budget}
              onValueChange={(value) => setNutritionIntake({ ...nutritionIntake, budget: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select budget" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Notes for Your Nutritionist</Label>
            <Textarea
              value={nutritionIntake.notes}
              onChange={(e) => setNutritionIntake({ ...nutritionIntake, notes: e.target.value })}
              placeholder="Anything else your nutritionist should know (schedule, culture, dislikes, etc.)"
            />
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveNutrition} disabled={isSavingNutrition}>
              {isSavingNutrition ? 'Saving...' : 'Save Preferences'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Meal Plans */}
      <div className="grid gap-6">
        {activePlan ? activePlan.meals.map((meal) => (
          <Card key={meal.id} className="shadow-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span className="text-2xl">{getMealTypeIcon(meal.mealType)}</span>
                <span className="capitalize">{meal.mealType}</span>
                <Badge variant="outline">{meal.totalCalories} cal</Badge>
              </CardTitle>
              {meal.tips && (
                <CardDescription className="flex items-start gap-2">
                  <Info className="w-4 h-4 mt-0.5 text-blue-500" />
                  {meal.tips}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {meal.foods.map((food, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{food.name}</div>
                      {food.nameAmharic && (
                        <div className="text-sm text-muted-foreground">{food.nameAmharic}</div>
                      )}
                      <div className="text-sm text-muted-foreground">
                        {food.quantity}g • {food.calories} cal
                      </div>
                    </div>
                    <div className="text-right text-sm">
                      <div>P: {food.protein}g</div>
                      <div>C: {food.carbs}g</div>
                      <div>F: {food.fat}g</div>
                    </div>
                  </div>
                ))}
                
                <div className="pt-3 border-t border-border">
                  <div className="grid grid-cols-4 gap-2 text-sm text-center">
                    <div>
                      <div className="font-medium">{Math.round(meal.totalCalories)}</div>
                      <div className="text-xs text-muted-foreground">calories</div>
                    </div>
                    <div>
                      <div className="font-medium">{Math.round(meal.totalProtein)}g</div>
                      <div className="text-xs text-muted-foreground">protein</div>
                    </div>
                    <div>
                      <div className="font-medium">{Math.round(meal.totalCarbs)}g</div>
                      <div className="text-xs text-muted-foreground">carbs</div>
                    </div>
                    <div>
                      <div className="font-medium">{Math.round(meal.totalFat)}g</div>
                      <div className="text-xs text-muted-foreground">fat</div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )) : (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle>No diet plan assigned</CardTitle>
              <CardDescription>
                Your nutritionist has not assigned a diet plan yet. Please check back later.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </div>

      {/* Conversation about your diet plan */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Conversation about your diet plan</CardTitle>
          <CardDescription>
            Ask questions or share feedback with your nutritionist about this plan.
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
                      : msg.senderRole === 'nutritionist'
                      ? 'Nutritionist'
                      : msg.senderRole === 'trainer'
                      ? 'Trainer'
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
            <Label htmlFor="diet-plan-message">Message</Label>
            <Textarea
              id="diet-plan-message"
              value={newPlanMessage}
              onChange={(e) => setNewPlanMessage(e.target.value)}
              placeholder="Ask your nutritionist a question or request a change..."
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

export default DietPlan;