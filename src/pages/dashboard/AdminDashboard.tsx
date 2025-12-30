import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { inviteUser } from '@/services/api/authApi';
import { getUsers, updateUser } from '@/services/api/userApi';
import { getSystemStats, triggerBackup, runHealthCheck, clearCacheAndLogs } from '@/services/api/adminSystemApi';
import { User } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Users, 
  UserPlus, 
  Search, 
  Filter, 
  MoreVertical, 
  Edit, 
  Trash2, 
  UserCheck, 
  Dumbbell, 
  Shield, 
  Utensils,
  HeartPulse,
  BarChart3,
  Database,
  Settings
} from 'lucide-react';

interface NewUser {
  name: string;
  email: string;
  role: 'member' | 'trainer' | 'nutritionist' | 'admin';
  assignedTrainer?: string;
  assignedNutritionist?: string;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newUser, setNewUser] = useState<NewUser>({ name: '', email: '', role: 'member' });
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [inviteError, setInviteError] = useState<string>('');
  const [inviteSuccess, setInviteSuccess] = useState<string>('');
  const [systemStats, setSystemStats] = useState<{ dbSizeBytes: number; uptimeSeconds: number; lastBackup: string | null } | null>(null);
  const [maintenanceMessage, setMaintenanceMessage] = useState<React.ReactNode | null>(null);
  const [maintenanceError, setMaintenanceError] = useState<string | null>(null);
  const [maintenanceLoading, setMaintenanceLoading] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        const [userData, statsData] = await Promise.all([
          getUsers(),
          getSystemStats().catch(() => null),
        ]);
        setUsers(userData);
        if (statsData) {
          setSystemStats(statsData);
        }
        setError(null);
      } catch (err) {
        console.error('Failed to fetch users', err);
        setError('Failed to load users');
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const getUserStats = () => {
    const members = users.filter(u => u.role === 'member').length;
    const trainers = users.filter(u => u.role === 'trainer').length;
    const nutritionists = users.filter(u => u.role === 'nutritionist').length;
    const admins = users.filter(u => u.role === 'admin').length;
    
    return { members, trainers, nutritionists, admins, total: users.length };
  };

  const stats = getUserStats();

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 MB';
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) return `${mb.toFixed(1)} MB`;
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  };

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    if (days > 0) return `${days}d ${hours}h`;
    const mins = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${mins}m`;
  };

  const addUser = async () => {
    if (newUser.name && newUser.email) {
      setInviteError('');
      setInviteSuccess('');
      const res = await inviteUser({
        full_name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      });

      if (!res.success) {
        setInviteError(res.message || 'Failed to create user. Please try again.');
        return;
      }

      const refreshed = await getUsers();
      setUsers(refreshed);

      // Apply optional trainer/nutritionist assignments for new members
      if (
        newUser.role === 'member' &&
        (newUser.assignedTrainer || newUser.assignedNutritionist)
      ) {
        const created = refreshed.find(
          (u) => u.email.toLowerCase() === newUser.email.toLowerCase()
        );

        if (created) {
          try {
            const updated = await updateUser(created.id, {
              trainerId: newUser.assignedTrainer ?? null,
              nutritionistId: newUser.assignedNutritionist ?? null,
            });

            setUsers((prev) =>
              prev.map((u) => (u.id === updated.id ? updated : u))
            );
          } catch (err) {
            console.error('Failed to apply assignments for new member', err);
          }
        }
      }

      // Reset the form and surface success in UI
      setNewUser({ name: '', email: '', role: 'member' });
      setIsAddingUser(false);
      setInviteSuccess('User created successfully! An OTP has been sent to the user\'s email.');
    }
  };

  const updateUserRole = (userId: string, newRole: 'member' | 'trainer' | 'nutritionist' | 'admin') => {
    setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    updateUser(userId, { role: newRole }).catch(err => {
      console.error('Failed to update role', err);
      setUsers(prev => prev); // revert not tracked; could refetch
    });
  };

  const assignTrainer = async (memberId: string, trainerId: string) => {
    setUsers(prev => prev.map(u => u.id === memberId ? { ...u, trainerId } : u));
    try {
      await updateUser(memberId, { trainerId });
    } catch (err) {
      console.error('Failed to assign trainer', err);
      setUsers(prev => prev); // simple revert
    }
  };

  const assignNutritionist = async (memberId: string, nutritionistId: string) => {
    setUsers(prev => prev.map(u => u.id === memberId ? { ...u, nutritionistId } : u));
    try {
      await updateUser(memberId, { nutritionistId });
    } catch (err) {
      console.error('Failed to assign nutritionist', err);
      setUsers(prev => prev);
    }
  };

  const handleBackup = async () => {
    setMaintenanceError(null);
    setMaintenanceMessage(null);
    setMaintenanceLoading(true);
    try {
      const res = await triggerBackup();
      if (res.publicLink) {
        setMaintenanceMessage(
          <span>
            {res.message}.{' '}
            <a href={res.publicLink} target="_blank" rel="noopener noreferrer" className="underline text-primary">
              View on pCloud
            </a>
          </span>
        );
      } else {
        setMaintenanceMessage(res.message || 'Backup task recorded');
      }
      // refresh stats to update last backup time
      const statsData = await getSystemStats().catch(() => null);
      if (statsData) setSystemStats(statsData);
    } catch (err) {
      setMaintenanceError('Failed to create database backup');
    } finally {
      setMaintenanceLoading(false);
    }
  };

  const handleHealthCheck = async () => {
    setMaintenanceError(null);
    setMaintenanceMessage(null);
    setMaintenanceLoading(true);
    try {
      const res = await runHealthCheck();
      setMaintenanceMessage(res.message || 'System health check completed');
    } catch (err) {
      setMaintenanceError('System health check failed');
    } finally {
      setMaintenanceLoading(false);
    }
  };

  const handleClearCache = async () => {
    setMaintenanceError(null);
    setMaintenanceMessage(null);
    setMaintenanceLoading(true);
    try {
      const res = await clearCacheAndLogs();
      const cleared = res.cleared ?? 0;
      setMaintenanceMessage(`Cleared ${cleared} old log entries`);
    } catch (err) {
      setMaintenanceError('Failed to clear cache and logs');
    } finally {
      setMaintenanceLoading(false);
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge className="bg-red-500/10 text-red-600 border-red-200">Admin</Badge>;
      case 'trainer':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-200">Trainer</Badge>;
      case 'nutritionist':
        return <Badge className="bg-amber-500/10 text-amber-600 border-amber-200">Nutritionist</Badge>;
      case 'member':
        return <Badge className="bg-green-500/10 text-green-600 border-green-200">Member</Badge>;
      default:
        return <Badge variant="secondary">{role}</Badge>;
    }
  };


  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage users, system settings, and monitor activity</p>
        </div>
        <div className="flex items-center gap-4">
          <Dialog open={isAddingUser} onOpenChange={setIsAddingUser}>
            <DialogTrigger asChild>
               
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                <DialogDescription>Create a new member, trainer, nutritionist, or admin account</DialogDescription>
              </DialogHeader>
              {inviteError && (
                <div className="bg-red-100 text-red-700 p-3 rounded mb-3">
                  {inviteError}
                </div>
              )}
              {inviteSuccess && (
                <div className="bg-green-100 text-green-700 p-3 rounded mb-3">
                  {inviteSuccess}
                </div>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name</Label>
                  <Input
                    id="name"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    placeholder="Enter full name"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    placeholder="Enter email address"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={newUser.role}
                    onValueChange={(value: 'member' | 'trainer' | 'nutritionist' | 'admin') =>
                      setNewUser({ ...newUser, role: value, assignedTrainer: undefined, assignedNutritionist: undefined })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member</SelectItem>
                      <SelectItem value="trainer">Trainer</SelectItem>
                      <SelectItem value="nutritionist">Nutritionist</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {newUser.role === 'member' && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="trainer">Assign Trainer (Optional)</Label>
                      <Select
                        value={newUser.assignedTrainer}
                        onValueChange={(value) => setNewUser({ ...newUser, assignedTrainer: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a trainer" />
                        </SelectTrigger>
                        <SelectContent>
                          {users
                            .filter((u) => u.role === 'trainer')
                            .map((trainer) => (
                              <SelectItem key={`trainer-${trainer.id}`} value={trainer.id}>
                                {trainer.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="nutritionist">Assign Nutritionist (Optional)</Label>
                      <Select
                        value={newUser.assignedNutritionist}
                        onValueChange={(value) => setNewUser({ ...newUser, assignedNutritionist: value })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select a nutritionist" />
                        </SelectTrigger>
                        <SelectContent>
                          {users
                            .filter((u) => u.role === 'nutritionist')
                            .map((nutritionist) => (
                              <SelectItem key={`nutritionist-${nutritionist.id}`} value={nutritionist.id}>
                                {nutritionist.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsAddingUser(false)}>
                    Cancel
                  </Button>
                   
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Users</p>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Members</p>
                <p className="text-2xl font-bold text-foreground">{stats.members}</p>
              </div>
              <UserCheck className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Trainers</p>
                <p className="text-2xl font-bold text-foreground">{stats.trainers}</p>
              </div>
              <Dumbbell className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Nutritionists</p>
                <p className="text-2xl font-bold text-foreground">{stats.nutritionists || 0}</p>
              </div>
              <Utensils className="h-8 w-8 text-amber-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Admins</p>
                <p className="text-2xl font-bold text-foreground">{stats.admins}</p>
              </div>
              <Shield className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="assignments">Trainer Assignments</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
        </TabsList>

        {/* User Management */}
        <TabsContent value="users" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>All Users</CardTitle>
              <CardDescription>Manage user accounts and roles</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Join Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={user.avatar} />
                            <AvatarFallback className="bg-gradient-primary text-white">
                              {user.name.split(' ').map((n: string) => n[0]).join('')}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{user.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>{user.email}</TableCell>
                      <TableCell>{getRoleBadge(user.role)}</TableCell>
                      <TableCell>{new Date(user.joinDate).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          onValueChange={(value: 'member' | 'trainer' | 'nutritionist' | 'admin') => updateUserRole(user.id, value)}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="member">Member</SelectItem>
                            <SelectItem value="trainer">Trainer</SelectItem>
                            <SelectItem value="nutritionist">Nutritionist</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Trainer Assignments */}
        <TabsContent value="assignments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Trainer-Member Assignments</CardTitle>
              <CardDescription>Assign trainers to members and manage relationships</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-medium mb-3">Available Trainers</h3>
                  <div className="space-y-2">
                    {users
                      .filter((u) => u.role === 'trainer')
                      .map((trainer) => (
                        <Card key={trainer.id} className="p-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={trainer.avatar} />
                              <AvatarFallback className="bg-gradient-primary text-white">
                                {trainer.name.split(' ').map((n: string) => n[0]).join('')}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <p className="font-medium">{trainer.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {users.filter((u) => u.role === 'member' && String(u.trainerId) === String(trainer.id)).length} assigned members
                              </p>
                            </div>
                            {getRoleBadge(trainer.role)}
                          </div>
                        </Card>
                      ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-medium mb-3">Unassigned Members</h3>
                  <div className="space-y-2">
                    {users
                      .filter((u) => u.role === 'member' && !u.trainerId)
                      .slice(0, 8)
                      .map((member) => (
                        <Card key={member.id} className="p-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={member.avatar} />
                                <AvatarFallback className="bg-gradient-primary text-white">
                                  {member.name
                                    .split(' ')
                                    .map((n: string) => n[0])
                                    .join('')}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="font-medium">{member.name}</p>
                                <p className="text-sm text-muted-foreground">{member.email}</p>
                              </div>
                            </div>
                            <Select onValueChange={(trainerId) => assignTrainer(member.id, trainerId)}>
                              <SelectTrigger className="w-32">
                                <SelectValue placeholder="Assign" />
                              </SelectTrigger>
                              <SelectContent>
                                {users
                                  .filter((u) => u.role === 'trainer')
                                  .map((trainer) => (
                                    <SelectItem key={trainer.id} value={trainer.id}>
                                      {trainer.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </Card>
                      ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Maintenance */}
        <TabsContent value="maintenance" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Database Management
                </CardTitle>
                <CardDescription>Backup and maintenance operations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {maintenanceError && (
                  <div className="bg-red-100 text-red-700 p-2 rounded text-sm">
                    {maintenanceError}
                  </div>
                )}
                {maintenanceMessage && (
                  <div className="bg-emerald-100 text-emerald-700 p-2 rounded text-sm">
                    {maintenanceMessage}
                  </div>
                )}
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={handleBackup}
                  disabled={maintenanceLoading}
                >
                  <Database className="h-4 w-4 mr-2" />
                  Create Database Backup
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={handleHealthCheck}
                  disabled={maintenanceLoading}
                >
                  <HeartPulse className="h-4 w-4 mr-2" />
                  Run System Health Check
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  onClick={handleClearCache}
                  disabled={maintenanceLoading}
                >
                  <Settings className="h-4 w-4 mr-2" />
                  Clear Cache & Logs
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  System Statistics
                </CardTitle>
                <CardDescription>System performance metrics</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm">Database Size</span>
                  <span className="font-medium">
                    {systemStats ? formatBytes(systemStats.dbSizeBytes) : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Server Uptime</span>
                  <span className="font-medium">
                    {systemStats ? formatUptime(systemStats.uptimeSeconds) : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Last Backup</span>
                  <span className="font-medium">
                    {systemStats?.lastBackup
                      ? new Date(systemStats.lastBackup).toLocaleString()
                      : 'No backups yet'}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};