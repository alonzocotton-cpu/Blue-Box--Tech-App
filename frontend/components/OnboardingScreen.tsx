import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const COLORS = {
  navy: '#0f2744',
  navyLight: '#1a365d',
  lime: '#c5d93d',
  white: '#ffffff',
  gray: '#94a3b8',
  grayDark: '#475569',
  green: '#22c55e',
  orange: '#f59e0b',
};

const ONBOARDING_SLIDES = [
  {
    icon: 'build-outline',
    title: 'Welcome to BBA Tech',
    subtitle: 'Blue Box Air, Inc.',
    description: 'Your all-in-one field technician companion for coil management, equipment servicing, and project tracking.',
    color: COLORS.lime,
  },
  {
    icon: 'folder-open-outline',
    title: 'Manage Projects',
    subtitle: 'Synced with Salesforce',
    description: 'View all your assigned projects in one place. Each project shows equipment, readings, photos, and service history — all pulled from Salesforce.',
    color: COLORS.green,
  },
  {
    icon: 'speedometer-outline',
    title: 'Record Pre & Post Readings',
    subtitle: 'Differential Pressure & Airflow',
    description: 'Capture equipment readings before and after service. The app automatically calculates the difference and tracks improvement in Differential Pressure (inWC) and Airflow (FPM).',
    color: COLORS.orange,
  },
  {
    icon: 'document-text-outline',
    title: 'Generate & Share Reports',
    subtitle: 'PDF with Averages',
    description: 'Generate professional PDF reports with average pressure drop and airflow increase per unit and overall. Reports upload to Salesforce and can be shared via Gmail.',
    color: COLORS.lime,
  },
  {
    icon: 'chatbubble-ellipses-outline',
    title: 'AI Troubleshooting',
    subtitle: 'Instant Expert Help',
    description: 'Ask the AI Assistant any HVAC question. Get step-by-step guidance for troubleshooting, best practices, and technical support — right in the field.',
    color: COLORS.green,
  },
  {
    icon: 'trophy-outline',
    title: 'Coil of the Month',
    subtitle: 'Team Highlights',
    description: 'See featured coil cleaning results from the team. Like and comment to celebrate great work. Admins can submit new entries to inspire the crew.',
    color: COLORS.orange,
  },
];

export const OnboardingScreen = ({ onComplete }: { onComplete: () => void }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleNext = () => {
    if (currentIndex < ONBOARDING_SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
      setCurrentIndex(currentIndex + 1);
    } else {
      handleFinish();
    }
  };

  const handleSkip = () => {
    handleFinish();
  };

  const handleFinish = async () => {
    await AsyncStorage.setItem('onboardingCompleted', 'true');
    onComplete();
  };

  const renderSlide = ({ item, index }: { item: typeof ONBOARDING_SLIDES[0]; index: number }) => (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}> 
      <View style={[styles.iconContainer, { backgroundColor: item.color + '15' }]}>
        <Ionicons name={item.icon as any} size={64} color={item.color} />
      </View>
      <Text style={styles.slideTitle}>{item.title}</Text>
      <Text style={[styles.slideSubtitle, { color: item.color }]}>{item.subtitle}</Text>
      <Text style={styles.slideDescription}>{item.description}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Skip button */}
      <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipText}>Skip</Text>
      </TouchableOpacity>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={ONBOARDING_SLIDES}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(_, i) => i.toString()}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setCurrentIndex(idx);
        }}
        scrollEventThrottle={16}
      />

      {/* Dots */}
      <View style={styles.dotsContainer}>
        {ONBOARDING_SLIDES.map((slide, idx) => (
          <View
            key={idx}
            style={[
              styles.dot,
              idx === currentIndex && { ...styles.dotActive, backgroundColor: slide.color },
            ]}
          />
        ))}
      </View>

      {/* Next / Get Started */}
      <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
        <Text style={styles.nextButtonText}>
          {currentIndex === ONBOARDING_SLIDES.length - 1 ? 'Get Started' : 'Next'}
        </Text>
        <Ionicons
          name={currentIndex === ONBOARDING_SLIDES.length - 1 ? 'checkmark-circle' : 'arrow-forward'}
          size={20}
          color={COLORS.navy}
        />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.navy,
  },
  skipButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 20,
    zIndex: 10,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    color: COLORS.gray,
    fontSize: 15,
    fontWeight: '600',
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  iconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  slideTitle: {
    color: COLORS.white,
    fontSize: 28,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6,
  },
  slideSubtitle: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  slideDescription: {
    color: COLORS.gray,
    fontSize: 15,
    lineHeight: 24,
    textAlign: 'center',
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.grayDark,
  },
  dotActive: {
    width: 24,
    backgroundColor: COLORS.lime,
  },
  nextButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.lime,
    marginHorizontal: 24,
    marginBottom: Platform.OS === 'ios' ? 50 : 30,
    borderRadius: 14,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  nextButtonText: {
    color: COLORS.navy,
    fontSize: 17,
    fontWeight: '700',
  },
});
