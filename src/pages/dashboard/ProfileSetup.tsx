import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { calculateBMR, calculateTDEE, MemberProfile } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import {
  getMemberProfile,
  saveMemberProfile,
  SaveMemberProfilePayload,
  BackendMemberProfile,
  generateDefaultDietPlan,
  generateDefaultWorkoutPlan,
} from '@/services/api/appBackend';
import { Save, Calculator, Target, TrendingUp, Eye, EyeOff } from 'lucide-react';

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const ProfileSetup: React.FC = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Partial<MemberProfile>>({
    age: 28,
    weight: 65,
    height: 165,
    gender: 'female',
    goal: 'weight_loss',
    activityLevel: 'moderate'
  });

  const [trainerIntake, setTrainerIntake] = useState({
    primaryGoal: 'general_fitness',
    fitnessLevel: 'beginner',
    daysPerWeek: 4,
    sessionLengthMinutes: 45,
    injuries: '',
    equipment: '',
    preferences: '',
  });

  const [nutritionIntake, setNutritionIntake] = useState({
    primaryGoal: 'general_fitness',
    allergies: '',
    dietPreferences: '',
    mealsPerDay: 3,
    budget: 'medium',
    notes: '',
  });

  const [bmr, setBmr] = useState<number | null>(null);
  const [tdee, setTdee] = useState<number | null>(null);
  const [targetCalories, setTargetCalories] = useState<number | null>(null);
  const [isPublicProfile, setIsPublicProfile] = useState(false);

  useEffect(() => {
    if (!user) return;

    const loadProfile = async () => {
      try {
        const backend: BackendMemberProfile | null = await getMemberProfile(user.id);
        if (!backend) return;

        const readString = (value: unknown) => (typeof value === 'string' ? value : undefined);
        const readNumber = (value: unknown) => {
          const n = typeof value === 'number' ? value : Number(value);
          return Number.isFinite(n) ? n : undefined;
        };
        const readObject = (value: unknown): Record<string, unknown> =>
          value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

        setProfile((prev) => ({
          ...prev,
          age: backend.age ?? undefined,
          weight: backend.weightKg ?? undefined,
          height: backend.heightCm ?? undefined,
          gender: (backend.gender as 'male' | 'female' | null) ?? prev.gender,
          goal: backend.goal ?? prev.goal,
          activityLevel: backend.activityLevel ?? prev.activityLevel,
        }));

        const ti = readObject(backend.trainerIntake);
        setTrainerIntake((prev) => ({
          ...prev,
          primaryGoal: readString(ti.primaryGoal) ?? (backend.goal ?? prev.primaryGoal),
          fitnessLevel: readString(ti.fitnessLevel) ?? prev.fitnessLevel,
          daysPerWeek: readNumber(ti.daysPerWeek) ?? prev.daysPerWeek,
          sessionLengthMinutes: readNumber(ti.sessionLengthMinutes) ?? prev.sessionLengthMinutes,
          injuries: readString(ti.injuries) ?? prev.injuries,
          equipment: readString(ti.equipment) ?? prev.equipment,
          preferences: readString(ti.preferences) ?? prev.preferences,
        }));

        const ni = readObject(backend.nutritionIntake);
        setNutritionIntake((prev) => ({
          ...prev,
          primaryGoal: readString(ni.primaryGoal) ?? (backend.goal ?? prev.primaryGoal),
          allergies: readString(ni.allergies) ?? prev.allergies,
          dietPreferences: readString(ni.dietPreferences) ?? prev.dietPreferences,
          mealsPerDay: readNumber(ni.mealsPerDay) ?? prev.mealsPerDay,
          budget: readString(ni.budget) ?? prev.budget,
          notes: readString(ni.notes) ?? prev.notes,
        }));

        setIsPublicProfile(backend.isPrivate === false);

        if (backend.bmr != null) {
          setBmr(Math.round(backend.bmr));
        }
        if (backend.tdee != null) {
          setTdee(Math.round(backend.tdee));
        }
        if (backend.targetCalories != null) {
          setTargetCalories(Math.round(backend.targetCalories));
        }
      } catch (error) {
        console.error('Failed to load member profile', error);
      }
    };

    loadProfile();
  }, [user]);

  const calculateMetrics = () => {
    if (profile.weight && profile.height && profile.age && profile.gender && profile.activityLevel) {
      const calculatedBmr = calculateBMR(profile.weight, profile.height, profile.age, profile.gender);
      const activityKey = profile.activityLevel || 'sedentary';
      const multiplier = ACTIVITY_MULTIPLIERS[activityKey] ?? ACTIVITY_MULTIPLIERS.sedentary;
      const calculatedTdee = calculateTDEE(calculatedBmr, multiplier);

      let target = calculatedTdee;
      if (profile.goal === 'weight_loss') {
        target = calculatedTdee - 500; // 500 calorie deficit
      } else if (profile.goal === 'muscle_gain') {
        target = calculatedTdee + 300; // 300 calorie surplus
      }

      setBmr(Math.round(calculatedBmr));
      setTdee(Math.round(calculatedTdee));
      setTargetCalories(Math.round(target));
    } else {
      toast({
        title: 'Missing information',
        description:
          'Please enter your age, weight, height, gender, and activity level before calculating your metrics.',
        variant: 'destructive',
      });
    }
  };

  const handleSubmit = async () => {
    if (!user) {
      toast({
        title: 'Please log in',
        description: 'You need to be logged in to save your profile',
        variant: 'destructive',
      });
      return;
    }

    if (!bmr || !tdee || !targetCalories) {
      toast({
        title: "Please calculate your metrics first",
        description: "Click 'Calculate Metrics' to generate your personalized values.",
        variant: "destructive"
      });
      return;
    }

    try {
      const payload: SaveMemberProfilePayload = {
        age: profile.age,
        gender: profile.gender,
        weight_kg: profile.weight,
        height_cm: profile.height,
        goal: profile.goal,
        activity_level: profile.activityLevel,
        trainer_intake: {
          ...trainerIntake,
          primaryGoal: trainerIntake.primaryGoal || profile.goal,
        },
        nutrition_intake: {
          ...nutritionIntake,
          primaryGoal: nutritionIntake.primaryGoal || profile.goal,
        },
        is_private: !isPublicProfile,
        bmr: bmr || undefined,
        tdee: tdee || undefined,
        target_calories: targetCalories || undefined,
        weekly_calorie_goal: targetCalories ? targetCalories * 7 : undefined,
        weekly_workout_minutes: 300,
        daily_steps_goal: 10000,
        daily_water_liters: 3,
      };

      await saveMemberProfile(user.id, payload);

      let dietOk = false;
      let workoutOk = false;

      try {
        await generateDefaultDietPlan(user.id);
        dietOk = true;
      } catch (e) {
        console.error('Failed to generate default diet plan', e);
      }

      try {
        await generateDefaultWorkoutPlan(user.id);
        workoutOk = true;
      } catch (e) {
        console.error('Failed to generate default workout plan', e);
      }

      const visibilityText = isPublicProfile
        ? 'Your progress is now visible to others.'
        : 'Your profile remains private.';

      if (dietOk && workoutOk) {
        toast({
          title: 'Profile and plans updated!',
          description: `Your profile was saved and new diet and workout plans have been generated. ${visibilityText}`,
        });
      } else if (dietOk || workoutOk) {
        const which = dietOk ? 'diet' : 'workout';
        toast({
          title: 'Profile updated',
          description: `Your profile is saved and visible to your assigned trainer and nutritionist`,
        });
      } else {
        toast({
          title: 'Profile updated',
          description: `Your profile is saved`,
        });
      }
    } catch (error) {
      console.error('Failed to save member profile', error);
      toast({
        title: 'Failed to save profile',
        description: 'Something went wrong while saving your profile to the server.',
        variant: 'destructive',
      });
    }
  };

  const getGoalInfo = (goal: string) => {
    switch (goal) {
      case 'weight_loss':
        return { label: 'Weight Loss', desc: 'Burn fat while maintaining muscle', color: 'bg-red-500' };
      case 'muscle_gain':
        return { label: 'Muscle Gain', desc: 'Build lean muscle mass', color: 'bg-green-500' };
      case 'maintenance':
        return { label: 'Maintenance', desc: 'Maintain current weight and fitness', color: 'bg-blue-500' };
      case 'strength':
        return { label: 'Strength', desc: 'Increase strength and power', color: 'bg-purple-500' };
      default:
        return { label: 'Select Goal', desc: '', color: 'bg-gray-500' };
    }
  };

  const goalInfo = getGoalInfo(profile.goal || '');

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-foreground mb-2">Complete Your Profile</h1>
        <p className="text-muted-foreground">Help us create your personalized fitness plan</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Profile Form */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Personal Information
            </CardTitle>
            <CardDescription>
              Enter your details to calculate your personalized metrics
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  value={profile.age || ''}
                  onChange={(e) => setProfile({...profile, age: parseInt(e.target.value)})}
                  placeholder="25"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="gender">Gender</Label>
                <Select value={profile.gender} onValueChange={(value: 'male' | 'female') => setProfile({...profile, gender: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="weight">Weight (kg)</Label>
                <Input
                  id="weight"
                  type="number"
                  value={profile.weight || ''}
                  onChange={(e) => setProfile({...profile, weight: parseFloat(e.target.value)})}
                  placeholder="65"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="height">Height (cm)</Label>
                <Input
                  id="height"
                  type="number"
                  value={profile.height || ''}
                  onChange={(e) => setProfile({...profile, height: parseInt(e.target.value)})}
                  placeholder="165"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="goal">Fitness Goal</Label>
              <Select value={profile.goal} onValueChange={(value) => setProfile({ ...profile, goal: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select your goal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weight_loss">Weight Loss</SelectItem>
                  <SelectItem value="muscle_gain">Muscle Gain</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="strength">Strength Building</SelectItem>
                </SelectContent>
              </Select>
              {profile.goal && (
                <div className="flex items-center gap-2 mt-2">
                  <div className={`w-3 h-3 rounded-full ${goalInfo.color}`} />
                  <span className="text-sm text-muted-foreground">{goalInfo.desc}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="activity">Activity Level</Label>
              <Select value={profile.activityLevel} onValueChange={(value) => setProfile({ ...profile, activityLevel: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select activity level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sedentary">Sedentary (little to no exercise)</SelectItem>
                  <SelectItem value="light">Light (1-3 days/week)</SelectItem>
                  <SelectItem value="moderate">Moderate (3-5 days/week)</SelectItem>
                  <SelectItem value="active">Active (6-7 days/week)</SelectItem>
                  <SelectItem value="very_active">Very Active (2x/day or intense)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="pt-2">
              <p className="text-sm font-medium text-foreground">Training Preferences</p>
              <p className="text-xs text-muted-foreground">Used by your trainer to personalize your workout plan</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Fitness Level</Label>
                <Select
                  value={trainerIntake.fitnessLevel}
                  onValueChange={(value) => setTrainerIntake({ ...trainerIntake, fitnessLevel: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Days / Week</Label>
                <Input
                  type="number"
                  value={trainerIntake.daysPerWeek}
                  onChange={(e) => setTrainerIntake({ ...trainerIntake, daysPerWeek: Number(e.target.value) })}
                  min={1}
                  max={7}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Session Length (minutes)</Label>
                <Input
                  type="number"
                  value={trainerIntake.sessionLengthMinutes}
                  onChange={(e) =>
                    setTrainerIntake({ ...trainerIntake, sessionLengthMinutes: Number(e.target.value) })
                  }
                  min={10}
                  max={180}
                />
              </div>
              <div className="space-y-2">
                 
              </div>
            </div>

            <div className="space-y-2">
              <Label>Injuries / Limitations</Label>
              <Input
                value={trainerIntake.injuries}
                onChange={(e) => setTrainerIntake({ ...trainerIntake, injuries: e.target.value })}
                placeholder="e.g. knee pain, shoulder impingement"
              />
            </div>

            <div className="space-y-2">
              <Label>Training Preferences</Label>
              <Textarea
                value={trainerIntake.preferences}
                onChange={(e) => setTrainerIntake({ ...trainerIntake, preferences: e.target.value })}
                placeholder="What do you enjoy? What do you dislike?" 
              />
            </div>

            <div className="pt-2">
              <p className="text-sm font-medium text-foreground">Nutrition Preferences</p>
              <p className="text-xs text-muted-foreground">Used by your nutritionist to personalize your diet plan</p>
            </div>

            <div className="space-y-2">
              <Label>Allergies / Intolerances</Label>
              <Input
                value={nutritionIntake.allergies}
                onChange={(e) => setNutritionIntake({ ...nutritionIntake, allergies: e.target.value })}
                placeholder="e.g. dairy, gluten, peanuts"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
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
                  value={nutritionIntake.mealsPerDay}
                  onChange={(e) => setNutritionIntake({ ...nutritionIntake, mealsPerDay: Number(e.target.value) })}
                  min={1}
                  max={8}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Budget</Label>
              <Select value={nutritionIntake.budget} onValueChange={(value) => setNutritionIntake({ ...nutritionIntake, budget: value })}>
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
              <Label>Nutrition Notes</Label>
              <Textarea
                value={nutritionIntake.notes}
                onChange={(e) => setNutritionIntake({ ...nutritionIntake, notes: e.target.value })}
                placeholder="Anything else your nutritionist should know (schedule, culture, dislikes, etc.)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="public-profile">Profile Visibility</Label>
              <div className="flex items-center justify-between p-4 border border-border rounded-lg">
                <div className="flex items-center gap-3">
                  {isPublicProfile ? (
                    <Eye className="w-5 h-5 text-primary" />
                  ) : (
                    <EyeOff className="w-5 h-5 text-muted-foreground" />
                  )}
                  <div>
                    <p className="font-medium text-sm">
                      {isPublicProfile ? 'Public Profile' : 'Private Profile'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isPublicProfile 
                        ? 'Your progress and milestones are visible to others' 
                        : 'Only you can see your progress'}
                    </p>
                  </div>
                </div>
                <Switch
                  id="public-profile"
                  checked={isPublicProfile}
                  onCheckedChange={setIsPublicProfile}
                />
              </div>
            </div>

            <Button onClick={calculateMetrics} className="w-full" variant="outline">
              <Calculator className="w-4 h-4 mr-2" />
              Calculate Metrics
            </Button>
          </CardContent>
        </Card>

        {/* Calculated Metrics */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Your Personalized Metrics
            </CardTitle>
            <CardDescription>
              Based on your profile information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {bmr && tdee && targetCalories ? (
              <>
                <div className="grid gap-4">
                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">BMR (Basal Metabolic Rate)</span>
                      <Badge variant="outline">{bmr} cal/day</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Calories burned at rest
                    </p>
                  </div>

                  <div className="p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">TDEE (Total Daily Energy Expenditure)</span>
                      <Badge variant="outline">{tdee} cal/day</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Calories burned including activity
                    </p>
                  </div>

                  <div className="p-4 bg-gradient-primary text-white rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Target Calories</span>
                      <Badge className="bg-white/20 text-white">{targetCalories} cal/day</Badge>
                    </div>
                    <p className="text-xs text-white/80">
                      Recommended daily intake for your goal
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium text-foreground">Goal Progress Estimation</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Weekly target</span>
                      <span className="font-medium">
                        {profile.goal === 'weight_loss' ? '-0.5kg' : 
                         profile.goal === 'muscle_gain' ? '+0.3kg' : '0kg'}
                      </span>
                    </div>
                    <Progress value={75} className="h-2" />
                    <p className="text-xs text-muted-foreground">
                      Stay consistent for best results!
                    </p>
                  </div>
                </div>

                <Button onClick={handleSubmit} className="w-full bg-gradient-primary">
                  <Save className="w-4 h-4 mr-2" />
                  Save Profile  
                </Button>
              </>
            ) : (
              <div className="text-center py-8">
                <Calculator className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">Ready to Calculate</h3>
                <p className="text-sm text-muted-foreground">
                  Complete the form and click "Calculate Metrics" to see your personalized fitness plan.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ProfileSetup;