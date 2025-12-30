import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchMemberOverview,
  getTodayMeals,
  getTodayWorkouts,
  generateDefaultWorkoutPlan,
  fetchPlanMessages,
  sendPlanMessage,
} from '@/services/api/appBackend';
import type {
  MemberOverview,
  TodayMealItem,
  TodayWorkoutItem,
  PlanMessage,
} from '@/services/api/appBackend';
import { toast } from '@/hooks/use-toast';
import { 
  Users, 
  MessageSquare, 
  TrendingUp, 
  Calendar,
  Target,
  Activity,
  UtensilsCrossed,
  AlertCircle,
  CheckCircle
} from 'lucide-react';

export default function TrainerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [members, setMembers] = useState<MemberOverview[]>([]);
  const [memberMeals, setMemberMeals] = useState<TodayMealItem[]>([]);
  const [memberWorkouts, setMemberWorkouts] = useState<TodayWorkoutItem[]>([]);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [conversationMember, setConversationMember] = useState<MemberOverview | null>(null);
  const [isConversationDialogOpen, setIsConversationDialogOpen] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<PlanMessage[]>([]);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [conversationInput, setConversationInput] = useState('');
  const [isSendingConversationMessage, setIsSendingConversationMessage] = useState(false);

  const getRequestErrorMessage = (error: unknown) => {
    if (error && typeof error === 'object' && 'isAxiosError' in error) {
      const err = error as { message?: string; response?: { status?: number; data?: unknown } };
      const status = err.response?.status;
      const data = err.response?.data as { message?: string } | undefined;
      const msg = data?.message || err.message || 'Request failed';
      return status ? `${msg} (HTTP ${status})` : msg;
    }

    if (error instanceof Error) return error.message;
    return 'Request failed';
  };

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchMemberOverview();
        setMembers(data);
      } catch (error) {
        console.error('Failed to load member overview', error);
      }
    };

    load();
  }, [user]);

  const assignedMembers = members;

  // Calculate member statistics
  const getMemberStats = (memberId: number) => {
    const overview = members.find((m) => m.id === memberId);

    if (!overview) {
      return {
        mealsToday: 0,
        workoutsThisWeek: 0,
        adherence: 0,
        lastActivity: Date.now() - 86400000,
        totalCalories: 0,
      };
    }

    const adherencePercentage = Math.min(
      100,
      overview.meals_today * 25 + overview.workouts_this_week * 15
    );

    return {
      mealsToday: overview.meals_today,
      workoutsThisWeek: overview.workouts_this_week,
      adherence: adherencePercentage,
      lastActivity: new Date(overview.last_activity).getTime(),
      totalCalories: overview.total_calories_today,
    };
  };

  const loadMemberDetails = async (member: MemberOverview) => {
    try {
      const [meals, workouts] = await Promise.all([
        getTodayMeals(member.id),
        getTodayWorkouts(member.id),
      ]);

      setMemberMeals(meals);
      setMemberWorkouts(workouts);
    } catch (error) {
      console.error('Failed to load member details', error);
    }
  };

  const openWorkoutConversation = async (member: MemberOverview) => {
    setConversationMember(member);
    setIsConversationDialogOpen(true);
    setIsLoadingConversation(true);
    try {
      const messages = await fetchPlanMessages(member.id, 'workout');
      setConversationMessages(messages || []);
    } catch (error) {
      console.error('Failed to load workout plan conversation', error);
      setConversationMessages([]);
      toast({
        title: 'Failed to load conversation',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingConversation(false);
    }
  };

  const sendWorkoutConversationMessage = async () => {
    if (!conversationMember) return;

    const trimmed = conversationInput.trim();
    if (!trimmed) return;

    try {
      setIsSendingConversationMessage(true);
      const created = await sendPlanMessage({
        memberId: conversationMember.id,
        planType: 'workout',
        message: trimmed,
      });

      setConversationMessages((prev) =>
        [...prev, created].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
      );
      setConversationInput('');
    } catch (error) {
      console.error('Failed to send workout plan message', error);
      toast({
        title: 'Failed to send message',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingConversationMessage(false);
    }
  };

  const handleGenerateWorkoutPlan = (member: MemberOverview) => {
    navigate(`/dashboard/workout-plan/builder?memberId=${member.id}`);
  };

  const getStatusBadge = (adherence: number) => {
    if (adherence >= 80) return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Excellent</Badge>;
    if (adherence >= 60) return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">Good</Badge>;
    if (adherence >= 40) return <Badge className="bg-amber-500/10 text-amber-600 border-amber-200">Needs Focus</Badge>;
    return <Badge className="bg-red-500/10 text-red-600 border-red-200">Inactive</Badge>;
  };

  return (
    <div className="p-6 space-y-6">
      <Dialog
        open={isConversationDialogOpen}
        onOpenChange={(open) => {
          setIsConversationDialogOpen(open);
          if (!open) {
            setConversationMember(null);
            setConversationMessages([]);
            setConversationInput('');
            setIsLoadingConversation(false);
            setIsSendingConversationMessage(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {conversationMember
                ? `Workout Plan Conversation with ${conversationMember.full_name}`
                : 'Workout Plan Conversation'}
            </DialogTitle>
            <DialogDescription>
              Chat with your member about their workout plan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
              {isLoadingConversation ? (
                <p className="text-sm text-muted-foreground">Loading conversation...</p>
              ) : conversationMessages.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No messages yet. Start the conversation by sending a message below.
                </p>
              ) : (
                [...conversationMessages]
                  .sort(
                    (a, b) =>
                      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                  )
                  .map((msg) => {
                    const isMine =
                      user &&
                      (msg.senderRole === 'trainer' || msg.senderRole === 'admin') &&
                      msg.coachId === user.id;
                    const senderLabel =
                      msg.senderRole === 'member'
                        ? 'Member'
                        : msg.senderRole === 'trainer'
                        ? isMine
                          ? 'You'
                          : 'Trainer'
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
              <Textarea
                value={conversationInput}
                onChange={(e) => setConversationInput(e.target.value)}
                placeholder="Send a message about this member's workout plan..."
                rows={3}
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setIsConversationDialogOpen(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={sendWorkoutConversationMessage}
                  disabled={
                    !conversationInput.trim() ||
                    isSendingConversationMessage ||
                    !conversationMember
                  }
                >
                  {isSendingConversationMessage ? 'Sending...' : 'Send message'}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Trainer Dashboard</h1>
          <p className="text-muted-foreground">Manage your assigned members and track their progress</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Total Members</p>
            <p className="text-2xl font-bold text-foreground">{assignedMembers.length}</p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active Today</p>
                <p className="text-2xl font-bold text-foreground">
                  {assignedMembers.filter(member => {
                    const stats = getMemberStats(member.id);
                    return stats.mealsToday > 0;
                  }).length}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-emerald-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Need Attention</p>
                <p className="text-2xl font-bold text-foreground">
                  {assignedMembers.filter(member => {
                    const stats = getMemberStats(member.id);
                    return stats.adherence < 40;
                  }).length}
                </p>
              </div>
              <AlertCircle className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Adherence</p>
                <p className="text-2xl font-bold text-foreground">
                  {assignedMembers.length > 0
                    ? Math.round(
                        assignedMembers.reduce(
                          (sum, member) => sum + getMemberStats(member.id).adherence,
                          0
                        ) / assignedMembers.length
                      )
                    : 0}%
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Workouts</p>
                <p className="text-2xl font-bold text-foreground">
                  {assignedMembers.reduce(
                    (sum, member) => sum + getMemberStats(member.id).workoutsThisWeek,
                    0
                  )}
                </p>
              </div>
              <Activity className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Members List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            My Members
          </CardTitle>
          <CardDescription>
            Monitor your assigned members' progress and provide feedback
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-16 gap-y-12">
            {assignedMembers.map((member) => {
              const stats = getMemberStats(member.id);
              const daysSinceActivity = Math.floor((Date.now() - stats.lastActivity) / (1000 * 60 * 60 * 24));
              
              return (
                <Card key={member.id} className="hover:shadow-md transition-shadow relative hover:z-10">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div className="min-w-0">
                          <h3 className="font-medium text-foreground truncate">{member.full_name}</h3>
                          <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                        </div>
                      </div>
                      {getStatusBadge(stats.adherence)}
                    </div>

                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Adherence</span>
                        <span className="font-medium">{stats.adherence}%</span>
                      </div>
                      <Progress value={stats.adherence} className="h-2" />
                      
                      <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                        <div className="flex items-center gap-1">
                          <UtensilsCrossed className="h-3 w-3 text-orange-500" />
                          <span>{stats.mealsToday} meals today</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Activity className="h-3 w-3 text-blue-500" />
                          <span>{stats.workoutsThisWeek} workouts</span>
                        </div>
                      </div>
                      
                      <div className="text-xs text-muted-foreground">
                        Last active: {daysSinceActivity === 0 ? 'Today' : `${daysSinceActivity} days ago`}
                      </div>
                    </div>

                    <div className="flex gap-2 mt-4">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={() => loadMemberDetails(member)}
                          >
                            View Details
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl">
                          <DialogHeader>
                            <DialogTitle>{member.full_name}'s Progress</DialogTitle>
                            <DialogDescription>
                              Detailed view of member's meals, workouts, and progress
                            </DialogDescription>
                          </DialogHeader>
                          
                          <Tabs defaultValue="meals" className="w-full">
                            <TabsList className="grid w-full grid-cols-3">
                              <TabsTrigger value="meals">Meals</TabsTrigger>
                              <TabsTrigger value="workouts">Workouts</TabsTrigger>
                              <TabsTrigger value="progress">Progress</TabsTrigger>
                            </TabsList>
                            
                            <TabsContent value="meals" className="space-y-4">
                              <div className="max-h-80 overflow-y-auto">
                                {memberMeals.length === 0 ? (
                                  <div className="text-sm text-muted-foreground">
                                    No meals logged today
                                  </div>
                                ) : (
                                  memberMeals.slice(0, 20).map((meal) => (
                                    <div
                                      key={meal.item_id}
                                      className="flex justify-between items-center p-3 border rounded-lg"
                                    >
                                      <div>
                                        <p className="font-medium">{meal.meal_type}</p>
                                        <p className="text-sm text-muted-foreground">
                                          {new Date(meal.logged_at).toLocaleDateString()}
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <p className="font-medium">{meal.calories} cal</p>
                                        <p className="text-sm text-muted-foreground">{meal.food_name}</p>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </TabsContent>
                            
                            <TabsContent value="workouts" className="space-y-4">
                              <div className="max-h-80 overflow-y-auto">
                                {memberWorkouts.length === 0 ? (
                                  <div className="text-sm text-muted-foreground">
                                    No workouts logged today
                                  </div>
                                ) : (
                                  memberWorkouts.slice(0, 20).map((workout) => (
                                    <div
                                      key={workout.item_id}
                                      className="flex justify-between items-center p-3 border rounded-lg"
                                    >
                                      <div>
                                        <p className="font-medium">Workout Session</p>
                                        <p className="text-sm text-muted-foreground">
                                          {new Date(workout.logged_at).toLocaleDateString()}
                                        </p>
                                      </div>
                                      <div className="text-right">
                                        <p className="font-medium">{workout.calories_burned} cal</p>
                                        <p className="text-sm text-muted-foreground">
                                          {workout.duration_minutes} min
                                        </p>
                                      </div>
                                    </div>
                                  ))
                                )}
                              </div>
                            </TabsContent>
                            
                            <TabsContent value="progress" className="space-y-4">
                              <div className="grid grid-cols-2 gap-4">
                                <Card>
                                  <CardHeader className="pb-2">
                                    <CardTitle className="text-sm">Weekly Summary</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-2">
                                      <div className="flex justify-between">
                                        <span className="text-sm">Meals logged</span>
                                        <span className="font-medium">{stats.mealsToday * 7}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-sm">Workouts</span>
                                        <span className="font-medium">{stats.workoutsThisWeek}</span>
                                      </div>
                                      <div className="flex justify-between">
                                        <span className="text-sm">Avg Calories</span>
                                        <span className="font-medium">{stats.totalCalories}</span>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                                
                                <Card>
                                  <CardHeader className="pb-2">
                                    <CardTitle className="text-sm">Goals Progress</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-3">
                                      <div>
                                        <div className="flex justify-between text-sm mb-1">
                                          <span>Daily Calories</span>
                                          <span>75%</span>
                                        </div>
                                        <Progress value={75} className="h-2" />
                                      </div>
                                      <div>
                                        <div className="flex justify-between text-sm mb-1">
                                          <span>Weekly Workouts</span>
                                          <span>60%</span>
                                        </div>
                                        <Progress value={60} className="h-2" />
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              </div>
                            </TabsContent>
                          </Tabs>
                        </DialogContent>
                      </Dialog>

                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => openWorkoutConversation(member)}
                      >
                        <MessageSquare className="h-3 w-3 mr-1" />
                        Plan Conversation
                      </Button>

                      <Button
                        size="sm"
                        onClick={() => handleGenerateWorkoutPlan(member)}
                        disabled={isGeneratingPlan}
                      >
                        Generate Plan
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}