import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Platform,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  navy: '#0f2744',
  navyLight: '#1a365d',
  navyCard: '#162d4a',
  lime: '#c5d93d',
  white: '#ffffff',
  gray: '#94a3b8',
  grayDark: '#475569',
  green: '#22c55e',
  orange: '#f59e0b',
  blue: '#3b82f6',
  red: '#ef4444',
  purple: '#a855f7',
  teal: '#14b8a6',
  cyan: '#06b6d4',
};

interface OnboardingStep {
  icon: string;
  text: string;
}

interface OnboardingSlide {
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  color: string;
  steps: OnboardingStep[];
  badge?: string;
}

const ONBOARDING_SLIDES: OnboardingSlide[] = [
  {
    icon: 'rocket-outline',
    title: 'Welcome to BBA Tech',
    subtitle: 'Blue Box Air, Inc.',
    description: 'Your complete field technician companion. This quick guide will walk you through every feature so you can hit the ground running.',
    color: COLORS.lime,
    badge: 'START HERE',
    steps: [
      { icon: 'checkmark-circle', text: 'Synced with Salesforce for live project data' },
      { icon: 'checkmark-circle', text: 'Record pre & post equipment readings' },
      { icon: 'checkmark-circle', text: 'Generate professional PDF reports' },
      { icon: 'checkmark-circle', text: 'AI-powered HVAC troubleshooting' },
      { icon: 'checkmark-circle', text: 'Team management & org chart' },
    ],
  },
  {
    icon: 'log-in-outline',
    title: 'Signing In',
    subtitle: 'Multiple Login Options',
    description: 'Choose the sign-in method that works best for you:',
    color: COLORS.blue,
    badge: 'LOGIN',
    steps: [
      { icon: 'business', text: 'Login with Salesforce — SSO for BBA employees. Opens Salesforce login in your browser.' },
      { icon: 'logo-google', text: 'Google Sign-in — Use your Google account. Matches your email to your Salesforce profile.' },
      { icon: 'mail', text: 'Email & Password — Type your credentials in the Sign In tab.' },
      { icon: 'finger-print', text: 'Face ID / Touch ID — After first login, use biometrics for instant access.' },
      { icon: 'checkbox', text: 'Remember Me — Check the box to save your credentials for next time.' },
    ],
  },
  {
    icon: 'home-outline',
    title: 'Home Dashboard',
    subtitle: 'Your Mission Control',
    description: 'After login, the Home tab shows an overview of your workload and quick navigation.',
    color: COLORS.green,
    badge: 'HOME TAB',
    steps: [
      { icon: 'stats-chart', text: 'Top cards show your Active Projects, Equipment count, and Total Projects.' },
      { icon: 'folder-open', text: 'Tap "My Projects" to jump directly to your project list.' },
      { icon: 'chatbubbles', text: 'Tap "AI Assistant" for instant HVAC troubleshooting help.' },
      { icon: 'person-circle', text: 'Tap "My Profile" to view or edit your account details.' },
      { icon: 'trophy', text: 'Scroll down to see the latest "Coil of the Month" highlight.' },
    ],
  },
  {
    icon: 'folder-open-outline',
    title: 'Projects List',
    subtitle: 'Synced from Salesforce',
    description: 'The Projects tab displays all Salesforce Opportunities assigned to you.',
    color: COLORS.orange,
    badge: 'PROJECTS TAB',
    steps: [
      { icon: 'search', text: 'Use the search bar at the top to find projects by name or client.' },
      { icon: 'filter', text: 'Tap filter chips (Active, Completed, etc.) to narrow your view.' },
      { icon: 'swap-vertical', text: 'Pull down to refresh and sync the latest data from Salesforce.' },
      { icon: 'chevron-forward', text: 'Tap any project card to open its detail page with equipment list.' },
      { icon: 'sync', text: 'Data refreshes automatically and stays in sync with Salesforce.' },
    ],
  },
  {
    icon: 'construct-outline',
    title: 'Project Details & Equipment',
    subtitle: 'Inside a Project',
    description: 'When you open a project, you see all its equipment and can record service data.',
    color: COLORS.teal,
    badge: 'PROJECT DETAIL',
    steps: [
      { icon: 'information-circle', text: 'Project info shows client name, address, status, and dates at the top.' },
      { icon: 'hardware-chip', text: 'The Equipment tab lists all units for this project — tap one to select it.' },
      { icon: 'analytics', text: 'The Readings tab shows all recorded measurements for the selected equipment.' },
      { icon: 'add-circle', text: 'Tap "+ Add Reading" to input a new Pre or Post service measurement.' },
      { icon: 'document-text', text: 'The Report tab lets you generate and share a PDF service report.' },
    ],
  },
  {
    icon: 'speedometer-outline',
    title: 'Recording Readings',
    subtitle: 'Pre & Post Service Values',
    description: 'The core of your field work — capturing before and after measurements.',
    color: COLORS.lime,
    badge: 'HOW TO',
    steps: [
      { icon: 'create', text: 'Step 1: Select an equipment unit from the project\'s Equipment tab.' },
      { icon: 'add-circle', text: 'Step 2: Tap "+ Add Reading" and choose "Pre" (before service) or "Post" (after).' },
      { icon: 'thermometer', text: 'Step 3: Select reading type — Differential Pressure (inWC) or Airflow (FPM).' },
      { icon: 'keypad', text: 'Step 4: Enter the value and set the date/time of the measurement.' },
      { icon: 'calculator', text: 'Step 5: Save — the app auto-calculates the difference between Pre and Post.' },
    ],
  },
  {
    icon: 'document-text-outline',
    title: 'PDF Reports',
    subtitle: 'Generate & Share',
    description: 'Create professional service reports from your reading data.',
    color: COLORS.purple,
    badge: 'REPORTS',
    steps: [
      { icon: 'bar-chart', text: 'Reports calculate average Pressure Drop and Airflow Increase per unit.' },
      { icon: 'cloud-upload', text: 'Tap "Generate Report" — the PDF uploads directly to the Salesforce Opportunity.' },
      { icon: 'download', text: 'Download the PDF to your device for offline access.' },
      { icon: 'share-social', text: 'Tap "Share" to send via Gmail, Messages, AirDrop, or any installed app.' },
      { icon: 'calendar', text: 'Reports include technician info, client details, timestamps, and averages.' },
    ],
  },
  {
    icon: 'chatbubble-ellipses-outline',
    title: 'AI Assistant',
    subtitle: 'Instant Expert Help',
    description: 'Get real-time HVAC troubleshooting guidance powered by AI.',
    color: COLORS.cyan,
    badge: 'AI CHAT TAB',
    steps: [
      { icon: 'help-circle', text: 'Type any HVAC question — diagnostics, best practices, codes, or procedures.' },
      { icon: 'flash', text: 'Get instant step-by-step answers tailored to field technicians.' },
      { icon: 'bookmark', text: 'Chat history is saved so you can reference past conversations.' },
      { icon: 'bulb', text: 'Try asking: "How do I troubleshoot low airflow?" or "What causes high DP?"' },
      { icon: 'shield-checkmark', text: 'Answers are AI-generated — always verify with your supervisor for critical work.' },
    ],
  },
  {
    icon: 'trophy-outline',
    title: 'Coil of the Month',
    subtitle: 'Team Recognition',
    description: 'Celebrate great coil cleaning results and stay inspired by your team\'s work.',
    color: COLORS.orange,
    badge: 'COIL TAB',
    steps: [
      { icon: 'images', text: 'Browse featured before/after coil photos from the team.' },
      { icon: 'heart', text: 'Tap the heart icon to like a submission.' },
      { icon: 'chatbox', text: 'Add comments to share feedback or encouragement.' },
      { icon: 'camera', text: 'Admins: Tap "Submit Entry" to add new coil cleaning highlights.' },
      { icon: 'ribbon', text: 'Monthly winners are selected to recognize outstanding field work.' },
    ],
  },
  {
    icon: 'people-outline',
    title: 'Team & Org Chart',
    subtitle: 'Admin Management',
    description: 'View your company\'s team structure and manage personnel.',
    color: COLORS.blue,
    badge: 'TEAM TAB',
    steps: [
      { icon: 'git-network', text: 'The org chart shows the full team hierarchy from leadership to technicians.' },
      { icon: 'eye', text: 'All users can view the team structure and contact information.' },
      { icon: 'create', text: 'Admins: Tap any team member to edit their name, email, role, or region.' },
      { icon: 'person-add', text: 'Admins: Tap "+" to add a new team member and assign their role.' },
      { icon: 'trash', text: 'Admins: Long-press a member to remove them from the team.' },
    ],
  },
  {
    icon: 'person-circle-outline',
    title: 'Your Profile',
    subtitle: 'Account & Settings',
    description: 'Manage your personal information and app preferences.',
    color: COLORS.green,
    badge: 'PROFILE TAB',
    steps: [
      { icon: 'person', text: 'View your name, email, title, and company information.' },
      { icon: 'camera', text: 'Tap your avatar to update your profile photo.' },
      { icon: 'key', text: 'Your login source (Salesforce, Google, or credentials) is shown here.' },
      { icon: 'finger-print', text: 'Enable Face ID / Touch ID for quick access on future logins.' },
      { icon: 'log-out', text: 'Tap "Sign Out" to securely log out of the app.' },
    ],
  },
  {
    icon: 'shield-checkmark-outline',
    title: 'You\'re All Set!',
    subtitle: 'Ready to Get Started',
    description: 'You now know every feature in BBA Tech. Time to get to work!',
    color: COLORS.lime,
    badge: 'LET\'S GO',
    steps: [
      { icon: 'checkbox', text: 'Enable "Remember Me" on the login screen to save your credentials.' },
      { icon: 'finger-print', text: 'Set up Face ID / Touch ID after your first login for instant access.' },
      { icon: 'help-buoy', text: 'Tap the "?" button on any screen for quick tips and help guides.' },
      { icon: 'refresh', text: 'This tutorial won\'t show again. You can find help anytime via the "?" buttons.' },
      { icon: 'rocket', text: 'Tap "Get Started" below to begin using BBA Tech!' },
    ],
  },
];

