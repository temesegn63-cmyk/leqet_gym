import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import {
  fetchMemberOverview,
  fetchFoods,
  getMemberProfile,
  saveManualDietPlan,
  sendNutritionistFeedback,
  type BackendFood,
  type BackendMemberProfile,
  type MemberOverview,
  type MealType,
} from '@/services/api/appBackend';
import { Calendar, MessageSquare, UtensilsCrossed } from 'lucide-react';

interface ManualMealItem {
  food: BackendFood;
  quantity: number; // in grams
}

type ManualMealsState = Record<MealType, ManualMealItem[]>;

const NutritionistMealPlans: React.FC = () => {
  const location = useLocation();
  const [members, setMembers] = useState<MemberOverview[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [isLoadingMembers, setIsLoadingMembers] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isFeedbackDialogOpen, setIsFeedbackDialogOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  const [planName, setPlanName] = useState('');
  const [planGoal, setPlanGoal] = useState('');
  const [activeMealType, setActiveMealType] = useState<MealType>('breakfast');
  const [manualMeals, setManualMeals] = useState<ManualMealsState>({
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  });
  const [foodSearch, setFoodSearch] = useState('');
  const [foodResults, setFoodResults] = useState<BackendFood[]>([]);
  const [isLoadingFoods, setIsLoadingFoods] = useState(false);

  const [profile, setProfile] = useState<BackendMemberProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  const selectedMember = useMemo(() => {
    const id = Number(selectedMemberId);
    if (!id) return null;
    return members.find((m) => m.id === id) ?? null;
  }, [members, selectedMemberId]);

  const manualDailyTotals = useMemo(
    () => {
      let calories = 0;
      let protein = 0;
      let carbs = 0;
      let fat = 0;

      (['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).forEach((mt) => {
        (manualMeals[mt] || []).forEach((item) => {
          const multiplier = item.quantity / 100;
          calories += item.food.calories * multiplier;
          protein += item.food.protein * multiplier;
          carbs += item.food.carbs * multiplier;
          fat += item.food.fat * multiplier;
        });
      });

      return {
        calories: Math.round(calories),
        protein: Math.round(protein),
        carbs: Math.round(carbs),
        fat: Math.round(fat),
      };
    },
    [manualMeals]
  );

  const readNutritionString = (key: string): string | undefined => {
    const intake = profile?.nutritionIntake;
    if (!intake || typeof intake !== 'object' || Array.isArray(intake)) return undefined;
    const value = (intake as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : undefined;
  };

  const readNutritionNumber = (key: string): number | undefined => {
    const intake = profile?.nutritionIntake;
    if (!intake || typeof intake !== 'object' || Array.isArray(intake)) return undefined;
    const value = (intake as Record<string, unknown>)[key];
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : undefined;
  };

  const allergiesText = readNutritionString('allergies') || '';
  const dietPreference = readNutritionString('dietPreferences') || '';
  const budget = readNutritionString('budget') || '';
  const mealsPerDay = readNutritionNumber('mealsPerDay');
  const notesText = readNutritionString('notes') || '';

  const allergyTokens = useMemo(
    () => {
      if (!allergiesText.trim()) return [] as string[];
      return allergiesText
        .split(/[,;\n]/)
        .map((t) => t.trim().toLowerCase())
        .filter((t) => t.length > 1);
    },
    [allergiesText]
  );

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoadingMembers(true);
        const m = await fetchMemberOverview();
        setMembers(m || []);
        setError(null);
      } catch (e) {
        console.error('Failed to load nutritionist clients', e);
        setError('Failed to load clients');
      } finally {
        setIsLoadingMembers(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const memberIdFromQuery = params.get('memberId');
    if (memberIdFromQuery && !selectedMemberId) {
      setSelectedMemberId(memberIdFromQuery);
    }
  }, [location.search, selectedMemberId]);

  const loadProfile = async (memberId: number) => {
    try {
      setIsLoadingProfile(true);
      const p = await getMemberProfile(memberId);
      setProfile(p);
    } catch (e) {
      console.error('Failed to load member profile', e);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  useEffect(() => {
    const id = Number(selectedMemberId);
    setPlanName('');
    setPlanGoal('');
    setActiveMealType('breakfast');
    setManualMeals({
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    });
    setFoodSearch('');
    setFoodResults([]);
    setError(null);

    if (!id) {
      setProfile(null);
      return;
    }

    loadProfile(id);
  }, [selectedMemberId]);

  const onGeneratePlan = async () => {
    if (!selectedMember) return;

    const mealsForSave: { mealType: MealType; name: string; items: ManualMealItem[] }[] = [];
    (['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).forEach((mt) => {
      const items = manualMeals[mt] || [];
      if (items.length > 0) {
        mealsForSave.push({ mealType: mt, name: mt.charAt(0).toUpperCase() + mt.slice(1), items });
      }
    });

    if (mealsForSave.length === 0) {
      toast({
        title: 'No foods selected',
        description: 'Add foods to at least one meal before saving a plan.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsGeneratingPlan(true);

      const payloadMeals = mealsForSave.map((meal) => ({
        mealType: meal.mealType,
        name: meal.name,
        items: meal.items.map((item) => {
          const multiplier = item.quantity / 100;
          const calories = Math.round(item.food.calories * multiplier);
          const protein = Math.round(item.food.protein * multiplier * 10) / 10;
          const carbs = Math.round(item.food.carbs * multiplier * 10) / 10;
          const fat = Math.round(item.food.fat * multiplier * 10) / 10;

          return {
            foodId: item.food.id,
            name: item.food.name,
            category: item.food.category,
            quantity: item.quantity,
            unit: 'g',
            calories,
            protein,
            carbs,
            fat,
          };
        }),
      }));

      const defaultName = `${selectedMember.full_name}'s Diet Plan`;
      const defaultGoal = selectedMember.goal || '';

      await saveManualDietPlan(selectedMember.id, {
        name: planName.trim() || defaultName,
        goal: planGoal.trim() || defaultGoal,
        meals: payloadMeals,
      });

      toast({
        title: 'Diet plan saved',
        description: `A manual plan was saved for ${selectedMember.full_name}.`,
      });
    } catch (e) {
      console.error('Failed to save diet plan', e);

      const message =
        (e as any)?.response?.data?.message ||
        (e as any)?.message ||
        'Please try again.';

      toast({
        title: 'Failed to save diet plan',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handleSearchFoods = async () => {
    if (!foodSearch.trim()) {
      setFoodResults([]);
      return;
    }

    try {
      setIsLoadingFoods(true);
      const foods = await fetchFoods(foodSearch.trim());
      setFoodResults(foods);
    } catch (e) {
      console.error('Failed to search foods', e);
      toast({
        title: 'Failed to search foods',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingFoods(false);
    }
  };

  const handleAddFoodToMeal = (food: BackendFood) => {
    const quantity = 100;

    setManualMeals((prev) => ({
      ...prev,
      [activeMealType]: [
        ...prev[activeMealType],
        {
          food,
          quantity,
        },
      ],
    }));
  };

  const handleRemoveFoodFromMeal = (mealType: MealType, index: number) => {
    setManualMeals((prev) => ({
      ...prev,
      [mealType]: prev[mealType].filter((_, i) => i !== index),
    }));
  };

  const handleQuantityChange = (mealType: MealType, index: number, quantity: number) => {
    if (!Number.isFinite(quantity) || quantity <= 0) return;

    setManualMeals((prev) => ({
      ...prev,
      [mealType]: prev[mealType].map((item, i) =>
        i === index
          ? {
              ...item,
              quantity,
            }
          : item
      ),
    }));
  };

  const onSendFeedback = async () => {
    if (!selectedMember || !feedbackText.trim()) return;

    try {
      setIsSendingFeedback(true);
      await sendNutritionistFeedback({ memberId: selectedMember.id, message: feedbackText.trim() });
      toast({
        title: 'Feedback sent',
        description: `Your message was sent to ${selectedMember.full_name}.`,
      });
      setFeedbackText('');
      setIsFeedbackDialogOpen(false);
    } catch (e) {
      console.error('Failed to send feedback', e);
      toast({
        title: 'Failed to send feedback',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingFeedback(false);
    }
  };

  return (
    <div className="space-y-6">
      <Dialog
        open={isFeedbackDialogOpen}
        onOpenChange={(open) => {
          setIsFeedbackDialogOpen(open);
          if (!open) setFeedbackText('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedMember ? `Send Feedback to ${selectedMember.full_name}` : 'Send Feedback'}
            </DialogTitle>
            <DialogDescription>Provide nutrition guidance and next steps.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Textarea
              placeholder="Write your feedback here..."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              rows={4}
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsFeedbackDialogOpen(false)} disabled={isSendingFeedback}>
                Cancel
              </Button>
              <Button onClick={onSendFeedback} disabled={isSendingFeedback || !feedbackText.trim()}>
                Send Feedback
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <div>
        <h1 className="text-3xl font-bold text-foreground">Meal Plans</h1>
        <p className="text-muted-foreground">Review and manage client diet plans</p>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground">
            <UtensilsCrossed className="h-5 w-5 text-primary" />
            Select Client
          </CardTitle>
          <CardDescription>Choose a client to build and save their diet plan</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="w-full md:max-w-sm">
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

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setIsFeedbackDialogOpen(true)}
              disabled={!selectedMember}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              Feedback
            </Button>
            <Button onClick={onGeneratePlan} disabled={!selectedMember || isGeneratingPlan}>
              <Calendar className="h-4 w-4 mr-2" />
              Save Plan
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && <div className="text-sm text-destructive">{error}</div>}

      {!selectedMember && !isLoadingMembers && (
        <div className="text-sm text-muted-foreground">Select a client to build a plan.</div>
      )}

      {selectedMember && (
        <div className="space-y-4">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-foreground">Client Nutrition Profile</CardTitle>
              <CardDescription>
                Preferences and constraints shared by {selectedMember.full_name}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingProfile ? (
                <div className="text-sm text-muted-foreground">Loading profile…</div>
              ) : !profile ? (
                <div className="text-sm text-muted-foreground">
                  No detailed nutrition profile available yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <div className="font-medium text-foreground">Allergies / intolerances</div>
                    <div className="text-muted-foreground">{allergiesText || 'None reported'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="font-medium text-foreground">Diet preference</div>
                    <div className="text-muted-foreground">{dietPreference || 'Not specified'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="font-medium text-foreground">Meals / day</div>
                    <div className="text-muted-foreground">{mealsPerDay || 'Not specified'}</div>
                  </div>
                  <div className="space-y-1">
                    <div className="font-medium text-foreground">Budget</div>
                    <div className="text-muted-foreground capitalize">{budget || 'Not specified'}</div>
                  </div>
                  <div className="md:col-span-2 space-y-1">
                    <div className="font-medium text-foreground">Notes for nutritionist</div>
                    <div className="text-muted-foreground">{notesText || 'No extra notes provided.'}</div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {selectedMember && (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-foreground flex flex-wrap items-center justify-between gap-3">
              <span>Build Manual Plan</span>
              <span className="text-xs text-muted-foreground">
                Select foods for each meal, then click “Save Plan” above to assign it.
              </span>
            </CardTitle>
            <CardDescription>
              Use the client’s preferences and goals to compose a structured daily plan.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Plan name</div>
                <Input
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  placeholder={`${selectedMember.full_name}'s Diet Plan`}
                />
              </div>
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Goal / focus</div>
                <Input
                  value={planGoal}
                  onChange={(e) => setPlanGoal(e.target.value)}
                  placeholder={selectedMember.goal || 'e.g. fat loss, muscle gain, balanced energy'}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((mt) => (
                <Button
                  key={mt}
                  type="button"
                  size="sm"
                  variant={activeMealType === mt ? 'default' : 'outline'}
                  onClick={() => setActiveMealType(mt)}
                >
                  {mt.charAt(0).toUpperCase() + mt.slice(1)}
                </Button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-3">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder={
                      dietPreference
                        ? `Search ${dietPreference.toLowerCase()}-friendly foods`
                        : 'Search foods (e.g. injera, egg, salad)'
                    }
                    value={foodSearch}
                    onChange={(e) => setFoodSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSearchFoods();
                      }
                    }}
                  />
                  <Button type="button" onClick={handleSearchFoods} disabled={isLoadingFoods}>
                    {isLoadingFoods ? 'Searching…' : 'Search'}
                  </Button>
                </div>

                <div className="max-h-64 overflow-y-auto border border-border rounded-md divide-y divide-border">
                  {foodResults.length === 0 && !isLoadingFoods ? (
                    <div className="p-3 text-xs text-muted-foreground">
                      Search to find foods to add to the plan.
                    </div>
                  ) : (
                    foodResults.map((food) => {
                      const isAllergyMatch =
                        allergyTokens.length > 0 &&
                        allergyTokens.some((token) => {
                          const name = (food.name || '').toLowerCase();
                          const category = (food.category || '').toLowerCase();
                          return name.includes(token) || category.includes(token);
                        });

                      return (
                        <div
                          key={food.id}
                          className="flex items-center justify-between gap-3 p-3 text-sm"
                        >
                          <div>
                            <div className="flex items-center gap-2 font-medium text-foreground">
                              <span>{food.name}</span>
                              {isAllergyMatch && (
                                <Badge variant="destructive" className="text-[0.65rem] uppercase">
                                  matches allergy
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {food.category || 'Food'} · {Math.round(food.calories)} cal / 100g
                            </div>
                          </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => handleAddFoodToMeal(food)}
                        >
                          Add to {activeMealType}
                        </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium text-foreground capitalize">
                  {activeMealType} plan
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto border border-border rounded-md p-2 text-xs">
                  {manualMeals[activeMealType].length === 0 ? (
                    <div className="text-muted-foreground">No foods added yet.</div>
                  ) : (
                    manualMeals[activeMealType].map((item, index) => {
                      const multiplier = item.quantity / 100;
                      const calories = Math.round(item.food.calories * multiplier);
                      const isAllergyMatch =
                        allergyTokens.length > 0 &&
                        allergyTokens.some((token) => {
                          const name = (item.food.name || '').toLowerCase();
                          const category = (item.food.category || '').toLowerCase();
                          return name.includes(token) || category.includes(token);
                        });
                      return (
                        <div
                          key={`${item.food.id}-${index}`}
                          className="flex items-center justify-between gap-2 border-b border-border last:border-b-0 pb-2 last:pb-0 mb-2 last:mb-0"
                        >
                          <div>
                            <div className="flex items-center gap-2 font-medium text-foreground">
                              <span>{item.food.name}</span>
                              {isAllergyMatch && (
                                <Badge variant="destructive" className="text-[0.6rem] uppercase">
                                  allergy
                                </Badge>
                              )}
                            </div>
                            <div className="text-[0.7rem] text-muted-foreground">
                              {calories} cal · {item.quantity}g
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              className="h-7 w-20 text-xs"
                              value={item.quantity}
                              onChange={(e) =>
                                handleQuantityChange(
                                  activeMealType,
                                  index,
                                  Number(e.target.value || '0')
                                )
                              }
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => handleRemoveFoodFromMeal(activeMealType, index)}
                            >
                              ×
                            </Button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default NutritionistMealPlans;
