import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { inviteUser } from '@/services/api/authApi';
import { getUsers, deleteUser as deleteUserApi, updateUser } from '@/services/api/userApi';
import { User } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  MoreVertical,
  Trash2,
  Activity,
  Clock,
  AlertCircle,
  Mail
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const AdminUserManagement: React.FC = () => {
  const { toast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetUser, setDeleteTargetUser] = useState<User | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const ROLE_FILTERS = ['all', 'member', 'trainer', 'nutritionist', 'admin'] as const;
  type RoleFilter = (typeof ROLE_FILTERS)[number];
  const isRoleFilter = (value: string): value is RoleFilter =>
    (ROLE_FILTERS as readonly string[]).includes(value);

  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [isRegistrationOpen, setIsRegistrationOpen] = useState(false);
  const [newUser, setNewUser] = useState({
    fullName: '',
    email: '',
    role: 'member',
    paymentMethod: 'cash',
    amount: 2500,
    membershipDuration: 3,
    trainerId: '',
    nutritionistId: ''
  });

  useEffect(() => {
    const loadUsers = async () => {
      try {
        setIsLoading(true);
        const data = await getUsers();
        setUsers(data);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch users', err);
        setError('Failed to fetch users');
        toast({
          title: 'Error',
          description: 'Unable to load users. Please try again.',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadUsers();
  }, [toast]);

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const stats = {
    totalUsers: users.length,
    members: users.filter(u => u.role === 'member').length,
    trainers: users.filter(u => u.role === 'trainer').length,
    nutritionists: users.filter(u => u.role === 'nutritionist').length,
    admins: users.filter(u => u.role === 'admin').length,
    activeMembers: users.filter(u => u.role === 'member').length,
    activeToday: Math.floor(users.length * 0.7),
    expiringSoon: 0,
    expired: 0,
  };

  const trainers = users.filter(u => u.role === 'trainer');
  const nutritionists = users.filter(u => u.role === 'nutritionist');

  const handleRegisterUser = async () => {
    const role = newUser.role as 'member' | 'trainer' | 'nutritionist' | 'admin';
    const isMember = role === 'member';

    if (!newUser.fullName || !newUser.email) {
      return;
    }

    try {
      const res = await inviteUser({
        full_name: newUser.fullName,
        email: newUser.email,
        role,
      });

      if (!res.success) {
        toast({
          title: 'Registration failed',
          description: res.message || 'Unable to register user. Please try again.',
          variant: 'destructive',
        });
        return;
      }

      if (isMember && res.id && (newUser.trainerId || newUser.nutritionistId)) {
        try {
          const updateData: { trainerId?: string; nutritionistId?: string } = {};
          if (newUser.trainerId) {
            updateData.trainerId = newUser.trainerId;
          }
          if (newUser.nutritionistId) {
            updateData.nutritionistId = newUser.nutritionistId;
          }
          if (Object.keys(updateData).length > 0) {
            await updateUser(String(res.id), updateData);
          }
        } catch (error) {
          console.error('Failed to assign trainer/nutritionist to member', error);
          toast({
            title: 'Assignment failed',
            description: 'Member registered, but trainer/nutritionist assignment failed.',
            variant: 'destructive',
          });
        }
      }

      toast({
        title: `${role.charAt(0).toUpperCase() + role.slice(1)} Registered`,
        description: isMember
          ? `Member invited successfully. They can request an OTP from the signup page when they are ready to activate their account.`
          : `${role.charAt(0).toUpperCase() + role.slice(1)} account created successfully`,
      });

      setNewUser({
        fullName: '',
        email: '',
        role: 'member',
        paymentMethod: 'cash',
        amount: 2500,
        membershipDuration: 3,
        trainerId: '',
        nutritionistId: ''
      });
      setIsRegistrationOpen(false);
      try {
        setIsLoading(true);
        const data = await getUsers();
        setUsers(data);
        setError(null);
      } catch (err) {
        console.error('Failed to refresh users after registration', err);
        setError('Failed to refresh users after registration');
      } finally {
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Failed to register user', error);
      toast({
        title: 'Registration failed',
        description: 'Unable to register user. Please try again.',
        variant: 'destructive',
      });
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'admin':
        return <Badge variant="destructive">{role}</Badge>;
      case 'trainer':
        return <Badge variant="secondary">{role}</Badge>;
      case 'nutritionist':
        return <Badge className="bg-amber-500/20 text-amber-600 dark:text-amber-400">{role}</Badge>;
      default:
        return <Badge variant="outline">{role}</Badge>;
    }
  };

  type StatusBadgeVariant = 'minimal' | 'gradient' | 'pill' | 'glossy';
  type StatusKey = 'active' | 'at_risk' | 'overdue' | 'completed' | 'paused';

  const STATUS_BADGE_VARIANT: StatusBadgeVariant = 'pill';

  const STATUS_META: Record<StatusKey, { label: string; dotClass: string; minimal: string; gradient: string; pill: string; glossy: string }> = {
    active: {
      label: 'Activated',
      dotClass: 'bg-emerald-500',
      minimal:
        'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      gradient:
        'border-transparent bg-gradient-to-r from-emerald-500 to-emerald-400 text-white shadow-sm',
      pill:
        'border-emerald-500/20 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300',
      glossy:
        'border-transparent bg-gradient-to-b from-emerald-500 to-emerald-600 text-white shadow-sm ring-1 ring-emerald-500/30',
    },
    at_risk: {
      label: 'At risk',
      dotClass: 'bg-amber-500',
      minimal:
        'border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300',
      gradient:
        'border-transparent bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm',
      pill:
        'border-amber-500/20 bg-amber-500/12 text-amber-700 dark:text-amber-300',
      glossy:
        'border-transparent bg-gradient-to-b from-amber-500 to-orange-600 text-white shadow-sm ring-1 ring-amber-500/30',
    },
    overdue: {
      label: 'Overdue',
      dotClass: 'bg-rose-500',
      minimal:
        'border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300',
      gradient:
        'border-transparent bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-sm',
      pill:
        'border-rose-500/20 bg-rose-500/12 text-rose-700 dark:text-rose-300',
      glossy:
        'border-transparent bg-gradient-to-b from-rose-500 to-red-600 text-white shadow-sm ring-1 ring-rose-500/30',
    },
    completed: {
      label: 'Completed',
      dotClass: 'bg-sky-500',
      minimal:
        'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300',
      gradient:
        'border-transparent bg-gradient-to-r from-sky-500 to-indigo-500 text-white shadow-sm',
      pill:
        'border-sky-500/20 bg-sky-500/12 text-sky-700 dark:text-sky-300',
      glossy:
        'border-transparent bg-gradient-to-b from-sky-500 to-indigo-600 text-white shadow-sm ring-1 ring-sky-500/30',
    },
    paused: {
      label: 'Paused',
      dotClass: 'bg-slate-400',
      minimal:
        'border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300',
      gradient:
        'border-transparent bg-gradient-to-r from-slate-500 to-slate-600 text-white shadow-sm',
      pill:
        'border-slate-500/20 bg-slate-500/12 text-slate-700 dark:text-slate-300',
      glossy:
        'border-transparent bg-gradient-to-b from-slate-500 to-slate-700 text-white shadow-sm ring-1 ring-slate-500/30',
    },
  };

  const StatusBadge = ({ status, variant = 'minimal' }: { status: StatusKey; variant?: StatusBadgeVariant }) => {
    const meta = STATUS_META[status];

    const base =
      'inline-flex items-center gap-1.5 border px-2.5 py-1 text-[11px] font-semibold leading-none tracking-tight';
    const shape = variant === 'pill' || variant === 'glossy' ? 'rounded-full' : 'rounded-md';
    const variantClasses = meta[variant];

    const dot = cn(
      'h-1.5 w-1.5 rounded-full',
      variant === 'gradient' || variant === 'glossy' ? 'bg-white/80 ring-1 ring-white/30' : meta.dotClass
    );

    const glossyOverlay =
      variant === 'glossy'
        ? 'relative overflow-hidden after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-1/2 after:bg-gradient-to-b after:from-white/35 after:to-transparent'
        : '';

    return (
      <span className={cn(base, shape, variantClasses, glossyOverlay)}>
        <span className={dot} />
        <span>{meta.label}</span>
      </span>
    );
  };

  const handleDeleteUser = async (userId: string) => {
    setDeleteSubmitting(true);
    try {
      await deleteUserApi(userId);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      toast({
        title: 'Delete User',
        description: 'User deleted successfully',
        variant: 'default',
      });
    } catch (error) {
      console.error('Failed to delete user', error);
      toast({
        title: 'Delete failed',
        description: 'Unable to delete user. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const openDeleteDialog = (user: User) => {
    setDeleteTargetUser(user);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTargetUser) return;
    await handleDeleteUser(deleteTargetUser.id);
    setDeleteDialogOpen(false);
    setDeleteTargetUser(null);
  };

  return (
    <div className="space-y-6">
      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          setDeleteDialogOpen(open);
          if (!open) {
            setDeleteTargetUser(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this user? This action is permanent and cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isLoading && <div className="text-sm text-muted-foreground">Loading users...</div>}
      {error && <div className="text-sm text-destructive">{error}</div>}
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Member Registration & Management</h1>
          <p className="text-muted-foreground">Register new gym members and track payments</p>
        </div>
        <Dialog open={isRegistrationOpen} onOpenChange={setIsRegistrationOpen}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-primary">
              <UserPlus className="w-4 h-4 mr-2" />
              Register New Member
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Register New Gym Member</DialogTitle>
              <DialogDescription>Fill in member details and payment information</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name</Label>
                <Input 
                  id="fullName" 
                  placeholder="Enter full name" 
                  value={newUser.fullName}
                  onChange={(e) => setNewUser({...newUser, fullName: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="user@gmail.com" 
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                />
                <p className="text-xs text-muted-foreground">
                  {newUser.role === 'member' 
                    ? 'Account will be register'
                    : 'Account credentials will be sent to this email'}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select 
                  value={newUser.role}
                  onValueChange={(value) => setNewUser({...newUser, role: value})}
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
                    <Label htmlFor="paymentMethod">Payment Method</Label>
                    <Select 
                      value={newUser.paymentMethod}
                      onValueChange={(value: 'cash'  ) => setNewUser({...newUser, paymentMethod: value})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                         
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="amount">Payment Amount (ETB)</Label>
                    <Input 
                      id="amount" 
                      type="number" 
                      value={newUser.amount}
                      onChange={(e) => setNewUser({...newUser, amount: Number(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="duration">Membership Duration (Months)</Label>
                    <Select 
                      value={newUser.membershipDuration.toString()}
                      onValueChange={(value) => setNewUser({...newUser, membershipDuration: Number(value)})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 Month</SelectItem>
                        <SelectItem value="3">3 Months</SelectItem>
                        <SelectItem value="6">6 Months</SelectItem>
                        <SelectItem value="12">12 Months</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="trainer">Assign Trainer (optional)</Label>
                    <Select 
                      value={newUser.trainerId}
                      onValueChange={(value) => setNewUser({ ...newUser, trainerId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select trainer" />
                      </SelectTrigger>
                      <SelectContent>
                        {trainers.map((trainer) => (
                          <SelectItem key={trainer.id} value={trainer.id}>
                            {trainer.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nutritionist">Assign Nutritionist (optional)</Label>
                    <Select 
                      value={newUser.nutritionistId}
                      onValueChange={(value) => setNewUser({ ...newUser, nutritionistId: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select nutritionist" />
                      </SelectTrigger>
                      <SelectContent>
                        {nutritionists.map((nutritionist) => (
                          <SelectItem key={nutritionist.id} value={nutritionist.id}>
                            {nutritionist.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
              <Button 
                className="w-full bg-gradient-primary" 
                onClick={handleRegisterUser}
                disabled={!newUser.fullName || !newUser.email}
              >
                <Mail className="w-4 h-4 mr-2" />
                {newUser.role === 'member' ? 'Register' : 'Create Account'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Members</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.members}</div>
            <p className="text-xs text-muted-foreground">gym members</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trainers</CardTitle>
            <Activity className="h-4 w-4 text-secondary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.trainers}</div>
            <p className="text-xs text-muted-foreground">fitness trainers</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nutritionists</CardTitle>
            <Activity className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.nutritionists}</div>
            <p className="text-xs text-muted-foreground">diet specialists</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Members</CardTitle>
            <Activity className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {stats.activeMembers}
            </div>
            <p className="text-xs text-success">current subscriptions</p>
          </CardContent>
        </Card>

        <Card className="shadow-card border-amber-500/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expiring Soon</CardTitle>
            <AlertCircle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-500">{stats.expiringSoon}</div>
            <p className="text-xs text-muted-foreground">within 7 days</p>
          </CardContent>
        </Card>

        <Card className="shadow-card border-destructive/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expired</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{stats.expired}</div>
            <p className="text-xs text-muted-foreground">need renewal</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filter */}
      <Card className="shadow-card">
        <CardHeader>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select
              value={roleFilter}
              onValueChange={(value) => {
                if (isRoleFilter(value)) {
                  setRoleFilter(value);
                }
              }}
            >
              <SelectTrigger className="w-full md:w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="member">Members</SelectItem>
                <SelectItem value="trainer">Trainers</SelectItem>
                <SelectItem value="nutritionist">Nutritionists</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      {/* Users Table */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle className="text-foreground">All Users</CardTitle>
          <CardDescription>
            Showing {filteredUsers.length} of {users.length} users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">All ({filteredUsers.length})</TabsTrigger>
              <TabsTrigger value="members">Members ({filteredUsers.filter(u => u.role === 'member').length})</TabsTrigger>
              <TabsTrigger value="trainers">Trainers ({filteredUsers.filter(u => u.role === 'trainer').length})</TabsTrigger>
              <TabsTrigger value="admins">Admins ({filteredUsers.filter(u => u.role === 'admin').length})</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="space-y-3 mt-4">
              {filteredUsers.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4 flex-1">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback className="bg-gradient-primary text-white">
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">{user.name}</p>
                        {getRoleBadge(user.role)}
                        {user.role === 'member' && user.isActivated && (
                          <StatusBadge status="active" variant={STATUS_BADGE_VARIANT} />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                      <div className="flex items-center gap-4 mt-1 flex-wrap">
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Joined {user.joinDate ? new Date(user.joinDate).toLocaleDateString() : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem 
                        className="text-destructive"
                        onClick={() => openDeleteDialog(user)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete User
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="members" className="space-y-3 mt-4">
              {filteredUsers.filter(u => u.role === 'member').map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback className="bg-gradient-primary text-white">
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">{user.name}</p>
                        {user.isActivated && <StatusBadge status="active" variant={STATUS_BADGE_VARIANT} />}
                      </div>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">View Details</Button>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="trainers" className="space-y-3 mt-4">
              {filteredUsers.filter(u => u.role === 'trainer').map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback className="bg-gradient-primary text-white">
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-foreground">{user.name}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {users.filter(u => u.trainerId === user.id).length} assigned members
                      </p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm">View Details</Button>
                </div>
              ))}
            </TabsContent>

            <TabsContent value="admins" className="space-y-3 mt-4">
              {filteredUsers.filter(u => u.role === 'admin').map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarImage src={user.avatar} />
                      <AvatarFallback className="bg-gradient-primary text-white">
                        {user.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-foreground">{user.name}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <Badge variant="destructive">Administrator</Badge>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminUserManagement;
