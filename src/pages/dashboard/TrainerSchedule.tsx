import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { addDays, endOfWeek, format, isValid, isWithinInterval, startOfDay, startOfWeek } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import {
  createTrainerScheduleSession,
  fetchMemberOverview,
  fetchTrainerSchedule,
  MemberOverview,
} from '@/services/api/appBackend';
import { useToast } from '@/hooks/use-toast';
import {
  Calendar as CalendarIcon,
  Clock,
  Users,
  Video,
  MapPin,
  Plus,
  Filter
} from 'lucide-react';

interface Session {
  id: string;
  memberId: string;
  memberName: string;
  memberAvatar: string;
  date: Date;
  time: string;
  duration: number;
  type: 'personal' | 'group' | 'online';
  location: string;
  status: 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
}

const normalizeIsoDate = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
    const parsed = new Date(trimmed);
    return isValid(parsed) ? parsed.toISOString().slice(0, 10) : null;
  }

  if (value instanceof Date) {
    return isValid(value) ? value.toISOString().slice(0, 10) : null;
  }

  if (value != null) {
    const parsed = new Date(String(value));
    return isValid(parsed) ? parsed.toISOString().slice(0, 10) : null;
  }

  return null;
};

const TrainerSchedule: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [filterType, setFilterType] = useState<'all' | 'personal' | 'group' | 'online'>('all');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [members, setMembers] = useState<MemberOverview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMemberId, setFormMemberId] = useState<string>('');
  const [formSessionType, setFormSessionType] = useState<'personal' | 'group' | 'online'>('personal');
  const [formSessionDate, setFormSessionDate] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const [formSessionTime, setFormSessionTime] = useState<string>('09:00');

  const loadSchedule = async () => {
    const schedule = await fetchTrainerSchedule();

    const mapped: Session[] = (schedule || [])
      .map((row) => {
        const dateIso = normalizeIsoDate(row.session_date);
        const date = dateIso ? new Date(`${dateIso}T00:00:00`) : new Date(NaN);
        if (!isValid(date)) {
          return null;
        }

        const time = typeof row.session_time === 'string' ? row.session_time.slice(0, 5) : '';

        const status: Session['status'] =
          row.status === 'completed' ? 'completed' : row.status === 'cancelled' ? 'cancelled' : 'scheduled';

        const type: Session['type'] =
          row.session_type === 'group' || row.session_type === 'online' ? row.session_type : 'personal';

        return {
          id: String(row.id),
          memberId: String(row.member_id),
          memberName: row.member_name || 'Member',
          memberAvatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
            row.member_name || String(row.member_id)
          )}`,
          date,
          time,
          duration: 60,
          type,
          location: type === 'online' ? 'Online' : 'Gym',
          status,
        };
      })
      .filter((row): row is Session => row != null);

    setSessions(mapped);
  };

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const [scheduleResult, membersResult] = await Promise.allSettled([
          loadSchedule(),
          fetchMemberOverview(),
        ]);

        if (membersResult.status === 'fulfilled') {
          setMembers(membersResult.value || []);
        } else {
          console.error('Failed to load member overview for scheduling', membersResult.reason);
          setMembers([]);
        }

        if (scheduleResult.status === 'rejected') {
          throw scheduleResult.reason;
        }
        setError(null);
      } catch (err) {
        console.error('Failed to load schedule', err);
        setError('Failed to load schedule');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, []);

  const todaysSessions = sessions.filter(session => {
    const matchesDate = format(session.date, 'yyyy-MM-dd') === format(selectedDate, 'yyyy-MM-dd');
    const matchesType = filterType === 'all' || session.type === filterType;
    return matchesDate && matchesType;
  });

  const now = new Date();
  const weekRange = {
    start: startOfWeek(now, { weekStartsOn: 1 }),
    end: endOfWeek(now, { weekStartsOn: 1 }),
  };

  const thisWeekSessions = sessions.filter((session) =>
    isWithinInterval(session.date, { start: weekRange.start, end: weekRange.end })
  );

  const thisWeekHoursBooked = thisWeekSessions.reduce((sum, s) => sum + (Number(s.duration) || 0), 0) / 60;

  const completionRate = thisWeekSessions.length
    ? Math.round(
        (thisWeekSessions.filter((s) => s.status === 'completed').length / thisWeekSessions.length) * 100
      )
    : 0;

  const upcomingSessions = sessions
    .filter((session) => session.status === 'scheduled')
    .filter((session) =>
      isWithinInterval(session.date, {
        start: startOfDay(now),
        end: addDays(startOfDay(now), 7),
      })
    );

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'online':
        return <Video className="w-4 h-4" />;
      case 'group':
        return <Users className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getTypeBadgeVariant = (type: string) => {
    switch (type) {
      case 'online':
        return 'default';
      case 'group':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const handleCreateSession = async () => {
    if (!formMemberId) {
      toast({ title: 'Member is required', variant: 'destructive' });
      return;
    }

    if (!formSessionDate) {
      toast({ title: 'Date is required', variant: 'destructive' });
      return;
    }

    if (!formSessionTime) {
      toast({ title: 'Time is required', variant: 'destructive' });
      return;
    }

    try {
      setIsSubmitting(true);
      await createTrainerScheduleSession({
        member_id: Number(formMemberId),
        session_type: formSessionType,
        session_date: formSessionDate,
        session_time: formSessionTime,
      });

      toast({ title: 'Session scheduled' });
      setIsCreateOpen(false);
      await loadSchedule();
    } catch (e) {
      console.error('Failed to create schedule session', e);
      toast({ title: 'Failed to schedule session', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="p-4 rounded-lg border border-border bg-muted/30 text-muted-foreground">
          Loading schedule...
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Training Schedule</h1>
          <p className="text-muted-foreground">Manage your training sessions</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={(open) => {
          setIsCreateOpen(open);
          if (open) {
            setFormSessionDate(format(selectedDate, 'yyyy-MM-dd'));
            if (!formMemberId && members.length === 1) {
              setFormMemberId(String(members[0].id));
            }
          }
        }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary" disabled={!user}>
              <Plus className="w-4 h-4 mr-2" />
              Schedule Session
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Schedule Session</DialogTitle>
              <DialogDescription>Create a new training session for an assigned member.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Member</Label>
                <Select value={formMemberId} onValueChange={setFormMemberId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a member" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Session Type</Label>
                <Select value={formSessionType} onValueChange={(v) => setFormSessionType(v as typeof formSessionType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="personal">Personal</SelectItem>
                    <SelectItem value="group">Group</SelectItem>
                    <SelectItem value="online">Online</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Date</Label>
                  <Input
                    type="date"
                    value={formSessionDate}
                    onChange={(e) => setFormSessionDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Time</Label>
                  <Input
                    type="time"
                    value={formSessionTime}
                    onChange={(e) => setFormSessionTime(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button
                className="bg-gradient-primary"
                onClick={handleCreateSession}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Scheduling...' : 'Schedule'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Sessions</CardTitle>
            <CalendarIcon className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{todaysSessions.length}</div>
            <p className="text-xs text-muted-foreground">scheduled</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <Clock className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{thisWeekSessions.length}</div>
            <p className="text-xs text-muted-foreground">total sessions</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hours Booked</CardTitle>
            <Clock className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{Math.round(thisWeekHoursBooked)}</div>
            <p className="text-xs text-muted-foreground">this week</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{completionRate}%</div>
            <p className="text-xs text-muted-foreground">attendance</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-foreground">Calendar</CardTitle>
            <CardDescription>Select a date to view sessions</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => date && setSelectedDate(date)}
              className="rounded-md border"
            />
          </CardContent>
        </Card>

        {/* Sessions List */}
        <Card className="shadow-card lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-foreground">
                  Sessions for {format(selectedDate, 'MMMM dd, yyyy')}
                </CardTitle>
                <CardDescription>
                  {todaysSessions.length} session{todaysSessions.length !== 1 ? 's' : ''} scheduled
                </CardDescription>
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Filter className="w-4 h-4 mr-2" />
                    Filter
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-48">
                  <div className="space-y-2">
                    <Button
                      variant={filterType === 'all' ? 'default' : 'ghost'}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => setFilterType('all')}
                    >
                      All Sessions
                    </Button>
                    <Button
                      variant={filterType === 'personal' ? 'default' : 'ghost'}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => setFilterType('personal')}
                    >
                      Personal
                    </Button>
                    <Button
                      variant={filterType === 'group' ? 'default' : 'ghost'}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => setFilterType('group')}
                    >
                      Group
                    </Button>
                    <Button
                      variant={filterType === 'online' ? 'default' : 'ghost'}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => setFilterType('online')}
                    >
                      Online
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {todaysSessions.length > 0 ? (
                todaysSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={session.memberAvatar} />
                        <AvatarFallback>
                          {session.memberName.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{session.memberName}</p>
                          <Badge variant={getTypeBadgeVariant(session.type)}>
                            <span className="flex items-center gap-1">
                              {getTypeIcon(session.type)}
                              {session.type}
                            </span>
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {session.time} ({session.duration} min)
                          </span>
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {session.location}
                          </span>
                        </div>
                        {session.notes && (
                          <p className="text-xs text-muted-foreground mt-1">{session.notes}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm">
                        Edit
                      </Button>
                      <Button size="sm" className="bg-gradient-primary">
                        Start
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No sessions scheduled for this date
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Sessions */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-foreground">Upcoming Sessions</CardTitle>
          <CardDescription>Next 7 days</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {upcomingSessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between p-3 border border-border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={session.memberAvatar} />
                    <AvatarFallback>
                      {session.memberName.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium text-foreground">{session.memberName}</p>
                    <p className="text-xs text-muted-foreground">
                      {format(session.date, 'MMM dd')} at {session.time}
                    </p>
                  </div>
                </div>
                <Badge variant={getTypeBadgeVariant(session.type)}>
                  {session.type}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TrainerSchedule;
