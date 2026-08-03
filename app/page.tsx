'use client';

import { useState, useEffect } from 'react';
import { isAuthenticated } from '@/lib/auth';
import LoginPage from './login';
import Dashboard from './dashboard';

export default function Home() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const res = await fetch('/api/auth/check', { method: 'GET' });
      setAuthenticated(res.ok);
    } catch {
      setAuthenticated(false);
    }
  }

  if (authenticated === null) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return authenticated ? <Dashboard /> : <LoginPage onSuccess={() => setAuthenticated(true)} />;
}
