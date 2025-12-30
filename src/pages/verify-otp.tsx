import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { OtpVerification } from '@/components/auth/OtpVerification';
import { Icons } from '@/components/ui/icons';

export default function VerifyOtpPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const email = searchParams.get('email');

  useEffect(() => {
    // Check if email is present in the query params
    if (!email) {
      setIsValid(false);
      // Redirect to login if no email is provided
      navigate('/login');
    } else {
      setIsValid(true);
    }
  }, [email, navigate]);

  if (isValid === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icons.spinner className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isValid) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center p-6 max-w-sm mx-auto bg-white rounded-lg shadow-md">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Invalid Verification Link</h2>
          <p className="text-gray-600 mb-4">The verification link is invalid or has expired.</p>
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Go to Login
          </button>
        </div>
      </div>
    );
  }

  return <OtpVerification />;
}
