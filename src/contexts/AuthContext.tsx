import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { login as apiLogin, requestOtp } from '@/services/api/authApi';
import { api } from '@/services/api/config';

type AxiosErrorLike = {
  isAxiosError?: boolean;
  message?: string;
  code?: string;
  response?: {
    status?: number;
    data?: unknown;
  };
  request?: unknown;
  config?: {
    url?: string;
    method?: string;
  };
};

export interface AuthUser {
  id: number;
  name: string;
  full_name: string;
  email: string;
  role: 'member' | 'trainer' | 'nutritionist' | 'admin';
  avatar?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<{ success: boolean; requiresOtp?: boolean }>;
  verifyOtp: (email: string, otp: string) => Promise<boolean>;
  resendOtp: (email: string) => Promise<boolean>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await api.get<{ user: { id: number; full_name: string; email: string; role: AuthUser['role'] } }>(
          '/auth/me'
        );

        const u = res.data.user;
        if (u) {
          setUser({
            id: u.id,
            name: u.full_name,
            full_name: u.full_name,
            email: u.email,
            role: u.role,
          });
        } else {
          setUser(null);
        }
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);

    try {
      const res = await apiLogin(email, password);

      if (!res.success || !res.user) {
        console.error('Login failed response:', res);
        return { success: false };
      }

      const apiUser = res.user;

      const authUser: AuthUser = {
        id: apiUser.id,
        name: apiUser.full_name,
        full_name: apiUser.full_name,
        email: apiUser.email,
        role: apiUser.role,
      };

      setUser(authUser);
      return { success: true };
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'isAxiosError' in error) {
        const err = error as AxiosErrorLike;
        console.error('Login Axios error:', {
          message: err.message,
          code: err.code,
          status: err.response?.status,
          data: err.response?.data,
          request: err.request,
          url: err.config?.url,
          method: err.config?.method,
        });
      } else {
        console.error('Login error:', error);
      }
      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);

    api.post('/auth/logout').catch(() => {
      // ignore
    });
  };

  const verifyOtp = async (email: string, otp: string): Promise<boolean> => {
    // OTP-based activation is handled via the signup flow and backend APIs.
    // This method is kept only for compatibility with older components.
    console.warn('verifyOtp is deprecated in AuthContext and is not used in the new flow.');
    return false;
  };
  
  const resendOtp = async (email: string): Promise<boolean> => {
    setLoading(true);

    try {
      await requestOtp(email);
      return true;
    } catch (error) {
      console.error('Resend OTP error:', error);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const value = {
    user,
    login,
    verifyOtp,
    resendOtp,
    logout,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};