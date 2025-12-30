import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import DashboardLayout from "./components/layout/DashboardLayout";
import MemberDashboard from "./pages/dashboard/MemberDashboard";
import ProfileSetup from "./pages/dashboard/ProfileSetup";
import MealLogging from "./pages/dashboard/MealLogging";
import WorkoutLogging from "./pages/dashboard/WorkoutLogging";
import DietPlan from "./pages/dashboard/DietPlan";
import WorkoutPlan from "./pages/dashboard/WorkoutPlan";
import TrainerWorkoutPlanBuilder from "./pages/dashboard/TrainerWorkoutPlanBuilder";
import TrainerDashboard from "./pages/dashboard/TrainerDashboard";
import TrainerSchedule from "./pages/dashboard/TrainerSchedule";
import MemberSchedule from "./pages/dashboard/MemberSchedule";
import TrainerAnalytics from "./pages/dashboard/TrainerAnalytics";
import TrainerNotifications from "./pages/dashboard/TrainerNotifications";
import AdminDashboard from "./pages/dashboard/AdminDashboard";
import AdminUserManagement from "./pages/dashboard/AdminUserManagement";
import AdminAssignments from "./pages/dashboard/AdminAssignments";
import AdminSystemMonitor from "./pages/dashboard/AdminSystemMonitor";
import NutritionistDashboard from "./pages/dashboard/NutritionistDashboard";
import NutritionistAnalytics from "./pages/dashboard/NutritionistAnalytics";
import NutritionistClientLogs from "./pages/dashboard/NutritionistClientLogs";
import NutritionistMealPlans from "./pages/dashboard/NutritionistMealPlans";
import Progress from "./pages/dashboard/Progress";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

// Protected Route Component
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
};

// Dashboard Router based on user role
const DashboardRouter = () => {
  const { user } = useAuth();
  
  if (!user) return <Navigate to="/login" replace />;
  
  return (
    <DashboardLayout>
      <Routes>
        <Route index element={
          user.role === 'member' ? <MemberDashboard /> :
          user.role === 'trainer' ? <TrainerDashboard /> :
          user.role === 'nutritionist' ? <NutritionistDashboard /> :
          user.role === 'admin' ? <AdminDashboard /> :
          <div>Unknown Role</div>
        } />
        <Route path="profile" element={<ProfileSetup />} />
        <Route
          path="diet"
          element={user.role === 'nutritionist' ? <NutritionistMealPlans /> : <DietPlan />}
        />
        <Route path="workout-plan" element={<WorkoutPlan />} />
        <Route path="workout-plan/builder" element={<TrainerWorkoutPlanBuilder />} />
        <Route
          path="meals"
          element={user.role === 'nutritionist' ? <NutritionistClientLogs /> : <MealLogging />}
        />
        <Route path="workouts" element={<WorkoutLogging />} />
        <Route path="progress" element={<Progress />} />
        <Route path="notifications" element={<TrainerNotifications />} />
        <Route
          path="schedule"
          element={
            user.role === 'member' ? (
              <MemberSchedule />
            ) : user.role === 'trainer' ? (
              <TrainerSchedule />
            ) : (
              <Navigate to="/dashboard" replace />
            )
          }
        />
        <Route
          path="analytics"
          element={
            user.role === 'nutritionist' ? <NutritionistAnalytics /> :
            user.role === 'trainer' ? <TrainerAnalytics /> :
            <Navigate to="/dashboard" replace />
          }
        />
        <Route path="users" element={<AdminUserManagement />} />
        <Route path="assignments" element={<AdminAssignments />} />
        <Route path="monitor" element={<AdminSystemMonitor />} />
      </Routes>
    </DashboardLayout>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/signup" element={<Signup />} />
              <Route path="/dashboard/*" element={
                <ProtectedRoute>
                  <DashboardRouter />
                </ProtectedRoute>
              } />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
