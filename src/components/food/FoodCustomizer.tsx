import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Food } from '@/types';
import { Plus, Minus, Save } from 'lucide-react';

interface Ingredient {
  food: Food;
  quantity: number;
}

interface FoodCustomizerProps {
  baseFood: Food;
  isOpen: boolean;
  onClose: () => void;
  onSave: (customFood: Food & { ingredients: Ingredient[] }) => void;
  availableFoods: Food[];
}

export const FoodCustomizer: React.FC<FoodCustomizerProps> = ({
  baseFood,
  isOpen,
  onClose,
  onSave,
  availableFoods
}) => {
  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { food: baseFood, quantity: 100 }
  ]);
  const [customName, setCustomName] = useState(`Custom ${baseFood.name}`);

  const addIngredient = (food: Food) => {
    setIngredients(prev => [...prev, { food, quantity: 50 }]);
  };

  const updateIngredientQuantity = (index: number, quantity: number) => {
    setIngredients(prev => 
      prev.map((ing, i) => i === index ? { ...ing, quantity } : ing)
    );
  };

  const removeIngredient = (index: number) => {
    if (ingredients.length > 1) {
      setIngredients(prev => prev.filter((_, i) => i !== index));
    }
  };

  const calculateNutrition = () => {
    const totals = ingredients.reduce(
      (acc, ing) => {
        const multiplier = ing.quantity / 100;
        return {
          calories: acc.calories + (ing.food.calories * multiplier),
          protein: acc.protein + (ing.food.protein * multiplier),
          carbs: acc.carbs + (ing.food.carbs * multiplier),
          fat: acc.fat + (ing.food.fat * multiplier),
          fiber: acc.fiber + ((ing.food.fiber ?? 0) * multiplier),
        };
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );

    const totalWeight = ingredients.reduce((sum, ing) => sum + ing.quantity, 0);
    
    // Normalize to per 100g
    const factor = 100 / totalWeight;
    return {
      calories: Math.round(totals.calories * factor),
      protein: Math.round(totals.protein * factor * 10) / 10,
      carbs: Math.round(totals.carbs * factor * 10) / 10,
      fat: Math.round(totals.fat * factor * 10) / 10,
      fiber: Math.round(totals.fiber * factor * 10) / 10,
    };
  };

  const handleSave = () => {
    const nutrition = calculateNutrition();
    const customFood: Food & { ingredients: Ingredient[] } = {
      id: `custom_${Date.now()}`,
      name: customName,
      category: 'custom',
      ...nutrition,
      ingredients
    };
    onSave(customFood);
    onClose();
  };

  const nutrition = calculateNutrition();
  const selectableFoods = availableFoods.filter(food => 
    !ingredients.some(ing => ing.food.id === food.id)
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Customize Food Recipe</DialogTitle>
          <DialogDescription>
            Add ingredients and adjust portions to create your custom food item
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div>
            <Label htmlFor="customName">Custom Food Name</Label>
            <Input
              id="customName"
              value={customName}
              onChange={(e) => setCustomName(e.target.value)}
              placeholder="Enter custom food name"
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* Ingredients List */}
            <Card>
              <CardHeader>
                <CardTitle>Ingredients</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {ingredients.map((ingredient, index) => (
                  <div key={index} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{ingredient.food.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {ingredient.food.nameAmharic}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateIngredientQuantity(index, Math.max(10, ingredient.quantity - 10))}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                      <Input
                        type="number"
                        value={ingredient.quantity}
                        onChange={(e) => updateIngredientQuantity(index, parseInt(e.target.value) || 0)}
                        className="w-20 text-center"
                        min="1"
                      />
                      <span className="text-sm text-muted-foreground">g</span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => updateIngredientQuantity(index, ingredient.quantity + 10)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {ingredients.length > 1 && (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeIngredient(index)}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                ))}

                {selectableFoods.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Add More Ingredients</Label>
                    <div className="grid gap-2 max-h-40 overflow-y-auto">
                      {selectableFoods.map((food) => (
                        <Button
                          key={food.id}
                          variant="outline"
                          size="sm"
                          onClick={() => addIngredient(food)}
                          className="justify-start h-auto p-2"
                        >
                          <div className="text-left">
                            <div className="font-medium">{food.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {food.nameAmharic}
                            </div>
                          </div>
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Nutrition Preview */}
            <Card>
              <CardHeader>
                <CardTitle>Nutrition Facts (per 100g)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold text-foreground">{nutrition.calories}</div>
                      <div className="text-sm text-muted-foreground">Calories</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold text-primary">{nutrition.protein}g</div>
                      <div className="text-sm text-muted-foreground">Protein</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold text-secondary">{nutrition.carbs}g</div>
                      <div className="text-sm text-muted-foreground">Carbs</div>
                    </div>
                    <div className="text-center p-3 bg-muted/50 rounded-lg">
                      <div className="text-2xl font-bold text-accent">{nutrition.fat}g</div>
                      <div className="text-sm text-muted-foreground">Fat</div>
                    </div>
                  </div>

                  <div className="p-3 bg-muted/30 rounded-lg">
                    <div className="text-sm font-medium mb-2">Recipe Summary</div>
                    <div className="text-xs text-muted-foreground space-y-1">
                      {ingredients.map((ing, index) => (
                        <div key={index} className="flex justify-between">
                          <span>{ing.food.name}</span>
                          <span>{ing.quantity}g</span>
                        </div>
                      ))}
                      <div className="border-t pt-1 font-medium">
                        <div className="flex justify-between">
                          <span>Total Weight:</span>
                          <span>{ingredients.reduce((sum, ing) => sum + ing.quantity, 0)}g</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Badge variant="secondary" className="w-full justify-center">
                    Custom Recipe
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!customName.trim()}>
              <Save className="w-4 h-4 mr-2" />
              Save Custom Food
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};