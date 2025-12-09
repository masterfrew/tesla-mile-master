import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export function useOnboarding() {
  const { user } = useAuth();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setShowOnboarding(false);
      setLoading(false);
      return;
    }

    // Check if user has completed onboarding
    const onboardingKey = `onboarding_complete_${user.id}`;
    const hasCompleted = localStorage.getItem(onboardingKey) === 'true';
    
    // Show onboarding for new users (created in last hour)
    const createdAt = new Date(user.created_at || Date.now());
    const isNewUser = Date.now() - createdAt.getTime() < 60 * 60 * 1000; // 1 hour
    
    setShowOnboarding(isNewUser && !hasCompleted);
    setLoading(false);
  }, [user]);

  const completeOnboarding = () => {
    if (user) {
      localStorage.setItem(`onboarding_complete_${user.id}`, 'true');
    }
    setShowOnboarding(false);
  };

  const skipOnboarding = () => {
    completeOnboarding();
  };

  return {
    showOnboarding,
    loading,
    completeOnboarding,
    skipOnboarding,
  };
}
