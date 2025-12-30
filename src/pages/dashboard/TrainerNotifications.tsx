import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Bell,
  CheckCircle2,
  Clock,
  AlertCircle,
  User,
  Calendar,
  TrendingUp,
  MessageSquare,
  Archive,
  Trash2
} from 'lucide-react';
import { fetchNotifications, markNotificationRead, type BackendNotification } from '@/services/api/appBackend';

interface Notification {
  id: string;
  backendId: number;
  type: 'session' | 'progress' | 'message' | 'alert' | 'achievement';
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  avatar?: string;
  memberName?: string;
  priority?: 'low' | 'medium' | 'high';
}

const TrainerNotifications: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const mapBackendToNotification = (row: BackendNotification): Notification => {
    const created = new Date(row.createdAt);
    const timestamp = created.toLocaleString();
    const message = row.message || '';
    return {
      id: String(row.id),
      backendId: row.id,
      type: 'message',
      title: 'New message',
      description: message,
      timestamp,
      read: row.isRead,
    };
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchNotifications(false);
        if (cancelled) return;
        setNotifications(data.map(mapBackendToNotification));
      } catch (error) {
        console.error('Failed to load notifications', error);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'session':
        return <Calendar className="w-4 h-4" />;
      case 'progress':
        return <TrendingUp className="w-4 h-4" />;
      case 'message':
        return <MessageSquare className="w-4 h-4" />;
      case 'alert':
        return <AlertCircle className="w-4 h-4" />;
      case 'achievement':
        return <CheckCircle2 className="w-4 h-4" />;
      default:
        return <Bell className="w-4 h-4" />;
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case 'session':
        return 'text-primary';
      case 'progress':
        return 'text-success';
      case 'message':
        return 'text-accent';
      case 'alert':
        return 'text-destructive';
      case 'achievement':
        return 'text-secondary';
      default:
        return 'text-muted-foreground';
    }
  };

  const getPriorityBadge = (priority?: string) => {
    switch (priority) {
      case 'high':
        return <Badge variant="destructive" className="text-xs">High</Badge>;
      case 'medium':
        return <Badge variant="secondary" className="text-xs">Medium</Badge>;
      case 'low':
        return <Badge variant="outline" className="text-xs">Low</Badge>;
      default:
        return null;
    }
  };

  const markAsRead = async (id: string) => {
    const notif = notifications.find((n) => n.id === id);
    if (!notif || notif.read) return;
    try {
      await markNotificationRead(notif.backendId);
      setNotifications(prev =>
        prev.map(n => n.id === id ? { ...n, read: true } : n)
      );
    } catch (error) {
      console.error('Failed to mark notification as read', error);
    }
  };

  const markAllAsRead = async () => {
    const unread = notifications.filter(n => !n.read);
    try {
      await Promise.all(unread.map((n) => markNotificationRead(n.backendId)));
      setNotifications(prev => prev.map(notif => ({ ...notif, read: true })));
    } catch (error) {
      console.error('Failed to mark all notifications as read', error);
    }
  };

  const deleteNotification = (id: string) => {
    setNotifications(prev => prev.filter(notif => notif.id !== id));
  };

  const unreadCount = notifications.filter(n => !n.read).length;
  const unreadNotifications = notifications.filter(n => !n.read);
  const readNotifications = notifications.filter(n => n.read);

  const NotificationItem = ({ notification }: { notification: Notification }) => (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
        notification.read 
          ? 'bg-background border-border' 
          : 'bg-primary/5 border-primary/20'
      }`}
    >
      <div className={`p-2 rounded-full bg-muted ${getIconColor(notification.type)}`}>
        {getIcon(notification.type)}
      </div>
      
      {notification.avatar && (
        <Avatar className="h-10 w-10">
          <AvatarImage src={notification.avatar} />
          <AvatarFallback>
            {notification.memberName?.split(' ').map(n => n[0]).join('')}
          </AvatarFallback>
        </Avatar>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="text-sm font-medium text-foreground">{notification.title}</h4>
          {getPriorityBadge(notification.priority)}
          {!notification.read && (
            <div className="w-2 h-2 bg-primary rounded-full" />
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-1">{notification.description}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {notification.timestamp}
          </span>
        </div>
      </div>

      <div className="flex gap-1">
        {!notification.read && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => markAsRead(notification.id)}
          >
            <CheckCircle2 className="w-4 h-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => deleteNotification(notification.id)}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Notifications</h1>
          <p className="text-muted-foreground">
            Stay updated with your members' progress and activities
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={markAllAsRead}>
            <CheckCircle2 className="w-4 h-4 mr-2" />
            Mark All Read
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unread</CardTitle>
            <Bell className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{unreadCount}</div>
            <p className="text-xs text-muted-foreground">notifications</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">High Priority</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {notifications.filter(n => n.priority === 'high' && !n.read).length}
            </div>
            <p className="text-xs text-muted-foreground">need attention</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today</CardTitle>
            <Calendar className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {notifications.filter(n => 
                n.timestamp.includes('minutes') || n.timestamp.includes('hour')
              ).length}
            </div>
            <p className="text-xs text-muted-foreground">notifications</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages</CardTitle>
            <MessageSquare className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {notifications.filter(n => n.type === 'message' && !n.read).length}
            </div>
            <p className="text-xs text-muted-foreground">unread messages</p>
          </CardContent>
        </Card>
      </div>

      {/* Notifications List */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-foreground">All Notifications</CardTitle>
          <CardDescription>View and manage your notifications</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all" className="space-y-4">
            <TabsList>
              <TabsTrigger value="all">
                All ({notifications.length})
              </TabsTrigger>
              <TabsTrigger value="unread">
                Unread ({unreadCount})
              </TabsTrigger>
              <TabsTrigger value="read">
                Read ({readNotifications.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-3">
                  {notifications.length > 0 ? (
                    notifications.map((notification) => (
                      <NotificationItem key={notification.id} notification={notification} />
                    ))
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Bell className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>No notifications</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="unread">
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-3">
                  {unreadNotifications.length > 0 ? (
                    unreadNotifications.map((notification) => (
                      <NotificationItem key={notification.id} notification={notification} />
                    ))
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <CheckCircle2 className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>All caught up!</p>
                      <p className="text-sm">No unread notifications</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="read">
              <ScrollArea className="h-[600px] pr-4">
                <div className="space-y-3">
                  {readNotifications.length > 0 ? (
                    readNotifications.map((notification) => (
                      <NotificationItem key={notification.id} notification={notification} />
                    ))
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Archive className="w-12 h-12 mx-auto mb-3 opacity-20" />
                      <p>No read notifications</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default TrainerNotifications;
