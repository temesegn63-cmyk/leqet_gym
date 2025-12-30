import { User } from '@/types';
import { api } from './config';

export interface UpdateUserData extends Partial<User> {
  trainerId?: string | null;
  nutritionistId?: string | null;
}

export const getUsers = async (): Promise<User[]> => {
  try {
    const response = await api.get<User[]>('/admin/users');
    return response.data;
  } catch (error) {
    console.error('Error fetching users:', error);
    throw error;
  }
};

export const getUserById = async (id: string): Promise<User> => {
  try {
    const response = await api.get<User>(`/admin/users/${id}`);
    return response.data;
  } catch (error) {
    console.error(`Error fetching user with id ${id}:`, error);
    throw error;
  }
};

export const updateUser = async (id: string, userData: UpdateUserData): Promise<User> => {
  try {
    const response = await api.put<User>(`/admin/users/${id}`, userData);
    return response.data;
  } catch (error) {
    console.error(`Error updating user with id ${id}:`, error);
    throw error;
  }
};

export const deleteUser = async (id: string): Promise<void> => {
  try {
    await api.delete(`/admin/users/${id}`);
  } catch (error) {
    console.error(`Error deleting user with id ${id}:`, error);
    throw error;
  }
};
