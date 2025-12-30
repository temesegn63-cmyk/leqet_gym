import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Food } from '@/types';
import { toast } from '@/hooks/use-toast';
import { 
  Plus, 
  Search, 
  UtensilsCrossed, 
  Flame, 
  Scale,
  Clock,
  CheckCircle,
  Wrench,
  Droplets
} from 'lucide-react';
import { FoodCustomizer } from '@/components/food/FoodCustomizer';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchFoods,
  logMeal,
  getTodayMeals,
  deleteMealItem,
  createFood,
  MealType,
} from '@/services/api/appBackend';

interface Ingredient {
  food: Food;
  quantity: number;
}

interface MealEntry {
  food: Food;
  quantity: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  isCustom?: boolean;
  ingredients?: Ingredient[];
  itemId?: number;
}

const MealLogging: React.FC = () => {
  const { user } = useAuth();
  const [selectedMealType, setSelectedMealType] = useState<string>('breakfast');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);
  const [quantity, setQuantity] = useState<number>(100);
  const [customizingFood, setCustomizingFood] = useState<Food | null>(null);
  const [customFoods, setCustomFoods] = useState<(Food & { ingredients?: Ingredient[] })[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [todayMeals, setTodayMeals] = useState<Record<string, MealEntry[]>>({
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: []
  });
  const [waterIntake, setWaterIntake] = useState<number>(0);
  const [waterInput, setWaterInput] = useState<string>('');

  const allFoods = [...foods, ...customFoods];
  const filteredFoods = allFoods.filter(food =>
    food.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (food.nameAmharic && food.nameAmharic.includes(searchTerm))
  );

  useEffect(() => {
    if (!user) {
      setTodayMeals({
        breakfast: [],
        lunch: [],
        dinner: [],
        snack: []
      });
      return;
    }

    const load = async () => {
      try {
        const mealRows = await getTodayMeals(user.id);

        const grouped: Record<string, MealEntry[]> = {
          breakfast: [],
          lunch: [],
          dinner: [],
          snack: [],
        };

        mealRows.forEach((item) => {
          const mealType = item.meal_type as string;
          const food: Food = {
            id: String(item.food_item_id),
            name: item.food_name,
            category: item.category || '',
            calories: Number(item.calories) || 0,
            protein: Number(item.protein) || 0,
            carbs: Number(item.carbs) || 0,
            fat: Number(item.fat) || 0,
            fiber: 0,
          };
          const entry: MealEntry = {
            food,
            quantity: Number(item.quantity) || 0,
            calories: Number(item.calories) || 0,
            protein: Number(item.protein) || 0,
            carbs: Number(item.carbs) || 0,
            fat: Number(item.fat) || 0,
            itemId: item.item_id,
          };

          if (!grouped[mealType]) {
            grouped[mealType] = [];
          }
          grouped[mealType].push(entry);
        });

        setTodayMeals(grouped);
      } catch (error) {
        console.error('Failed to load meals from backend', error);
      }
    };

    load();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setFoods([]);
      return;
    }

    const loadFoods = async () => {
      try {
        const foodRows = await fetchFoods(searchTerm ? searchTerm : undefined);

        const mappedFoods: Food[] = foodRows.map((f) => ({
          id: f.id,
          name: f.name,
          category: f.category,
          calories: f.calories,
          protein: f.protein,
          carbs: f.carbs,
          fat: f.fat,
          fiber: 0,
        }));
        setFoods(mappedFoods);
      } catch (error) {
        console.error('Failed to load foods from backend', error);
      }
    };

    loadFoods();
  }, [user, searchTerm]);

  const addFoodToMeal = async () => {
    if (!user) {
      toast({
        title: "Please log in",
        description: "You need to be logged in to log meals",
        variant: "destructive"
      });
      return;
    }

    if (!selectedFood) {
      toast({
        title: "Please select a food",
        description: "Choose a food item to add to your meal",
        variant: "destructive"
      });
      return;
    }

    const multiplier = quantity / 100;
    const mealEntry: MealEntry = {
      food: selectedFood,
      quantity,
      calories: Math.round(selectedFood.calories * multiplier),
      protein: Math.round(selectedFood.protein * multiplier * 10) / 10,
      carbs: Math.round(selectedFood.carbs * multiplier * 10) / 10,
      fat: Math.round(selectedFood.fat * multiplier * 10) / 10
    };

    try {
      const res = await logMeal({
        member_id: user.id,
        meal_type: selectedMealType as MealType,
        food_item_id: selectedFood.id,
        food_name: selectedFood.name,
        food_category: selectedFood.category,
        quantity,
        unit: 'g',
        calories: mealEntry.calories,
        protein: mealEntry.protein,
        carbs: mealEntry.carbs,
        fat: mealEntry.fat,
      });

      mealEntry.itemId = res.item_id;

      setTodayMeals(prev => ({
        ...prev,
        [selectedMealType]: [...prev[selectedMealType], mealEntry]
      }));

      toast({
        title: "Food added successfully!",
        description: `Added ${quantity}g of ${selectedFood.name} to ${selectedMealType}`,
      });
    } catch (error) {
      console.error('Failed to log meal', error);
      toast({
        title: "Failed to log meal",
        description: "Something went wrong while saving to the server",
        variant: "destructive"
      });
    }

    setSelectedFood(null);
    setQuantity(100);
    setSearchTerm('');
  };

  const handleCustomFoodSave = async (customFood: Food & { ingredients: Ingredient[] }) => {
    try {
      const id = await createFood({
        name: customFood.name,
        category: customFood.category,
        calories: customFood.calories,
        protein: customFood.protein,
        carbs: customFood.carbs,
        fat: customFood.fat,
      });

      const persistedFood: Food & { ingredients?: Ingredient[] } = {
        ...customFood,
        id,
      };

      setCustomFoods(prev => [...prev, persistedFood]);
    } catch (error) {
      console.error('Failed to save custom food', error);
      toast({
        title: "Failed to save custom food",
        description: "Something went wrong while saving to the server",
        variant: "destructive"
      });
    } finally {
      setCustomizingFood(null);
    }
  };

  const removeFoodFromMeal = async (mealType: string, index: number) => {
    const entry = todayMeals[mealType]?.[index];

    setTodayMeals(prev => ({
      ...prev,
      [mealType]: prev[mealType].filter((_, i) => i !== index)
    }));

    if (entry?.itemId) {
      try {
        await deleteMealItem(entry.itemId);
      } catch (error) {
        console.error('Failed to delete meal item', error);
      }
    }
  };

  const getMealTotals = (mealType: string) => {
    const meals = todayMeals[mealType];
    return meals.reduce(
      (totals, meal) => ({
        calories: totals.calories + meal.calories,
        protein: totals.protein + meal.protein,
        carbs: totals.carbs + meal.carbs,
        fat: totals.fat + meal.fat
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  };

  const getDayTotals = () => {
    return Object.keys(todayMeals).reduce(
      (dayTotals, mealType) => {
        const mealTotals = getMealTotals(mealType);
        return {
          calories: dayTotals.calories + mealTotals.calories,
          protein: dayTotals.protein + mealTotals.protein,
          carbs: dayTotals.carbs + mealTotals.carbs,
          fat: dayTotals.fat + mealTotals.fat
        };
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  };

  const dayTotals = getDayTotals();
  const targetCalories = 1700;
  const calorieProgress = (dayTotals.calories / targetCalories) * 100;
  const dailyWaterGoal = 3; // liters
  const waterProgress = (waterIntake / dailyWaterGoal) * 100;

  const handleAddWater = () => {
    const liters = parseFloat(waterInput);
    if (isNaN(liters) || liters <= 0) {
      toast({
        title: "Invalid amount",
        description: "Please enter a valid water amount in liters",
        variant: "destructive"
      });
      return;
    }
    setWaterIntake(prev => prev + liters);
    setWaterInput('');
    toast({
      title: "Water logged!",
      description: `Added ${liters}L to your daily water intake`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Meal Logging</h1>
          <p className="text-muted-foreground">Track your daily nutrition intake</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          {new Date().toLocaleDateString()}
        </div>
      </div>

      {/* Daily Summary */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Flame className="w-5 h-5 text-secondary" />
            Today's Nutrition Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-foreground">{Math.round(dayTotals.calories)}</div>
              <div className="text-sm text-muted-foreground">Calories</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{Math.round(dayTotals.protein)}g</div>
              <div className="text-sm text-muted-foreground">Protein</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-secondary">{Math.round(dayTotals.carbs)}g</div>
              <div className="text-sm text-muted-foreground">Carbs</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-accent">{Math.round(dayTotals.fat)}g</div>
              <div className="text-sm text-muted-foreground">Fat</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-info">{waterIntake.toFixed(1)}L</div>
              <div className="text-sm text-muted-foreground">Water</div>
            </div>
          </div>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Calorie Goal Progress</span>
                <span>{Math.round(calorieProgress)}% of {targetCalories}</span>
              </div>
              <Progress value={calorieProgress} />
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Water Intake Progress</span>
                <span>{waterIntake.toFixed(1)}L of {dailyWaterGoal}L</span>
              </div>
              <Progress value={Math.min(waterProgress, 100)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Water Intake Tracking */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Droplets className="w-5 h-5 text-info" />
            Water Intake Tracker
          </CardTitle>
          <CardDescription>Log your daily water consumption in liters</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Enter Water (Liters)</label>
              <Input
                type="number"
                placeholder="e.g., 0.5"
                value={waterInput}
                onChange={(e) => setWaterInput(e.target.value)}
                min="0"
                step="0.1"
              />
            </div>
            <Button onClick={handleAddWater} className="w-full md:w-auto">
              <Plus className="w-4 h-4 mr-2" />
              Add Water
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {[0.25, 0.5, 0.75, 1].map((amount) => (
              <Button
                key={amount}
                variant="outline"
                size="sm"
                onClick={() => {
                  setWaterIntake(prev => prev + amount);
                  toast({
                    title: "Water logged!",
                    description: `Added ${amount}L to your daily water intake`,
                  });
                }}
              >
                +{amount}L
              </Button>
            ))}
          </div>
          <div className="mt-4 p-4 bg-info/10 rounded-lg text-center">
            <div className="text-3xl font-bold text-info">{waterIntake.toFixed(1)}L</div>
            <div className="text-sm text-muted-foreground">Total Water Today</div>
            <div className="text-xs text-muted-foreground mt-1">
              {waterProgress >= 100 ? '🎉 Goal reached!' : `${(dailyWaterGoal - waterIntake).toFixed(1)}L to go`}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Food Search & Add */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Add Food to Meal
            </CardTitle>
            <CardDescription>Search and add foods to your meals</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Meal Type</label>
              <Select value={selectedMealType} onValueChange={setSelectedMealType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="breakfast">Breakfast</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="dinner">Dinner</SelectItem>
                  <SelectItem value="snack">Snack</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Search Foods</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search Ethiopian or international foods..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-2">
              {filteredFoods.map((food, index) => (
                <div
                  key={`${food.id}-${index}`}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedFood?.id === food.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border hover:bg-muted/50'
                  }`}
                  onClick={() => setSelectedFood(food)}
                >
                    <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{food.name}</div>
                      {food.nameAmharic && (
                        <div className="text-sm text-muted-foreground">{food.nameAmharic}</div>
                      )}
                      <div className="text-xs text-muted-foreground mt-1">
                        {food.calories} cal/100g • {food.category}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{food.category}</Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCustomizingFood(food);
                        }}
                      >
                        <Wrench className="w-3 h-3 mr-1" />
                        Customize
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {selectedFood && (
              <div className="space-y-3 p-3 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{selectedFood.name}</span>
                  <Badge variant="secondary">{selectedFood.category}</Badge>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Quantity (grams)</label>
                  <Input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                    min="1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>Calories: {Math.round(selectedFood.calories * quantity / 100)}</div>
                  <div>Protein: {Math.round(selectedFood.protein * quantity / 10) / 10}g</div>
                  <div>Carbs: {Math.round(selectedFood.carbs * quantity / 10) / 10}g</div>
                  <div>Fat: {Math.round(selectedFood.fat * quantity / 10) / 10}g</div>
                </div>

                <Button onClick={addFoodToMeal} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  Add to {selectedMealType}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Meal Breakdown */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UtensilsCrossed className="w-5 h-5" />
              Meal Breakdown
            </CardTitle>
            <CardDescription>Review what you've logged for each meal</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="breakfast" className="space-y-4">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="breakfast">Breakfast</TabsTrigger>
                <TabsTrigger value="lunch">Lunch</TabsTrigger>
                <TabsTrigger value="dinner">Dinner</TabsTrigger>
                <TabsTrigger value="snack">Snack</TabsTrigger>
              </TabsList>

              {['breakfast', 'lunch', 'dinner', 'snack'].map((mealType) => (
                <TabsContent key={mealType} value={mealType} className="space-y-3">
                  {todayMeals[mealType].length === 0 ? (
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      No items logged for this meal yet.
                    </div>
                  ) : (
                    <>
                      {todayMeals[mealType].map((meal, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                        >
                          <div className="flex-1">
                            <div className="font-medium text-foreground">{meal.food.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {meal.quantity}g • {meal.calories} cal
                            </div>
                            <div className="text-xs text-muted-foreground">
                              P: {meal.protein}g • C: {meal.carbs}g • F: {meal.fat}g
                            </div>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => removeFoodFromMeal(mealType, index)}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                      
                      <div className="pt-3 border-t border-border">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                          <div className="text-center">
                            <div className="font-medium">{Math.round(getMealTotals(mealType).calories)}</div>
                            <div className="text-xs text-muted-foreground">cal</div>
                          </div>
                          <div className="text-center">
                            <div className="font-medium">{Math.round(getMealTotals(mealType).protein)}g</div>
                            <div className="text-xs text-muted-foreground">protein</div>
                          </div>
                          <div className="text-center">
                            <div className="font-medium">{Math.round(getMealTotals(mealType).carbs)}g</div>
                            <div className="text-xs text-muted-foreground">carbs</div>
                          </div>
                          <div className="text-center">
                            <div className="font-medium">{Math.round(getMealTotals(mealType).fat)}g</div>
                            <div className="text-xs text-muted-foreground">fat</div>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Food Customizer Dialog */}
      {customizingFood && (
        <FoodCustomizer
          baseFood={customizingFood}
          isOpen={!!customizingFood}
          onClose={() => setCustomizingFood(null)}
          onSave={handleCustomFoodSave}
          availableFoods={allFoods}
        />
      )}
    </div>
  );
};

export default MealLogging;