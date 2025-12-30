import { api } from './config';

// API_BASE should include the /api prefix (e.g., http://localhost:4000/api)
const API_BASE = '';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const toIsoTimestamp = (value: unknown): string => {
  if (value == null) return new Date().toISOString();
  const d = value instanceof Date ? value : new Date(String(value));
  const t = d.getTime();
  return Number.isFinite(t) ? d.toISOString() : new Date().toISOString();
};

export interface BackendFood {
  id: string;
  name: string;
  category: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export async function fetchFoods(query?: string): Promise<BackendFood[]> {
  const res = await api.get<unknown>(`${API_BASE}/foods`, {
    params: query ? { q: query } : undefined,
  });

  const data = res.data;
  const raw =
    Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.foods) ? data.foods : [];

  return raw.map((row) => {
    const r = isRecord(row) ? row : {};
    return {
      id: r.id != null ? String(r.id) : '',
      name: typeof r.name === 'string' ? r.name : '',
      category: typeof r.category === 'string' ? r.category : '',
      calories: Number(r.calories) || 0,
      protein: Number(r.protein) || 0,
      carbs: Number(r.carbs) || 0,
      fat: Number(r.fat) || 0,
    };
  });
}

export interface CreateFoodInput {
  name: string;
  category?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

export async function createFood(input: CreateFoodInput): Promise<string> {
  const res = await api.post<{ id: string | number }>(`${API_BASE}/foods`, input);
  return String(res.data.id);
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface LogMealInput {
  member_id: number;
  meal_type: MealType;
  food_item_id: string | number;
  quantity: number;
  unit?: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  food_name?: string;
  food_category?: string;
}

export interface LogMealResponse {
  meal_log_id: number;
  item_id: number;
}

export async function logMeal(input: LogMealInput): Promise<LogMealResponse> {
  const res = await api.post<LogMealResponse>(`${API_BASE}/meals`, input);
  return res.data;
}

export interface TodayMealItem {
  meal_log_id: number;
  meal_type: MealType;
  logged_at: string;
  item_id: number;
  food_item_id: number;
  food_name: string;
  category: string | null;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export async function getTodayMeals(memberId: number): Promise<TodayMealItem[]> {
  const res = await api.get<{ meals: TodayMealItem[] }>(`${API_BASE}/meals/today`, {
    params: { member_id: memberId },
  });
  return res.data.meals || [];
}

export interface MealsByDateRow {
  meal_type: MealType;
  meal_count: number;
  items_count: number;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
}

export async function getMealsByDate(memberId: number, date: string): Promise<MealsByDateRow[]> {
  const res = await api.get<{ meals: MealsByDateRow[] }>(`${API_BASE}/meals/by-date`, {
    params: { member_id: memberId, date },
  });
  return res.data.meals || [];
}

export async function deleteMealItem(itemId: number): Promise<void> {
  await api.delete(`${API_BASE}/meals/items/${itemId}`);
}

export interface CreateCoachFeedbackInput {
  memberId: number;
  message: string;
}

export async function sendTrainerFeedback(input: CreateCoachFeedbackInput): Promise<void> {
  await api.post(`${API_BASE}/members/${input.memberId}/trainer-feedback`, { message: input.message });
}

export async function sendNutritionistFeedback(input: CreateCoachFeedbackInput): Promise<void> {
  await api.post(`${API_BASE}/members/${input.memberId}/nutritionist-feedback`, { message: input.message });
}

export interface ExerciseSummary {
  id: string;
  name: string;
  caloriesPerMinute: number;
}

export async function fetchExercises(query?: string): Promise<ExerciseSummary[]> {
  if (query && query.trim()) {
    const res = await api.get<unknown>(`${API_BASE}/exercises/search`, {
      params: { q: query },
    });

    const data = res.data;
    const raw =
      Array.isArray(data) ? data : isRecord(data) && Array.isArray(data.exercises) ? data.exercises : [];

    return raw.map((ex) => {
      const e = isRecord(ex) ? ex : {};
      return {
        id: e.id != null ? String(e.id) : '',
        name: typeof e.name === 'string' ? e.name : '',
        caloriesPerMinute: Number(e.caloriesPerMinute) || 0,
      };
    });
  }

  const res = await api.get<{ exercises: { id: string | number; name: string; caloriesPerMinute: number }[] }>(
    `${API_BASE}/exercises`
  );

  return (res.data.exercises || []).map((e) => ({
    id: String(e.id),
    name: e.name,
    caloriesPerMinute: Number(e.caloriesPerMinute) || 0,
  }));
}

export interface LogWorkoutInput {
  member_id: number;
  exercise_id?: string | number;
  exercise_name?: string;
  duration_minutes: number;
  calories_burned?: number;
  weight_used?: number;
  weight_unit?: string;
}

export interface LogWorkoutResponse {
  workout_log_id: number;
  item_id: number;
}

export interface TrainerScheduleRow {
  id: number;
  member_id: number;
  member_name: string;
  session_type: 'personal' | 'online' | 'group';
  session_date: string;
  session_time: string;
  status: string;
}

export interface FetchTrainerScheduleParams {
  from?: string;
  to?: string;
}

export async function fetchTrainerSchedule(params?: FetchTrainerScheduleParams): Promise<TrainerScheduleRow[]> {
  const res = await api.get<{ sessions: TrainerScheduleRow[] }>(`${API_BASE}/trainer/schedule`, {
    params,
  });
  return res.data.sessions || [];
}

export interface MemberScheduleRow {
  id: number;
  trainer_id: number;
  trainer_name: string;
  session_type: 'personal' | 'online' | 'group';
  session_date: string;
  session_time: string;
  status: string;
}

export async function fetchMemberSchedule(
  memberId: number,
  params?: FetchTrainerScheduleParams
): Promise<MemberScheduleRow[]> {
  const res = await api.get<{ sessions: MemberScheduleRow[] }>(`${API_BASE}/members/${memberId}/schedule`, {
    params,
  });
  return res.data.sessions || [];
}

export interface CreateTrainerScheduleInput {
  member_id: number;
  session_type: 'personal' | 'online' | 'group';
  session_date: string;
  session_time: string;
}

export async function createTrainerScheduleSession(input: CreateTrainerScheduleInput): Promise<number> {
  const res = await api.post<{ id: number }>(`${API_BASE}/trainer/schedule`, input);
  return Number(res.data.id);
}

export async function logWorkout(input: LogWorkoutInput): Promise<LogWorkoutResponse> {
  const res = await api.post<LogWorkoutResponse>(`${API_BASE}/workouts`, {
    ...input,
    exercise_id: input.exercise_id != null ? Number(input.exercise_id) : undefined,
  });
  return res.data;
}

export interface TodayWorkoutItem {
  workout_log_id: number;
  logged_at: string;
  item_id: number;
  exercise_id: number;
  exercise_name: string;
  duration_minutes: number;
  calories_burned: number;
  weight_used?: number | null;
  weight_unit?: string | null;
}

export async function getTodayWorkouts(memberId: number): Promise<TodayWorkoutItem[]> {
  const res = await api.get<{ workouts: TodayWorkoutItem[] }>(`${API_BASE}/workouts/today`, {
    params: { member_id: memberId },
  });
  return res.data.workouts || [];
}

export async function deleteWorkoutItem(itemId: number): Promise<void> {
  await api.delete(`${API_BASE}/workouts/items/${itemId}`);
}

// ---- Member progress summary (Progress page) ----

export interface MemberProgressSummary {
  profile: {
    is_private: boolean;
  };
  stats: {
    started_at: string | null;
    days_active: number;
    start_weight_kg: number | null;
    current_weight_kg: number | null;
    total_weight_lost_kg: number | null;
    workouts_completed: number;
    workouts_this_month: number;
    meal_logs: number;
    meals_per_day_avg: number;
    calorie_consistency_percent: number;
  };
  targets: {
    calorie_target: number;
    weekly_workout_sessions_target: number;
    monthly_workout_sessions_target: number;
  };
  charts: {
    weight: { date: string; weight: number }[];
    workouts: { week_start: string; sessions: number }[];
    calories: { date: string; day: string; calories: number; target: number }[];
  };
}

export async function fetchMemberProgressSummary(memberId: number): Promise<MemberProgressSummary> {
  const res = await api.get<MemberProgressSummary>(`${API_BASE}/members/${memberId}/progress-summary`);
  return res.data;
}

export interface MemberCheckIn {
  id: number;
  memberId: number;
  adherence: number | null;
  fatigue: number | null;
  pain: number | null;
  weightKg: number | null;
  notes: string | null;
  loggedAt: string;
}

export async function fetchMemberCheckIns(memberId: number, limit = 10): Promise<MemberCheckIn[]> {
  const res = await api.get<{ checkIns: any[] }>(`${API_BASE}/members/${memberId}/check-ins`, {
    params: { limit },
  });
  const rows = res.data.checkIns || [];
  return rows.map((row) => ({
    id: Number(row.id),
    memberId: Number(row.member_id),
    adherence: row.adherence != null ? Number(row.adherence) : null,
    fatigue: row.fatigue != null ? Number(row.fatigue) : null,
    pain: row.pain != null ? Number(row.pain) : null,
    weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
    notes: row.notes ?? null,
    loggedAt: String(row.logged_at),
  }));
}

export interface CreateMemberCheckInPayload {
  adherence?: number | null;
  fatigue?: number | null;
  pain?: number | null;
  weightKg?: number | null;
  notes?: string | null;
}

export async function createMemberCheckIn(
  memberId: number,
  payload: CreateMemberCheckInPayload
): Promise<MemberCheckIn> {
  const res = await api.post<{ checkIn: any }>(`${API_BASE}/members/${memberId}/check-ins`, payload);
  const row = res.data.checkIn;
  return {
    id: Number(row.id),
    memberId: Number(row.member_id),
    adherence: row.adherence != null ? Number(row.adherence) : null,
    fatigue: row.fatigue != null ? Number(row.fatigue) : null,
    pain: row.pain != null ? Number(row.pain) : null,
    weightKg: row.weight_kg != null ? Number(row.weight_kg) : null,
    notes: row.notes ?? null,
    loggedAt: String(row.logged_at),
  };
}

export interface MemberOverview {
  id: number;
  full_name: string;
  email: string;
  created_at?: string;
  goal?: string | null;
  trainer_id?: number | null;
  nutritionist_id?: number | null;
  meals_today: number;
  workouts_this_week: number;
  last_activity: string;
  total_calories_today: number;
}

export async function fetchMemberOverview(): Promise<MemberOverview[]> {
  const url = `${API_BASE}/members/overview`;
  console.log('fetchMemberOverview ->', url);
  const res = await api.get<{ members: MemberOverview[] }>(url);
  return res.data.members || [];
}

export interface RecentMealSummary {
  meal_log_id: number;
  member_id: number;
  full_name: string;
  meal_type: MealType;
  logged_at: string;
  total_calories: number;
}

export async function fetchRecentMeals(limit = 5): Promise<RecentMealSummary[]> {
  const res = await api.get<{ meals: RecentMealSummary[] }>(`${API_BASE}/meals/recent`, {
    params: { limit },
  });
  return res.data.meals || [];
}

// ---- Member dashboard summary ----

export interface DashboardDaySummary {
  date: string;
  label: string;
  calories_consumed: number;
  calories_burned: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DashboardActivity {
  type: 'meal' | 'workout';
  id: number;
  logged_at: string;
  meal_type?: MealType;
  calories: number;
}

export interface MemberDashboardSummary {
  days: DashboardDaySummary[];
  activities: DashboardActivity[];
}

export async function fetchMemberDashboardSummary(
  memberId: number,
  days?: number
): Promise<MemberDashboardSummary> {
  const params = days != null ? { days } : undefined;
  const res = await api.get<MemberDashboardSummary>(`${API_BASE}/members/${memberId}/dashboard-summary`, {
    params,
  });
  return res.data;
}

// ---- Coach feedback (trainer & nutritionist) ----

export type CoachFeedbackType = 'feedback' | 'motivation' | 'correction';

export interface CoachFeedback {
  id: string;
  coachId: string;
  coachName: string;
  memberId: string;
  message: string;
  type: CoachFeedbackType;
  timestamp: string;
  read: boolean;
}

interface RawTrainerFeedback {
  id: number;
  trainer_id: number | null;
  trainer_name: string | null;
  member_id: number;
  content: string;
  created_at: string;
}

interface RawNutritionistFeedback {
  id: number;
  nutritionist_id: number | null;
  nutritionist_name: string | null;
  member_id: number;
  content: string;
  created_at: string;
}

export async function fetchTrainerFeedback(memberId: number): Promise<CoachFeedback[]> {
  const res = await api.get<{ feedback: RawTrainerFeedback[] }>(
    `${API_BASE}/members/${memberId}/trainer-feedback`
  );
  const raw = res.data.feedback || [];

  return raw.map((row) => ({
    id: String(row.id),
    coachId: row.trainer_id != null ? String(row.trainer_id) : '',
    coachName: row.trainer_name || 'Trainer',
    memberId: String(row.member_id),
    message: row.content,
    type: 'feedback',
    timestamp: toIsoTimestamp(row.created_at),
    read: true,
  }));
}

export async function fetchNutritionistFeedback(memberId: number): Promise<CoachFeedback[]> {
  const res = await api.get<{ feedback: RawNutritionistFeedback[] }>(
    `${API_BASE}/members/${memberId}/nutritionist-feedback`
  );
  const raw = res.data.feedback || [];

  return raw.map((row) => ({
    id: String(row.id),
    coachId: row.nutritionist_id != null ? String(row.nutritionist_id) : '',
    coachName: row.nutritionist_name || 'Nutritionist',
    memberId: String(row.member_id),
    message: row.content,
    type: 'feedback',
    timestamp: toIsoTimestamp(row.created_at),
    read: true,
  }));
}

// ---- Threaded plan messages (member  coach conversations) ----

export type PlanType = 'diet' | 'workout';
export type PlanMessageSenderRole = 'member' | 'trainer' | 'nutritionist' | 'admin';

export interface PlanMessage {
  id: number;
  memberId: number;
  coachId: number | null;
  senderRole: PlanMessageSenderRole;
  planType: PlanType;
  message: string;
  createdAt: string;
}

export async function fetchPlanMessages(
  memberId: number,
  planType: PlanType,
  limit = 50
): Promise<PlanMessage[]> {
  const res = await api.get<{ messages: any[] }>(`${API_BASE}/members/${memberId}/plan-messages`, {
    params: { planType, limit },
  });
  const rows = res.data.messages || [];
  return rows.map((row) => ({
    id: Number(row.id),
    memberId: Number(row.member_id),
    coachId: row.coach_id != null ? Number(row.coach_id) : null,
    senderRole: String(row.sender_role) as PlanMessageSenderRole,
    planType: String(row.plan_type) as PlanType,
    message: String(row.message ?? ''),
    createdAt: toIsoTimestamp(row.created_at),
  }));
}

export interface CreatePlanMessageInput {
  memberId: number;
  planType: PlanType;
  message: string;
}

export async function sendPlanMessage(input: CreatePlanMessageInput): Promise<PlanMessage> {
  const res = await api.post<{ message: any }>(
    `${API_BASE}/members/${input.memberId}/plan-messages`,
    {
      planType: input.planType,
      message: input.message,
    }
  );
  const row = res.data.message;
  return {
    id: Number(row.id),
    memberId: Number(row.member_id),
    coachId: row.coach_id != null ? Number(row.coach_id) : null,
    senderRole: String(row.sender_role) as PlanMessageSenderRole,
    planType: String(row.plan_type) as PlanType,
    message: String(row.message ?? ''),
    createdAt: toIsoTimestamp(row.created_at),
  };
}

// ---- Member profile & goals ----

export interface BackendMemberProfile {
  memberId: number;
  age?: number | null;
  gender?: 'male' | 'female' | null;
  weightKg?: number | null;
  heightCm?: number | null;
  goal?: string | null;
  activityLevel?: string | null;
  trainerIntake?: Record<string, unknown> | null;
  nutritionIntake?: Record<string, unknown> | null;
  isPrivate?: boolean;
  bmr?: number | null;
  tdee?: number | null;
  targetCalories?: number | null;
  weeklyCalorieGoal?: number | null;
  weeklyWorkoutMinutes?: number | null;
  dailyStepsGoal?: number | null;
  dailyWaterLiters?: number | null;
}

export interface SaveMemberProfilePayload {
  age?: number;
  gender?: 'male' | 'female';
  weight_kg?: number;
  height_cm?: number;
  goal?: string;
  activity_level?: string;
  trainer_intake?: Record<string, unknown> | null;
  nutrition_intake?: Record<string, unknown> | null;
  is_private?: boolean;
  bmr?: number;
  tdee?: number;
  target_calories?: number;
  weekly_calorie_goal?: number;
  weekly_workout_minutes?: number;
  daily_steps_goal?: number;
  daily_water_liters?: number;
}

export async function getMemberProfile(memberId: number): Promise<BackendMemberProfile | null> {
  const res = await api.get<{ profile: BackendMemberProfile }>(`${API_BASE}/members/${memberId}/profile`);
  return res.data.profile ?? null;
}

export async function saveMemberProfile(
  memberId: number,
  payload: SaveMemberProfilePayload
): Promise<BackendMemberProfile> {
  const res = await api.put<{ profile: BackendMemberProfile }>(
    `${API_BASE}/members/${memberId}/profile`,
    payload
  );
  return res.data.profile;
}

// ---- Diet plan for member ----

export interface BackendDietPlanFood {
  name: string;
  quantity: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface BackendDietPlanMeal {
  id: string;
  mealType: MealType;
  foods: BackendDietPlanFood[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  tips?: string;
}

export interface BackendDietPlan {
  id: string;
  name: string;
  type: 'system' | 'trainer';
  goal: string;
  dailyCalories: number;
  dailyProtein: number;
  dailyCarbs: number;
  dailyFat: number;
  meals: BackendDietPlanMeal[];
  createdBy?: string;
  createdAt: string;
  active: boolean;
}

export async function fetchMemberDietPlan(memberId: number): Promise<BackendDietPlan | null> {
  const res = await api.get<{ plan: BackendDietPlan | null }>(`${API_BASE}/members/${memberId}/diet-plan`);
  return res.data.plan ?? null;
}

export interface ManualDietPlanItemPayload {
  foodId?: number | string | null;
  name?: string;
  category?: string;
  quantity: number;
  unit?: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface ManualDietPlanMealPayload {
  mealType: MealType;
  name?: string;
  notes?: string;
  items: ManualDietPlanItemPayload[];
}

export interface SaveManualDietPlanPayload {
  name?: string;
  goal?: string;
  meals: ManualDietPlanMealPayload[];
}

export async function saveManualDietPlan(
  memberId: number,
  payload: SaveManualDietPlanPayload
): Promise<string> {
  const res = await api.post<{ id: string | number }>(
    `${API_BASE}/members/${memberId}/diet-plan/manual`,
    payload
  );
  return String(res.data.id);
}

export async function generateDefaultDietPlan(memberId: number): Promise<string> {
  const res = await api.post<{ id: string | number }>(
    `${API_BASE}/members/${memberId}/diet-plan/generate-default`
  );
  return String(res.data.id);
}

// ---- Workout plan for member ----

export interface BackendWorkoutExercise {
  name: string;
  sets: number;
  reps: string;
  rest: string;
  duration?: number;
  instructions?: string;
  targetMuscles: string[];
}

export interface BackendWorkoutDay {
  id: string;
  day: string;
  name: string;
  duration: number;
  difficulty: string;
  focus: string[];
  exercises: BackendWorkoutExercise[];
  completed?: boolean;
  tips?: string;
}

export interface BackendWorkoutPlan {
  id: string;
  name: string;
  type: 'system' | 'trainer';
  goal: string;
  weeklyDays: number;
  estimatedDuration: number;
  difficulty: string;
  workouts: BackendWorkoutDay[];
  createdBy?: string;
  createdAt: string;
  active: boolean;
}

export async function fetchMemberWorkoutPlan(memberId: number): Promise<BackendWorkoutPlan | null> {
  const res = await api.get<{ plan: BackendWorkoutPlan | null }>(
    `${API_BASE}/members/${memberId}/workout-plan`
  );
  return res.data.plan ?? null;
}

export interface ManualWorkoutExercisePayload {
  exerciseId?: number | string | null;
  name: string;
  sets?: number | null;
  reps?: string | null;
  rest?: string | null;
  durationMinutes?: number | null;
  intensity?: string | null;
  instructions?: string | null;
  targetMuscles?: string | null;
  category?: string | null;
}

export interface ManualWorkoutDayPayload {
  dayOfWeek?: string | null;
  name?: string | null;
  durationMinutes?: number | null;
  difficulty?: string | null;
  focus?: string | null;
  tips?: string | null;
  exercises: ManualWorkoutExercisePayload[];
}

export interface SaveManualWorkoutPlanPayload {
  name?: string;
  goal?: string;
  days: ManualWorkoutDayPayload[];
}

export async function saveManualWorkoutPlan(
  memberId: number,
  payload: SaveManualWorkoutPlanPayload
): Promise<string> {
  const res = await api.post<{ id: string | number }>(
    `${API_BASE}/members/${memberId}/workout-plan/manual`,
    payload
  );
  return String(res.data.id);
}

export async function generateDefaultWorkoutPlan(memberId: number): Promise<string> {
  const res = await api.post<{ id: string | number }>(
    `${API_BASE}/members/${memberId}/workout-plan/generate-default`
  );
  return String(res.data.id);
}

// ---- Notifications ----

export interface BackendNotification {
  id: number;
  message: string;
  createdAt: string;
  isRead: boolean;
}

export async function fetchNotifications(onlyUnread?: boolean): Promise<BackendNotification[]> {
  const params = onlyUnread ? { only_unread: '1' } : undefined;
  const res = await api.get<{ notifications: any[] }>(`${API_BASE}/notifications`, { params });
  const rows = res.data.notifications || [];

  return rows.map((row) => ({
    id: Number(row.id),
    message: String(row.message ?? ''),
    createdAt: toIsoTimestamp(row.created_at),
    isRead: Boolean(row.is_read),
  }));
}

export async function markNotificationRead(id: number): Promise<void> {
  if (!Number.isFinite(id)) return;
  await api.post(`${API_BASE}/notifications/${id}/read`);
}
