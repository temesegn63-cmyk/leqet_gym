import React, { useState, useEffect } from 'react';
import { User } from '@/types';
import { getUsers, updateUser } from '@/services/api/userApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
 
import { useToast } from '@/hooks/use-toast';
import {
  Users,
  UserCheck,
  ArrowRight,
  Plus,
  Trash2,
  Edit,
  TrendingUp,
  Apple,
  Dumbbell,
  Utensils,
  UserPlus
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type StaffAssignment = {
  staff: User;
  members: User[];
  memberCount: number;
};

const AdminAssignments: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'trainer' | 'nutritionist'>('trainer');
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch users on component mount
  useEffect(() => {
    const fetchUsersData = async () => {
      try {
        setIsLoading(true);
        const data = await getUsers();
        setUsers(data);
      } catch (err) {
        setError('Failed to fetch users');
        toast({
          title: 'Error',
          description: 'Failed to load user data',
          variant: 'destructive',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchUsersData();
  }, [toast]);

  // Filter users by role
  const trainers = users.filter(u => u.role === 'trainer');
  const nutritionists = users.filter(u => u.role === 'nutritionist');
  const members = users.filter(u => u.role === 'member');
  const unassignedTrainerMembers = members.filter(m => !m.trainerId);
  const unassignedNutritionistMembers = members.filter(m => !m.nutritionistId);

  const trainerAssignments: StaffAssignment[] = trainers.map(trainer => {
    const trainerMembers = members.filter(m => m.trainerId === trainer.id);
    return {
      staff: trainer,
      members: trainerMembers,
      memberCount: trainerMembers.length
    };
  });

  const nutritionistAssignments: StaffAssignment[] = nutritionists.map(nutritionist => {
    const nutritionistMembers = members.filter(m => m.nutritionistId === nutritionist.id);
    return {
      staff: nutritionist,
      members: nutritionistMembers,
      memberCount: nutritionistMembers.length
    };
  });

  const [isAssignDialogOpen, setIsAssignDialogOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [selectedStaffId, setSelectedStaffId] = useState('');
  const [assignmentType, setAssignmentType] = useState<'trainer' | 'nutritionist'>('trainer');

  useEffect(() => {
    setSelectedMemberId('');
    setSelectedStaffId('');
  }, [assignmentType]);

  const handleAssignMember = async () => {
    if (!selectedMemberId || !selectedStaffId) {
      toast({
        title: "Error",
        description: "Please select both member and staff",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      const member = users.find(u => String(u.id) === selectedMemberId);
      if (!member) throw new Error('Member not found');

      // Update the member with the new assignment
      const updateData = {
        ...member,
        ...(assignmentType === 'trainer' 
          ? { trainerId: selectedStaffId }
          : { nutritionistId: selectedStaffId })
      };

      await updateUser(selectedMemberId, updateData);

      // Update local state
      setUsers(prevUsers => 
        prevUsers.map(u => 
          String(u.id) === selectedMemberId ? { ...u, ...updateData } : u
        )
      );

      toast({
        title: "Assignment Successful",
        description: `Member has been assigned to ${assignmentType}`,
      });
      
      // Reset form and close dialog
      setSelectedMemberId('');
      setSelectedStaffId('');
      setIsAssignDialogOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to assign ${assignmentType}: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnassignMember = async (memberId: string, type: 'trainer' | 'nutritionist') => {
    try {
      setIsLoading(true);
      const member = users.find(u => u.id === memberId);
      if (!member) throw new Error('Member not found');

      // Update the member to remove the assignment
      const updateData = {
        ...member,
        ...(type === 'trainer' ? { trainerId: null } : { nutritionistId: null })
      };

      await updateUser(memberId, updateData);

      // Update local state
      setUsers(prevUsers => 
        prevUsers.map(u => 
          u.id === memberId ? { ...u, ...updateData } : u
        )
      );

      toast({
        title: "Unassigned",
        description: `Member has been unassigned from ${type}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to unassign ${type}: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderStaffAssignments = (assignments: StaffAssignment[], type: 'trainer' | 'nutritionist') => (
    <div className="space-y-4">
      {assignments.map((assignment) => {
        const person = assignment.staff;
        const assignedMembers = assignment.members;
        return (
          <Card key={person.id} className="shadow-card">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={person.avatar} />
                    <AvatarFallback className="bg-gradient-primary text-white">
                      {person.name.split(' ').map((n: string) => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <CardTitle className="text-foreground">{person.name}</CardTitle>
                    <CardDescription>
                      {assignedMembers.length} assigned member{assignedMembers.length !== 1 ? 's' : ''}
                    </CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={assignedMembers.length > 5 ? 'destructive' : 'secondary'}>
                    {assignedMembers.length > 5 ? 'High Load' : 'Capacity OK'}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {assignedMembers.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {assignedMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg group hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={member.avatar} />
                          <AvatarFallback>
                            {member.name.split(' ').map((n: string) => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-foreground">{member.name}</p>
                          <p className="text-xs text-muted-foreground">
                            Since {new Date(member.joinDate).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUnassignMember(member.id, type)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
                  <p>No members assigned yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Staff Assignments</h1>
          <p className="text-muted-foreground">Manage member assignments to trainers and nutritionists</p>
        </div>
      </div>

      {/* Assignment Dialog */}
      <Dialog open={isAssignDialogOpen} onOpenChange={setIsAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Member to {assignmentType === 'trainer' ? 'Trainer' : 'Nutritionist'}</DialogTitle>
            <DialogDescription>Select a member and {assignmentType} to create assignment</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Assignment Type</Label>
              <Select 
                value={assignmentType}
                onValueChange={(value: 'trainer' | 'nutritionist') => setAssignmentType(value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trainer">Trainer</SelectItem>
                  <SelectItem value="nutritionist">Nutritionist</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Member</Label>
              <Select 
                value={selectedMemberId}
                onValueChange={setSelectedMemberId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select member" />
                </SelectTrigger>
                <SelectContent>
                  {(
                    assignmentType === 'trainer'
                      ? unassignedTrainerMembers
                      : unassignedNutritionistMembers
                  ).length === 0 ? (
                    <SelectItem value="__no_members" disabled>
                      No unassigned members available
                    </SelectItem>
                  ) : (
                    (assignmentType === 'trainer'
                      ? unassignedTrainerMembers
                      : unassignedNutritionistMembers
                    ).map((member) => (
                      <SelectItem key={member.id} value={String(member.id)}>
                        {member.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{assignmentType === 'trainer' ? 'Trainer' : 'Nutritionist'}</Label>
              <Select 
                value={selectedStaffId}
                onValueChange={setSelectedStaffId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${assignmentType}`} />
                </SelectTrigger>
                <SelectContent>
                  {(assignmentType === 'trainer' ? trainers : nutritionists).map(staff => (
                    <SelectItem key={staff.id} value={staff.id}>
                      {staff.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button 
                variant="outline" 
                onClick={() => setIsAssignDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                className="bg-gradient-primary" 
                onClick={handleAssignMember}
                disabled={!selectedMemberId || !selectedStaffId}
              >
                Assign {assignmentType === 'trainer' ? 'Trainer' : 'Nutritionist'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Trainers</CardTitle>
            <Dumbbell className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{trainers.length}</div>
            <p className="text-xs text-muted-foreground">active trainers</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Nutritionists</CardTitle>
            <Utensils className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{nutritionists.length}</div>
            <p className="text-xs text-muted-foreground">active nutritionists</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Trainer Assigned</CardTitle>
            <UserCheck className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {members.filter(m => m.trainerId).length}
            </div>
            <p className="text-xs text-muted-foreground">with trainers</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nutritionist Assigned</CardTitle>
            <UserCheck className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {members.filter(m => m.nutritionistId).length}
            </div>
            <p className="text-xs text-muted-foreground">with nutritionists</p>
          </CardContent>
        </Card>

        <Card className="shadow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unassigned Members</CardTitle>
            <Users className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {members.filter(m => !m.trainerId || !m.nutritionistId).length}
            </div>
            <p className="text-xs text-destructive">need assignment</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs for Trainer/Nutritionist */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'trainer' | 'nutritionist')}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger 
            value="trainer" 
            className="flex items-center gap-2"
            onClick={() => setAssignmentType('trainer')}
          >
            <Dumbbell className="w-4 h-4" />
            Trainer Assignments
            <Badge variant="secondary" className="ml-2">
              {trainers.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="nutritionist" 
            className="flex items-center gap-2"
            onClick={() => setAssignmentType('nutritionist')}
          >
            <Utensils className="w-4 h-4" />
            Nutritionist Assignments
            <Badge variant="secondary" className="ml-2">
              {nutritionists.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="trainer" className="mt-6 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Trainer Assignments</h2>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setAssignmentType('trainer');
                setIsAssignDialogOpen(true);
              }}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Assign Member
            </Button>
          </div>
          {/* Unassigned to Trainer */}
          {unassignedTrainerMembers.length > 0 && (
            <Card className="shadow-card border-destructive/50">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Users className="w-5 h-5 text-destructive" />
                  Unassigned Members (Trainer)
                </CardTitle>
                <CardDescription>
                  {unassignedTrainerMembers.length} member{unassignedTrainerMembers.length !== 1 ? 's' : ''} need trainer assignment
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {unassignedTrainerMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={member.avatar} />
                          <AvatarFallback className="bg-gradient-primary text-white">
                            {member.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-foreground">{member.name}</p>
                          <p className="text-xs text-muted-foreground">No trainer</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {renderStaffAssignments(trainerAssignments, 'trainer')}
        </TabsContent>

        <TabsContent value="nutritionist" className="mt-6 space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Nutritionist Assignments</h2>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setAssignmentType('nutritionist');
                setIsAssignDialogOpen(true);
              }}
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Assign Member
            </Button>
          </div>
          {/* Unassigned to Nutritionist */}
          {unassignedNutritionistMembers.length > 0 && (
            <Card className="shadow-card border-warning/50">
              <CardHeader>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Users className="w-5 h-5 text-warning" />
                  Unassigned Members (Nutritionist)
                </CardTitle>
                <CardDescription>
                  {unassignedNutritionistMembers.length} member{unassignedNutritionistMembers.length !== 1 ? 's' : ''} need nutritionist assignment
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {unassignedNutritionistMembers.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 bg-warning/10 border border-warning/20 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={member.avatar} />
                          <AvatarFallback className="bg-gradient-primary text-white">
                            {member.name.split(' ').map(n => n[0]).join('')}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-sm font-medium text-foreground">{member.name}</p>
                          <p className="text-xs text-muted-foreground">No nutritionist</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {renderStaffAssignments(nutritionistAssignments, 'nutritionist')}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminAssignments;
