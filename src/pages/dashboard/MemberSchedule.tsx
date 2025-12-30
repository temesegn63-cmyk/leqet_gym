import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { Calendar, Clock, User as UserIcon } from 'lucide-react';
import { fetchMemberSchedule, MemberScheduleRow, FetchTrainerScheduleParams } from '@/services/api/appBackend';

interface Session {
  id: number;
  trainerName: string;
  sessionType: string;
  date: string;
  time: string;
  status: string;
}

const MemberSchedule: React.FC = () => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!user) {
        setSessions([]);
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        const params: FetchTrainerScheduleParams = {};
        const rows: MemberScheduleRow[] = await fetchMemberSchedule(user.id, params);

        const mapped: Session[] = (rows || []).map((row) => {
          const dateRaw = row.session_date ?? '';
          const timeRaw = row.session_time ?? '';
          const dateStr = typeof dateRaw === 'string' ? dateRaw : String(dateRaw);
          const timeStr = typeof timeRaw === 'string' ? timeRaw.slice(0, 5) : '';

          return {
            id: Number(row.id),
            trainerName: row.trainer_name || 'Trainer',
            sessionType: row.session_type || 'personal',
            date: dateStr,
            time: timeStr,
            status: row.status || 'scheduled',
          };
        });

        setSessions(mapped);
      } catch (err) {
        console.error('Failed to load member schedule', err);
        setError('Failed to load your schedule');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, [user]);

  const getStatusBadgeVariant = (status: string): 'default' | 'secondary' | 'outline' | 'destructive' => {
    const normalized = status.toLowerCase();
    if (normalized === 'completed') return 'secondary';
    if (normalized === 'cancelled') return 'destructive';
    return 'outline';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">My Training Schedule</h1>
        <p className="text-muted-foreground">View your upcoming sessions with your trainer.</p>
      </div>

      {error && (
        <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="p-4 rounded-lg border border-border bg-muted/30 text-muted-foreground">
          Loading schedule...
        </div>
      ) : (
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="text-foreground">Upcoming Sessions</CardTitle>
            <CardDescription>All scheduled sessions for your account</CardDescription>
          </CardHeader>
          <CardContent>
            {sessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">You have no scheduled sessions yet.</p>
            ) : (
              <div className="space-y-3">
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span className="font-medium text-foreground">
                          {session.date} at {session.time}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <UserIcon className="w-3 h-3" />
                          With {session.trainerName}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {session.sessionType === 'group'
                            ? 'Group session'
                            : session.sessionType === 'online'
                            ? 'Online session'
                            : 'Personal session'}
                        </span>
                      </div>
                    </div>
                    <Badge variant={getStatusBadgeVariant(session.status)} className="capitalize">
                      {session.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default MemberSchedule;
