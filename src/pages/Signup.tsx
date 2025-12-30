import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dumbbell, Loader2, ArrowRight, Mail, User } from 'lucide-react';
import { Link } from 'react-router-dom';
import { requestOtp, activateAccount } from '@/services/api/authApi';

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

const Signup: React.FC = () => {
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [step, setStep] = useState<'email' | 'otp' | 'complete'>('email');
  const [loading, setLoading] = useState(false);
  
  const navigate = useNavigate();

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    
    if (!email) {
      setError('Please enter your email');
      return;
    }
    
    setLoading(true);
    
    try {
      await requestOtp(email);
      setSuccess('If your email is registered by an admin, you will receive an OTP');
      setStep('otp');
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to send OTP. Please try again.'));
    } finally {
      setLoading(false);
    }
  };
  
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!otp || otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP');
      return;
    }
    
    if (!name) {
      setError('Please enter your name');
      return;
    }
    
    if (!password) {
      setError('Please enter a password');
      return;
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    
    setLoading(true);
    
    try {
      await activateAccount({
        email,
        otp,
        full_name: name,
        password,
      });

      setStep('complete');

      setTimeout(() => {
        navigate('/login');
      }, 3000);
      
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Invalid or expired OTP. Please try again.'));
    } finally {
      setLoading(false);
    }
  };
  
  const resendOtp = async () => {
    setError('');
    setLoading(true);
    
    try {
      await requestOtp(email);
      setSuccess('A new OTP has been sent to your email');
    } catch (err) {
      setError('Failed to resend OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'complete') {
    return (
      <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 shadow-2xl">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Account Activated!</h2>
            <p className="text-white/70 mb-8">Your account has been successfully created. Redirecting to login...</p>
            <div className="h-2 w-full bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full animate-progress"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo and Branding */}
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full mb-4">
            <Dumbbell className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Leqet Gym</h1>
          <p className="text-muted-foreground">Complete your registration</p>
        </div>

        {/* Signup Form */}
        <Card className="shadow-glow border-white/20 bg-white/10 backdrop-blur-md">
          <CardHeader>
            <CardTitle className="text-foreground">
              {step === 'email' ? 'Verify Your Email' : 'Complete Registration'}
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              {step === 'email' 
                ? 'Enter the email address provided by your admin' 
                : 'Enter the OTP sent to your email and set up your account'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={step === 'email' ? handleEmailSubmit : handleOtpSubmit} className="space-y-4">
              {error && (
                <Alert className="border-red-500/50 bg-red-500/10">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              
              {success && (
                <Alert className="border-green-500/50 bg-green-500/10">
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}
              
              {step === 'email' ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-foreground">Email Address</Label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring/50 pl-10"
                        placeholder="your@email.com"
                        disabled={loading}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Enter the email address that was registered by your admin
                    </p>
                  </div>
                  
                  <Button 
                    type="submit" 
                    className="w-full bg-white text-gray-900 hover:bg-gray-100 mt-6"
                    disabled={loading || !email}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending OTP...
                      </>
                    ) : (
                      <>
                        Continue <ArrowRight className="ml-2 h-4 w-4" />
                      </>
                    )}
                  </Button>
                  
                  <div className="text-center text-sm mt-4">
                    <p className="text-muted-foreground">
                      Already have an account?{' '}
                      <Link to="/login" className="text-primary font-medium hover:underline">
                        Sign in
                      </Link>
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="otp" className="text-foreground">Verification Code</Label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                        <Input
                          id="otp"
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={otp}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '');
                            setOtp(value.slice(0, 6));
                          }}
                          className="text-center text-xl font-mono tracking-widest bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring/50 pl-12"
                          placeholder="000000"
                          autoFocus
                        />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Enter the 6-digit code sent to {email}
                      </p>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="name" className="text-foreground">Full Name</Label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <User className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <Input
                          id="name"
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring/50 pl-10"
                          placeholder="Your full name"
                          disabled={loading}
                        />
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-foreground">Password</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring/50"
                        placeholder="Create a password"
                        disabled={loading}
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="confirmPassword" className="text-foreground">Confirm Password</Label>
                      <Input
                        id="confirmPassword"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="bg-background border-border text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-ring/50"
                        placeholder="Confirm your password"
                        disabled={loading}
                      />
                    </div>
                    
                    <div className="flex items-center justify-between mt-2">
                      <button
                        type="button"
                        onClick={resendOtp}
                        disabled={loading}
                        className="text-sm text-primary hover:text-primary/80 disabled:opacity-50"
                      >
                        Resend code
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => setStep('email')}
                        className="text-sm text-muted-foreground hover:text-foreground flex items-center"
                      >
                        <ArrowRight className="h-4 w-4 rotate-180 mr-1" /> Back
                      </button>
                    </div>
                    
                    <Button 
                      type="submit" 
                      className="w-full bg-white text-gray-900 hover:bg-gray-100 mt-4"
                      disabled={loading || !otp || !name || !password || password !== confirmPassword}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Creating Account...
                        </>
                      ) : 'Complete Registration'}
                    </Button>
                  </div>
                </>
              )}
            </form>
          </CardContent>
        </Card>
        
        {step === 'email' && (
          <div className="text-center">
            <p className="text-sm text-muted-foreground">
              Don't have an account? Contact your admin to get registered.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Signup;
