import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { Users, UtensilsCrossed, Calendar, TrendingUp, MessageSquare } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import {
  fetchMemberOverview,
  fetchRecentMeals,
  fetchPlanMessages,
  sendPlanMessage,
} from '@/services/api/appBackend';
import type { MemberOverview, RecentMealSummary, PlanMessage } from '@/services/api/appBackend';

const NutritionistDashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [members, setMembers] = useState<MemberOverview[]>([]);
  const [recentMeals, setRecentMeals] = useState<RecentMealSummary[]>([]);
  const [conversationMember, setConversationMember] = useState<MemberOverview | null>(null);
  const [isConversationDialogOpen, setIsConversationDialogOpen] = useState(false);
  const [conversationMessages, setConversationMessages] = useState<PlanMessage[]>([]);
  const [isLoadingConversation, setIsLoadingConversation] = useState(false);
  const [conversationInput, setConversationInput] = useState('');
  const [isSendingConversationMessage, setIsSendingConversationMessage] = useState(false);

  // Get all members
  
  // Calculate statistics
  const totalMembers = members.length;
  const activeMembersToday = members.filter(m => m.meals_today > 0).length;

  useEffect(() => {
    const load = async () => {
      try {
        const [memberData, recentMealData] = await Promise.all([
          fetchMemberOverview(),
          fetchRecentMeals(5),
        ]);

        setMembers(memberData);
        setRecentMeals(recentMealData);
      } catch (error) {
        console.error('Failed to load nutritionist overview', error);
      }
    };

    load();
  }, []);

  const openDietConversation = async (member: MemberOverview) => {
    setConversationMember(member);
    setIsConversationDialogOpen(true);
    setIsLoadingConversation(true);
    try {
      const messages = await fetchPlanMessages(member.id, 'diet');
      setConversationMessages(messages || []);
    } catch (error) {
      console.error('Failed to load diet plan conversation', error);
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

  const sendDietConversationMessage = async () => {
    if (!conversationMember) return;

    const trimmed = conversationInput.trim();
    if (!trimmed) return;

    try {
      setIsSendingConversationMessage(true);
      const created = await sendPlanMessage({
        memberId: conversationMember.id,
        planType: 'diet',
        message: trimmed,
      });

      setConversationMessages((prev) =>
        [...prev, created].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
      );
      setConversationInput('');
    } catch (error) {
      console.error('Failed to send diet plan message', error);
      toast({
        title: 'Failed to send message',
        description: 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSendingConversationMessage(false);
    }
  };

  const stats = [
    {
      title: 'Total Clients',
      value: totalMembers,
      icon: Users,
      description: 'Active nutrition clients',
      color: 'text-blue-600'
    },
    {
      title: 'Today\'s Check-ins',
      value: activeMembersToday,
      icon: UtensilsCrossed,
      description: 'Members who logged meals',
      color: 'text-green-600'
    },
    {
      title: 'Diet Plans',
      value: totalMembers,
      icon: Calendar,
      description: 'Active diet plans',
      color: 'text-purple-600'
    },
    {
      title: 'Avg Compliance',
      value: '87%',
      icon: TrendingUp,
      description: 'Weekly average',
      color: 'text-orange-600'
    },
  ];

  return (
    <div className="space-y-6">
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
                ? `Diet Plan Conversation with ${conversationMember.full_name}`
                : 'Diet Plan Conversation'}
            </DialogTitle>
            <DialogDescription>
              Chat with your member about their diet plan.
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
                      (msg.senderRole === 'nutritionist' || msg.senderRole === 'admin') &&
                      msg.coachId === user.id;
                    const senderLabel =
                      msg.senderRole === 'member'
                        ? 'Member'
                        : msg.senderRole === 'nutritionist'
                        ? isMine
                          ? 'You'
                          : 'Nutritionist'
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
                placeholder="Send a message about this member's diet plan..."
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
                  onClick={sendDietConversationMessage}
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

      <div>
        <h1 className="text-3xl font-bold text-foreground">Nutrition Dashboard</h1>
        <p className="text-muted-foreground">Manage client nutrition plans and track progress</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
              <p className="text-xs text-muted-foreground">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>My Clients</CardTitle>
            <CardDescription>Members assigned to you</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-primary flex items-center justify-center text-white font-medium">
                      {member.full_name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div>
                      <div className="font-medium text-foreground">{member.full_name}</div>
                      <div className="text-sm text-muted-foreground capitalize">General wellness</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-muted-foreground">
                      {member.meals_today} meals today
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDietConversation(member)}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      Plan Conversation
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => navigate(`/dashboard/diet?memberId=${member.id}`)}
                    >
                      Open Plan Builder
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest meal logs from clients</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentMeals.map((log) => (
                <div
                  key={log.meal_log_id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border"
                >
                  <div>
                    <div className="font-medium text-foreground">
                      {log.full_name}
                    </div>
                    <div className="text-sm text-muted-foreground capitalize">
                      {log.meal_type} - {log.total_calories} cal
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(log.logged_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default NutritionistDashboard;
