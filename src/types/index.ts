export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'trainer' | 'nutritionist' | 'member';
  avatar?: string;
  joinDate?: string;
  trainerId?: string | null;
  nutritionistId?: string | null;
  isActivated?: boolean;
  // Add any other user properties you need
}

export interface MemberProfile extends User {
  height?: number;
  weight?: number;
  age?: number;
  gender?: 'male' | 'female';
  goal?: string;
  activityLevel?: string;
  goals?: string[];
  dietaryRestrictions?: string[];
  fitnessLevel?: 'beginner' | 'intermediate' | 'advanced';
  // Add any other member-specific properties
}

export interface Food {
  id: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize?: string;
  category?: string;
  nameAmharic?: string;
  fiber?: number;
}

export interface Exercise {
  id: string;
  name: string;
  type?: string;
  muscle?: string;
  equipment?: string;
  difficulty?: string;
  instructions?: string;
  category?: string;
  caloriesPerMinute?: number;
}

export interface MealLog {
  id: string;
  userId: string;
  foodId: string;
  food: Food;
  servingSize: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  date: string;
  createdAt: string;
}

export interface WorkoutLog {
  id: string;
  userId: string;
  exerciseId: string;
  exercise: Exercise;
  duration: number; // in minutes
  caloriesBurned: number;
  date: string;
  notes?: string;
}

export interface MembershipPayment {
  id: string;
  userId: string;
  amount: number;
  paymentDate: string;
  status: 'pending' | 'completed' | 'failed';
  subscriptionPlan: 'monthly' | 'quarterly' | 'yearly';
  nextBillingDate: string;
}

// Utility functions
export const calculateBMR = (weight: number, height: number, age: number, gender: 'male' | 'female'): number => {
  // Mifflin-St Jeor Equation
  if (gender === 'male') {
    return 10 * weight + 6.25 * height - 5 * age + 5;
  } else {
    return 10 * weight + 6.25 * height - 5 * age - 161;
  }
};

export const calculateTDEE = (bmr: number, activityLevel: number): number => {
  return bmr * activityLevel;
};
