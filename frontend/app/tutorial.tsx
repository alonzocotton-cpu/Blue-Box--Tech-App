import React from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnboardingScreen } from '../components/OnboardingScreen';

export default function TutorialScreen() {
  const handleComplete = async () => {
    await AsyncStorage.setItem('tutorialCompleted', 'true');
    router.replace('/(tabs)/home');
  };

  return <OnboardingScreen onComplete={handleComplete} />;
}
