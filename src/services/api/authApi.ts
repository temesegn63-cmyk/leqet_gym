import { api } from './config';

type AxiosErrorLike<T = unknown> = {
  message?: string;
  response?: {
    status?: number;
    data?: T;
  };
};

export interface LoginUser {
  id: number;
  full_name: string;
  email: string;
  role: 'member' | 'trainer' | 'nutritionist' | 'admin';
}

export interface LoginResponse {
  success: boolean;
  user: LoginUser;
  message?: string;
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await api.post<LoginResponse>(`/auth/login`, { email, password });
  return res.data;
}

export async function requestOtp(email: string): Promise<void> {
  await api.post(`/auth/request-otp`, { email });
}

export async function activateAccount(params: {
  email: string;
  otp: string;
  full_name?: string;
  password: string;
}): Promise<void> {
  await api.post(`/auth/activate`, params);
}

export async function requestPasswordReset(email: string): Promise<void> {
  await api.post(`/auth/forgot-password/request`, { email });
}

export async function resetPassword(params: {
  email: string;
  otp: string;
  password: string;
}): Promise<void> {
  await api.post(`/auth/forgot-password/reset`, params);
}

export interface InviteResponse {
  success: boolean;
  id?: number;
  status?: number;
  message?: string;
}

export async function inviteUser(params: {
  full_name: string;
  email: string;
  role: 'member' | 'trainer' | 'nutritionist' | 'admin';
}): Promise<InviteResponse> {
  try {
    const res = await api.post<{ id: number }>(`/admin/users/invite`, params);
    return { success: true, id: res.data.id, status: res.status };
  } catch (error) {
    const err = error as AxiosErrorLike<{ message?: string }>;
    const status = err.response?.status;
    const message = err.response?.data?.message || err.message || 'Failed to invite user';
    return { success: false, status: status ?? 500, message };
  }
}
