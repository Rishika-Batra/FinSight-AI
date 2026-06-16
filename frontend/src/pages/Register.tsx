import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import client from '../api/client';

export default function Register() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Set SEO metadata and title
  useEffect(() => {
    document.title = 'Create an Account | FinSight AI';
    // If already logged in, redirect to budget
    if (localStorage.getItem('access_token')) {
      navigate('/budget');
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate fields are not empty
    if (!username.trim() || !email.trim() || !password || !confirmPassword) {
      setError('All fields are required.');
      return;
    }

    // Validate passwords match
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    // Basic password length check
    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    try {
      setLoading(true);
      
      const res = await client.post('/auth/register/', {
        username: username.trim(),
        email: email.trim(),
        password,
      });

      // Save tokens
      localStorage.setItem('access_token', res.data.access);
      localStorage.setItem('refresh_token', res.data.refresh);
      
      navigate('/budget');
    } catch (err: any) {
      console.error('Registration error:', err);
      // Map API errors nicely
      const errData = err.response?.data;
      if (errData && typeof errData === 'object') {
        const firstErrorKey = Object.keys(errData)[0];
        const firstErrorVal = errData[firstErrorKey];
        if (Array.isArray(firstErrorVal)) {
          setError(`${firstErrorKey}: ${firstErrorVal[0]}`);
        } else if (typeof firstErrorVal === 'string') {
          setError(`${firstErrorKey}: ${firstErrorVal}`);
        } else {
          setError('Failed to create account. Please check your inputs.');
        }
      } else {
        setError(err.response?.data?.detail || err.response?.data?.error || 'An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDF6E3] text-[#1A1A2E] flex items-center justify-center p-4 relative font-sans" id="register-page-root">
      {/* Retro OS Window */}
      <div className="w-full max-w-md bg-[#F5EBE6] border-2 border-[#1A1A2E] shadow-[6px_6px_0px_#1A1A2E] relative z-10 overflow-hidden">
        {/* Title Bar */}
        <div className="bg-[#FF6FB5] border-b-2 border-[#1A1A2E] px-4 py-2">
          <span className="font-retro-title text-[10px] text-[#1A1A2E] uppercase tracking-wider">
            REGISTER.EXE
          </span>
        </div>

        <div className="p-8 space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-2xl font-bold font-retro-title text-[#1A1A2E] uppercase" id="register-title">
              Create Account
            </h1>
            <p className="text-xs font-retro-mono font-bold text-[#1A1A2E]/70 uppercase tracking-wider">
              Monitor metrics with FinSight AI
            </p>
          </div>

          {error && (
            <div className="bg-[#FF7676]/10 border-2 border-[#1A1A2E] text-[#1A1A2E] text-xs px-4 py-3 font-bold font-retro-mono uppercase" id="register-error-message">
              <span>⚠️ WARNING:</span> {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" id="register-form">
            <div className="space-y-1">
              <label htmlFor="reg-username-input" className="text-xs font-bold font-retro-title text-[#1A1A2E] uppercase block">
                Username
              </label>
              <input
                id="reg-username-input"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Pick a unique username"
                disabled={loading}
                className="w-full bg-white border-2 border-[#1A1A2E] text-[#1A1A2E] placeholder-[#1A1A2E]/40 text-sm font-retro-mono font-bold px-4 py-3 outline-none focus:bg-[#FFDE4D]/10 disabled:opacity-50"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="reg-email-input" className="text-xs font-bold font-retro-title text-[#1A1A2E] uppercase block">
                Email Address
              </label>
              <input
                id="reg-email-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                disabled={loading}
                className="w-full bg-white border-2 border-[#1A1A2E] text-[#1A1A2E] placeholder-[#1A1A2E]/40 text-sm font-retro-mono font-bold px-4 py-3 outline-none focus:bg-[#FFDE4D]/10 disabled:opacity-50"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="reg-password-input" className="text-xs font-bold font-retro-title text-[#1A1A2E] uppercase block">
                Password
              </label>
              <input
                id="reg-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                disabled={loading}
                className="w-full bg-white border-2 border-[#1A1A2E] text-[#1A1A2E] placeholder-[#1A1A2E]/40 text-sm font-retro-mono font-bold px-4 py-3 outline-none focus:bg-[#FFDE4D]/10 disabled:opacity-50"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="reg-confirm-password-input" className="text-xs font-bold font-retro-title text-[#1A1A2E] uppercase block">
                Confirm Password
              </label>
              <input
                id="reg-confirm-password-input"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                disabled={loading}
                className="w-full bg-white border-2 border-[#1A1A2E] text-[#1A1A2E] placeholder-[#1A1A2E]/40 text-sm font-retro-mono font-bold px-4 py-3 outline-none focus:bg-[#FFDE4D]/10 disabled:opacity-50"
              />
            </div>

            <button
              id="register-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full mt-4 bg-[#FFDE4D] text-[#1A1A2E] font-retro-title text-[10px] uppercase py-3.5 px-4 border-2 border-[#1A1A2E] shadow-[4px_4px_0px_#1A1A2E] active:translate-x-1 active:translate-y-1 active:shadow-[0px_0px_0px_#1A1A2E] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="animate-spin text-xs">⏳</span>
                  Creating Account...
                </>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          <div className="text-center pt-2">
            <p className="text-xs font-retro-mono font-bold uppercase text-[#1A1A2E]/70">
              Already have an account?{' '}
              <Link to="/login" id="nav-to-login-link" className="text-[#FF6FB5] hover:underline font-bold">
                Sign In Instead
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
