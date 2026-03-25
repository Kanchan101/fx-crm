'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] bg-gradient-to-br from-fx-950 via-fx-900 to-fx-800 flex-col justify-between p-12 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-fx-700/20 rounded-full -translate-y-1/2 translate-x-1/3" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-fx-600/15 rounded-full translate-y-1/3 -translate-x-1/4" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 bg-white/10 backdrop-blur rounded-lg flex items-center justify-center font-bold text-lg tracking-tight">FX</div>
            <span className="text-lg font-semibold tracking-tight">FX Consulting</span>
          </div>
          <p className="text-fx-200/60 text-sm mt-1">Enterprise Recruitment CRM</p>
        </div>
        <div className="relative z-10">
          <h1 className="text-3xl font-bold leading-tight mb-4">
            Manage your entire<br />recruitment pipeline<br /><span className="text-fx-300">in one place.</span>
          </h1>
          <p className="text-fx-200/70 text-sm leading-relaxed max-w-sm">
            AI-powered CV parsing, real-time Kanban pipelines, team collaboration, and client management — built for scale.
          </p>
        </div>
        <div className="relative z-10 flex items-center gap-6 text-sm text-fx-200/50">
          <span>27 open positions</span>
          <span className="w-1 h-1 rounded-full bg-fx-200/30" />
          <span>4 active clients</span>
          <span className="w-1 h-1 rounded-full bg-fx-200/30" />
          <span>10 team members</span>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-fx-600 rounded-lg flex items-center justify-center text-white font-bold text-lg">FX</div>
            <div>
              <p className="font-semibold text-gray-900">FX Consulting</p>
              <p className="text-xs text-gray-400">Enterprise CRM</p>
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Welcome back</h2>
          <p className="text-gray-500 text-sm mb-8">Sign in to your CRM account</p>

          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@fxconsulting.in"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-white placeholder:text-gray-300 transition-colors hover:border-gray-300"
                required autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)} placeholder="••••••••••"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg text-sm bg-white placeholder:text-gray-300 transition-colors hover:border-gray-300 pr-10"
                  required />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1}>
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-fx-600 hover:bg-fx-700 disabled:bg-fx-300 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (<><LogIn className="w-4 h-4" />Sign in</>)}
            </button>
          </form>
          <p className="mt-8 text-center text-xs text-gray-400">FX Consulting CRM v1.0 — Authorized personnel only</p>
        </div>
      </div>
    </div>
  );
}
