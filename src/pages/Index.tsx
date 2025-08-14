import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Navigate } from 'react-router-dom';
import Dashboard from './Dashboard';
import Landing from './Landing';

const Index = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span>Laden...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Landing />;
  }

  return <Dashboard />;
};

export default Index;