export const OnboardingScreen = ({ onComplete }: { onComplete: () => void }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleNext = () => {
    if (currentIndex < ONBOARDING_SLIDES.length - 1) {
      const nextIndex = currentIndex + 1;
      flatListRef.current?.scrollToOffset({ offset: nextIndex * SCREEN_WIDTH, animated: true });
      setCurrentIndex(nextIndex);
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

  const currentSlide = ONBOARDING_SLIDES[currentIndex];
  const isLastSlide = currentIndex === ONBOARDING_SLIDES.length - 1;

  const renderSlide = ({ item, index }: { item: OnboardingSlide; index: number }) => (
    <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.slideScrollContent}
      >
        {/* Badge */}
        {item.badge && (
          <View style={[styles.badge, { backgroundColor: item.color + '20', borderColor: item.color + '40' }]}>
            <Text style={[styles.badgeText, { color: item.color }]}>{item.badge}</Text>
          </View>
        )}

        {/* Icon */}
        <View style={[styles.iconContainer, { backgroundColor: item.color + '12' }]}>
          <Ionicons name={item.icon as any} size={52} color={item.color} />
        </View>

        {/* Title & Subtitle */}
        <Text style={styles.slideTitle}>{item.title}</Text>
        <Text style={[styles.slideSubtitle, { color: item.color }]}>{item.subtitle}</Text>
        <Text style={styles.slideDescription}>{item.description}</Text>

        {/* Steps */}
        <View style={styles.stepsContainer}>
          {item.steps.map((step, stepIdx) => (
            <View key={stepIdx} style={styles.stepRow}>
              <View style={[styles.stepIconWrapper, { backgroundColor: item.color + '15' }]}>
                <Ionicons name={step.icon as any} size={18} color={item.color} />
              </View>
              <Text style={styles.stepText}>{step.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header with slide counter and skip */}
      <View style={styles.header}>
        <Text style={styles.slideCounter}>
          {currentIndex + 1} <Text style={styles.slideCounterTotal}>/ {ONBOARDING_SLIDES.length}</Text>
        </Text>
        <TouchableOpacity style={styles.skipButton} onPress={handleSkip}>
          <Text style={styles.skipText}>Skip All</Text>
          <Ionicons name="play-forward" size={14} color={COLORS.gray} />
        </TouchableOpacity>
      </View>

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

      {/* Bottom area: dots + button */}
      <View style={styles.bottomArea}>
        {/* Progress dots */}
        <View style={styles.dotsContainer}>
          {ONBOARDING_SLIDES.map((slide, idx) => (
            <View
              key={idx}
              style={[
                styles.dot,
                idx === currentIndex && { ...styles.dotActive, backgroundColor: slide.color },
                idx < currentIndex && styles.dotCompleted,
              ]}
            />
          ))}
        </View>

        {/* Next / Get Started button */}
        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: currentSlide.color }]}
          onPress={handleNext}
          activeOpacity={0.85}
        >
          <Text style={styles.nextButtonText}>
            {isLastSlide ? 'Get Started' : 'Next'}
          </Text>
          <Ionicons
            name={isLastSlide ? 'checkmark-circle' : 'arrow-forward'}
            size={20}
            color={COLORS.navy}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.navy,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 44,
    paddingBottom: 4,
  },
  slideCounter: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  slideCounterTotal: {
    color: COLORS.grayDark,
    fontWeight: '400',
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  skipText: {
    color: COLORS.gray,
    fontSize: 14,
    fontWeight: '600',
  },
  slide: {
    flex: 1,
  },
  slideScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 20,
  },
  badge: {
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 16,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 20,
  },
  slideTitle: {
    color: COLORS.white,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  slideSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  slideDescription: {
    color: COLORS.gray,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 20,
  },
  stepsContainer: {
    gap: 10,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.navyCard,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  stepIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  stepText: {
    color: COLORS.white,
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  bottomArea: {
    paddingHorizontal: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  dotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.grayDark,
  },
  dotActive: {
    width: 20,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.lime,
  },
  dotCompleted: {
    backgroundColor: COLORS.gray,
  },
  nextButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.lime,
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
