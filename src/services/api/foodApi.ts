import axios from 'axios';

const EDAMAM_APP_ID = process.env.REACT_APP_EDAMAM_APP_ID;
const EDAMAM_APP_KEY = process.env.REACT_APP_EDAMAM_APP_KEY;

interface FoodItem {
  foodId: string;
  label: string;
  nutrients: {
    ENERC_KCAL: number;
    PROCNT: number;
    FAT: number;
    CHOCDF: number;
  };
  category: string;
  brand?: string;
  foodContentsLabel?: string;
}

interface EdamamFood {
  foodId: string;
  label: string;
  nutrients?: {
    ENERC_KCAL?: number;
    PROCNT?: number;
    FAT?: number;
    CHOCDF?: number;
  };
  category?: string;
  brand?: string;
  foodContentsLabel?: string;
}

interface EdamamHint {
  food: EdamamFood;
}

interface EdamamParserResponse {
  hints: EdamamHint[];
}

export const searchFood = async (query: string): Promise<FoodItem[]> => {
  try {
    const response = await axios.get<EdamamParserResponse>('https://api.edamam.com/api/food-database/v2/parser', {
      params: {
        app_id: EDAMAM_APP_ID,
        app_key: EDAMAM_APP_KEY,
        ingr: query,
        nutritionType: 'logging',
      },
    });

    return response.data.hints.map((hint) => ({
      foodId: hint.food.foodId,
      label: hint.food.label,
      nutrients: {
        ENERC_KCAL: hint.food.nutrients?.ENERC_KCAL ?? 0,
        PROCNT: hint.food.nutrients?.PROCNT ?? 0,
        FAT: hint.food.nutrients?.FAT ?? 0,
        CHOCDF: hint.food.nutrients?.CHOCDF ?? 0,
      },
      category: hint.food.category || 'Generic foods',
      brand: hint.food.brand,
      foodContentsLabel: hint.food.foodContentsLabel,
    }));
  } catch (error) {
    console.error('Error searching food:', error);
    throw error;
  }
};

export const getFoodDetails = async (foodId: string) => {
  try {
    const response = await axios.post('https://api.edamam.com/api/food-database/v2/nutrients', {
      ingredients: [
        {
          quantity: 1,
          measureURI: 'http://www.edamam.com/ontologies/edamam.owl#Measure_serving',
          foodId,
        },
      ],
    }, {
      params: {
        app_id: EDAMAM_APP_ID,
        app_key: EDAMAM_APP_KEY,
      },
    });

    return response.data;
  } catch (error) {
    console.error('Error getting food details:', error);
    throw error;
  }
};
