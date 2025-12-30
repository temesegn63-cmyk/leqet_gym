import axios from 'axios';

const EXERCISE_DB_API_KEY = process.env.REACT_APP_EXERCISEDB_API_KEY;

interface ApiNinjaExercise {
  name: string;
  type: string;
  muscle: string;
  equipment: string;
  difficulty: string;
  instructions: string;
}

interface Exercise {
  id: string;
  name: string;
  type: string;
  muscle: string;
  equipment: string;
  difficulty: string;
  instructions: string;
  calories_per_min?: number;
}

export const searchExercises = async (query: string): Promise<Exercise[]> => {
  try {
    const response = await axios.get<ApiNinjaExercise[]>('https://api.api-ninjas.com/v1/exercises', {
      params: { name: query },
      headers: { 'X-Api-Key': EXERCISE_DB_API_KEY },
    });

    // Map to our internal format and add estimated calories
    return response.data.map((ex) => ({
      id: ex.name.toLowerCase().replace(/\s+/g, '-'),
      name: ex.name,
      type: ex.type,
      muscle: ex.muscle,
      equipment: ex.equipment,
      difficulty: ex.difficulty,
      instructions: ex.instructions,
      calories_per_min: estimateCaloriesBurned(ex.type, ex.muscle),
    }));
  } catch (error) {
    console.error('Error searching exercises:', error);
    throw error;
  }
};

// Helper function to estimate calories burned based on exercise type and muscle group
function estimateCaloriesBurned(type: string, muscle: string): number {
  // Base MET (Metabolic Equivalent of Task) values
  const metValues: Record<string, number> = {
    'cardio': 8,
    'olympic_weightlifting': 6,
    'plyometrics': 8,
    'powerlifting': 6,
    'strength': 5,
    'stretching': 3,
    'strongman': 7,
  };

  // Adjust MET based on muscle group
  const muscleModifier: Record<string, number> = {
    'abdominals': 1.1,
    'abductors': 1.0,
    'adductors': 1.0,
    'biceps': 1.0,
    'calves': 1.0,
    'chest': 1.2,
    'forearms': 0.9,
    'glutes': 1.1,
    'hamstrings': 1.1,
    'lats': 1.1,
    'lower_back': 1.0,
    'middle_back': 1.0,
    'neck': 0.8,
    'quadriceps': 1.2,
    'traps': 1.0,
    'triceps': 1.0,
  };

  const baseMET = metValues[type.toLowerCase()] || 5; // Default to 5 if type not found
  const modifier = muscleModifier[muscle.toLowerCase()] || 1.0;
  
  // Calculate calories burned per minute (for 70kg person)
  // Formula: MET * 3.5 * weight(kg) / 200
  return (baseMET * modifier * 3.5 * 70) / 200;
}

export const getExerciseByMuscle = async (muscle: string): Promise<Exercise[]> => {
  try {
    const response = await axios.get<ApiNinjaExercise[]>('https://api.api-ninjas.com/v1/exercises', {
      params: { muscle },
      headers: { 'X-Api-Key': EXERCISE_DB_API_KEY },
    });

    return response.data.map((ex) => ({
      id: ex.name.toLowerCase().replace(/\s+/g, '-'),
      name: ex.name,
      type: ex.type,
      muscle: ex.muscle,
      equipment: ex.equipment,
      difficulty: ex.difficulty,
      instructions: ex.instructions,
      calories_per_min: estimateCaloriesBurned(ex.type, ex.muscle),
    }));
  } catch (error) {
    console.error('Error getting exercises by muscle:', error);
    throw error;
  }
};

export const getExerciseById = async (id: string): Promise<Exercise | null> => {
  try {
    // Note: The API doesn't support direct ID lookup, so we'll search by name
    const name = id.replace(/-/g, ' ');
    const exercises = await searchExercises(name);
    return exercises.find(ex => ex.id === id) || null;
  } catch (error) {
    console.error('Error getting exercise by ID:', error);
    throw error;
  }
};
