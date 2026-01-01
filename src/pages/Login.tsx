import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Dumbbell, Loader2, ArrowLeft, Mail } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { requestPasswordReset, resetPassword } from '@/services/api/authApi';

type AxiosErrorLike<T = unknown> = {
  message?: string;
  response?: {
    status?: number;
    data?: T;
  };
};

function getErrorMessage(err: unknown, fallback: string): string {
  const axiosErr = err as AxiosErrorLike<{ message?: string }>;
  return axiosErr?.response?.data?.message || axiosErr?.message || fallback;
}

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<'request' | 'reset' | 'done'>('request');
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  
  const { login, loading } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }

    const result = await login(email, password);
    
    if (result.success) {
      toast({
        title: 'Welcome to Leqet Gym!',
        description: 'You have successfully logged in.',
      });
      navigate('/dashboard');
    } else {
      setError('Invalid email or password');
    }
  };

  const openForgotPassword = () => {
    setForgotEmail(email || '');
    setForgotOtp('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    setForgotError('');
    setForgotSuccess('');
    setForgotStep('request');
    setForgotOpen(true);
  };

  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    if (!forgotEmail) {
      setForgotError('Please enter your email');
      return;
    }

    setForgotLoading(true);
    try {
      await requestPasswordReset(forgotEmail);
      setForgotSuccess('If an account exists for this email, you will receive a reset code.');
      setForgotStep('reset');
    } catch (err: unknown) {
      setForgotError(getErrorMessage(err, 'Failed to request reset code. Please try again.'));
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    if (!forgotEmail) {
      setForgotError('Please enter your email');
      return;
    }

    if (!forgotOtp || forgotOtp.length !== 6) {
      setForgotError('Please enter a valid 6-digit code');
      return;
    }

    if (!forgotNewPassword || forgotNewPassword.length < 6) {
      setForgotError('Password must be at least 6 characters');
      return;
    }

    if (forgotNewPassword !== forgotConfirmPassword) {
      setForgotError('Passwords do not match');
      return;
    }

    setForgotLoading(true);
    try {
      await resetPassword({
        email: forgotEmail,
        otp: forgotOtp,
        password: forgotNewPassword,
      });
      setForgotStep('done');
      toast({
        title: 'Password updated',
        description: 'You can now sign in with your new password.',
      });
    } catch (err: unknown) {
      setForgotError(getErrorMessage(err, 'Invalid or expired code. Please try again.'));
    } finally {
      setForgotLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        <Dialog
          open={forgotOpen}
          onOpenChange={(open) => {
            setForgotOpen(open);
            if (!open) {
              setForgotError('');
              setForgotSuccess('');
              setForgotOtp('');
              setForgotNewPassword('');
              setForgotConfirmPassword('');
              setForgotStep('request');
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Forgot Password</DialogTitle>
              <DialogDescription>
                {forgotStep === 'request'
                  ? 'Enter your email to receive a reset code.'
                  : forgotStep === 'reset'
                    ? 'Enter the reset code and your new password.'
                    : 'Your password has been updated.'}
              </DialogDescription>
            </DialogHeader>

            {(forgotError || forgotSuccess) && (
              <Alert
                className={
                  forgotError
                    ? 'border-red-500/50 bg-red-500/10'
                    : 'border-green-500/50 bg-green-500/10'
                }
              >
                <AlertDescription>{forgotError || forgotSuccess}</AlertDescription>
              </Alert>
            )}

            {forgotStep === 'request' && (
              <form onSubmit={handleForgotRequest} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgotEmail">Email</Label>
                  <Input
                    id="forgotEmail"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="your@email.com"
                    disabled={forgotLoading}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setForgotOpen(false)} disabled={forgotLoading}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-gradient-primary" disabled={forgotLoading || !forgotEmail}>
                    {forgotLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      'Send code'
                    )}
                  </Button>
                </div>
              </form>
            )}

            {forgotStep === 'reset' && (
              <form onSubmit={handleForgotReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="forgotEmail2">Email</Label>
                  <Input
                    id="forgotEmail2"
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    placeholder="your@email.com"
                    disabled={forgotLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="forgotOtp">Reset code</Label>
                  <Input
                    id="forgotOtp"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={forgotOtp}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '');
                      setForgotOtp(value.slice(0, 6));
                    }}
                    placeholder="000000"
                    disabled={forgotLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="forgotNewPassword">New password</Label>
                  <Input
                    id="forgotNewPassword"
                    type="password"
                    value={forgotNewPassword}
                    onChange={(e) => setForgotNewPassword(e.target.value)}
                    placeholder="Enter a new password"
                    disabled={forgotLoading}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="forgotConfirmPassword">Confirm new password</Label>
                  <Input
                    id="forgotConfirmPassword"
                    type="password"
                    value={forgotConfirmPassword}
                    onChange={(e) => setForgotConfirmPassword(e.target.value)}
                    placeholder="Confirm your new password"
                    disabled={forgotLoading}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setForgotStep('request')}
                    disabled={forgotLoading}
                  >
                    Back
                  </Button>
                  <Button
                    type="submit"
                    className="bg-gradient-primary"
                    disabled={
                      forgotLoading ||
                      !forgotEmail ||
                      forgotOtp.length !== 6 ||
                      !forgotNewPassword ||
                      forgotNewPassword !== forgotConfirmPassword
                    }
                  >
                    {forgotLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Reset password'
                    )}
                  </Button>
                </div>
              </form>
            )}

            {forgotStep === 'done' && (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Your password has been reset successfully.
                </div>
                <div className="flex justify-end">
                  <Button type="button" className="bg-gradient-primary" onClick={() => setForgotOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Logo and Branding */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full mb-4">
            <Dumbbell className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Leqet Gym</h1>
          <p className="text-muted-foreground">Personalized Fitness Platform</p>
        </div>

        {/* Login Form */}
        <Card className="shadow-glow border-white/20 bg-white/10 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-foreground">Sign In</CardTitle>
            <CardDescription className="text-muted-foreground">
              Enter your credentials to access your dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              {error && (
                <Alert className="border-red-500/50 bg-red-500/10">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="email" className="text-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring/50"
                  placeholder="your@email.com"
                  disabled={loading}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password" className="text-foreground">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring/50"
                  placeholder="Enter your password"
                  disabled={loading}
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={openForgotPassword}
                  disabled={loading}
                  className="text-sm text-muted-foreground hover:text-foreground hover:underline disabled:opacity-50"
                >
                  Forgot Password?
                </button>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-white text-gray-900 hover:bg-gray-100"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : 'Sign In'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="text-center text-sm mt-2">
          <p className="text-muted-foreground">
            Invited by your admin?{' '}
            <Link to="/signup" className="font-semibold hover:underline text-primary">
              Complete your registration
            </Link>
          </p>
        </div>

      </div>
    </div>
  );
};

export default Login;