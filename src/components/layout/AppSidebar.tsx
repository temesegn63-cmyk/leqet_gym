import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  User,
  Activity,
  UtensilsCrossed,
  TrendingUp,
  Bell,
  Settings,
  Users,
  UserCheck,
  Shield,
  LogOut,
  Dumbbell,
  Calendar,
  BarChart3
} from 'lucide-react';

export function AppSidebar() {
  const { user, logout } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';
  const location = useLocation();

  const getNavItems = () => {
    switch (user?.role) {
      case 'member':
        return [
          { title: 'Profile', url: '/dashboard/profile', icon: User },
          { title: 'Diet Plan', url: '/dashboard/diet', icon: UtensilsCrossed },
          { title: 'Workout Plan', url: '/dashboard/workout-plan', icon: Calendar },
          { title: 'Meal Log', url: '/dashboard/meals', icon: Activity },
          { title: 'Workout Log', url: '/dashboard/workouts', icon: Dumbbell },
          { title: 'Progress', url: '/dashboard/progress', icon: TrendingUp },
          { title: 'Notifications', url: '/dashboard/notifications', icon: Bell },
        ];
      case 'trainer':
        return [
          { title: 'My Members', url: '/dashboard', icon: Users },
          { title: 'Schedule', url: '/dashboard/schedule', icon: Calendar },
          { title: 'Analytics', url: '/dashboard/analytics', icon: BarChart3 },
          { title: 'Notifications', url: '/dashboard/notifications', icon: Bell },
        ];
      case 'nutritionist':
        return [
          { title: 'My Clients', url: '/dashboard', icon: Users },
          { title: 'Meal Plans', url: '/dashboard/diet', icon: UtensilsCrossed },
          { title: 'Client Logs', url: '/dashboard/meals', icon: Activity },
          { title: 'Analytics', url: '/dashboard/analytics', icon: BarChart3 },
          { title: 'Notifications', url: '/dashboard/notifications', icon: Bell },
        ];
      case 'admin':
        return [
          { title: 'Dashboard', url: '/dashboard', icon: Shield },
          { title: 'User Management', url: '/dashboard/users', icon: Users },
          { title: 'Assignments', url: '/dashboard/assignments', icon: UserCheck },
          { title: 'System Monitor', url: '/dashboard/monitor', icon: Settings },
          { title: 'Notifications', url: '/dashboard/notifications', icon: Bell },
        ];
      default:
        return [];
    }
  };

  const navItems = getNavItems();
  const isActive = (path: string) => location.pathname === path;

  return (
    <Sidebar className={collapsed ? "w-14" : "w-64"} collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-3 py-4">
          <div className="inline-flex items-center justify-center w-8 h-8 bg-gradient-primary rounded-lg">
            <Dumbbell className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div>
              <h2 className="text-lg font-bold text-sidebar-foreground">Leqet Gym</h2>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            {user?.role === 'member' && 'My Fitness'}
            {user?.role === 'trainer' && 'Training Tools'}
            {user?.role === 'nutritionist' && 'Nutrition Tools'}
            {user?.role === 'admin' && 'Administration'}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)}>
                    <NavLink
                      to={item.url}
                      className="flex items-center gap-3"
                    >
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <div className="p-3">
          {!collapsed && user && (
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.avatar} />
                <AvatarFallback className="bg-gradient-primary text-white">
                  {user.name.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-sidebar-foreground truncate">
                  {user.name}
                </div>
                <div className="text-xs text-sidebar-foreground/60 capitalize">
                  {user.role}
                </div>
              </div>
            </div>
          )}
          <Button
            variant="outline"
            size={collapsed ? "icon" : "sm"}
            className="w-full"
            onClick={logout}
          >
            <LogOut className="h-4 w-4" />
            {!collapsed && <span className="ml-2">Logout</span>}
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}