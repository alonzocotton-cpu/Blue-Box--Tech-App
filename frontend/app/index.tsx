import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Linking,
  Image,
  Animated,
  Dimensions,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import { Video, ResizeMode } from 'expo-av';

import { API_BASE_URL } from '../utils/api';

const API_URL = API_BASE_URL;

// Blue Box Air colors
const COLORS = {
  navy: '#0f2744',
  navyLight: '#1a365d',
  lime: '#c5d93d',
  white: '#ffffff',
  gray: '#94a3b8',
  grayDark: '#64748b',
  google: '#4285F4',
};

// Splash video URL
const SPLASH_VIDEO_URL = 'https://customer-assets.emergentagent.com/job_ff19b27f-9c44-4d68-b174-1452a3057557/artifacts/k1qp7et6_IMG_3237.mov';
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Blue Box Air Logo Component - Uses the exact company logo image
const LOGO_URI = 'https://customer-assets.emergentagent.com/job_ff19b27f-9c44-4d68-b174-1452a3057557/artifacts/2vycib7s_IMG_2827.jpeg';
const BlueBoxLogo = ({ size = 100 }: { size?: number }) => (
  <Image
    source={{ uri: LOGO_URI }}
    style={{ width: size, height: size, borderRadius: size * 0.18 }}
    resizeMode="contain"
    defaultSource={require('../assets/logo.jpeg')}
  />
);

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sfLoading, setSfLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [autoLoginChecked, setAutoLoginChecked] = useState(false);
  const [showSplashVideo, setShowSplashVideo] = useState(false);
  const [showCredentialForm, setShowCredentialForm] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [registerName, setRegisterName] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [registerLoading, setRegisterLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const videoRef = useRef<any>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const textFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    initializeLogin();
  }, []);

  const initializeLogin = async () => {
    // Check if we're returning from Google OAuth (Emergent Auth) callback
    await checkGoogleCallback();
    // Check if we're returning from Salesforce OAuth callback
    await checkSalesforceCallback();
    await checkBiometricSupport();
    await loadSavedCredentials();
    setAutoLoginChecked(true);
  };

  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const checkGoogleCallback = async () => {
    try {
      // On web, check URL hash for session_id from Emergent Auth redirect
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const hash = window.location.hash;
        if (hash && hash.includes('session_id=')) {
          const sessionId = hash.split('session_id=')[1]?.split('&')[0];
          if (sessionId) {
            setGoogleLoading(true);
            window.history.replaceState({}, '', window.location.pathname);
            await processGoogleSession(sessionId);
          }
        }
      }
      // On native, the Google callback is handled directly in handleGoogleLogin
      // via openAuthSessionAsync result — no need to check here
    } catch (error) {
      console.error('Google callback error:', error);
      setGoogleLoading(false);
    }
  };

  // Shared handler: exchange Google session_id with backend
  const processGoogleSession = async (sessionId: string) => {
    try {
      setGoogleLoading(true);
      const response = await fetch(`${API_URL}/api/auth/google/session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        await AsyncStorage.setItem('authToken', data.token);
        await AsyncStorage.setItem('technician', JSON.stringify(data.technician));
        await AsyncStorage.setItem('loginSource', data.source || 'google');

        if (biometricAvailable) {
          await AsyncStorage.setItem('biometricEnabled', 'true');
        }

        await navigateAfterAuth();
        return;
      } else {
        const errorDetail = data.detail || data.message || 'Authentication failed.';
        Alert.alert(
          'Google Login',
          errorDetail.includes('expired')
            ? 'Your Google session expired. Please tap the Google button to try again.'
            : `${errorDetail}\n\nTip: If this keeps happening, try using the Sign In form with your credentials instead.`
        );
      }
    } catch (error) {
      console.error('Google session exchange error:', error);
      Alert.alert('Google Login', 'Unable to complete sign-in. Please try again.');
    } finally {
      setGoogleLoading(false);
    }
  };

  const checkSalesforceCallback = async () => {
    try {
      // On web, check URL parameters for SF OAuth callback
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const sfToken = params.get('sf_token');
        const sfUser = params.get('sf_user');
        const sfSuccess = params.get('sf_success');
        const sfError = params.get('sf_error');
        
        if (sfError) {
          Alert.alert(
            'Salesforce Login', 
            'Salesforce authentication was not completed. Please use the demo credentials to sign in.',
            [{ text: 'OK' }]
          );
          setShowCredentialForm(true);
          // Clean URL
          window.history.replaceState({}, '', window.location.pathname);
          return;
        }
        
        if (sfSuccess === 'true' && sfToken && sfUser) {
          try {
            const technician = JSON.parse(decodeURIComponent(sfUser));
            await AsyncStorage.setItem('authToken', sfToken);
            await AsyncStorage.setItem('technician', JSON.stringify(technician));
            await AsyncStorage.setItem('loginSource', 'salesforce');
            
            // Clean URL
            window.history.replaceState({}, '', window.location.pathname);
            
            // Navigate based on profile status
            await navigateAfterAuth();
            return;
          } catch (e) {
            console.error('Error parsing SF callback data:', e);
          }
        }
      }
      
      // On native, check for deep link with SF callback data
      // This handles the case where the app is opened via deep link
      if (Platform.OS !== 'web') {
        const url = await Linking.getInitialURL();
        if (url) {
          console.log('[SF Callback] Initial URL:', url);
          if (url.includes('sf_token=') || url.includes('sf_success=') || url.includes('sf_error=')) {
            await processSalesforceNativeCallback(url);
          }
        }
      }
    } catch (error) {
      console.error('SF callback check error:', error);
    }
  };

  // Try auto-login with Face ID when app opens (if credentials exist)
  useEffect(() => {
    if (autoLoginChecked && biometricAvailable && hasSavedCredentials) {
      attemptAutoFaceID();
    }
  }, [autoLoginChecked, biometricAvailable, hasSavedCredentials]);

  const checkBiometricSupport = async () => {
    try {
      const compatible = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(compatible && enrolled);
    } catch (error) {
      console.error('Biometric check error:', error);
    }
  };

  // Helper: navigate after auth - show splash video first, then go to home
  const navigateAfterAuth = async () => {
    setShowSplashVideo(true);
    // Start fade-in animation for branding overlay
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.delay(500),
      Animated.timing(textFadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]).start();
  };

  const handleVideoEnd = () => {
    // Fade out and navigate
    Animated.timing(fadeAnim, { toValue: 0, duration: 400, useNativeDriver: true }).start(() => {
      setShowSplashVideo(false);
      router.replace('/(tabs)/home');
    });
  };

  const handleSkipVideo = () => {
    setShowSplashVideo(false);
    router.replace('/(tabs)/home');
  };

  const handleVideoError = () => {
    console.log('Video failed to load, skipping splash');
    // If video fails to load, just navigate after a short delay
    setTimeout(() => {
      setShowSplashVideo(false);
      router.replace('/(tabs)/home');
    }, 2000);
  };

  const loadSavedCredentials = async () => {
    try {
      const savedToken = await AsyncStorage.getItem('authToken');
      const savedTechnician = await AsyncStorage.getItem('technician');
      const biometricEnabled = await AsyncStorage.getItem('biometricEnabled');
      const savedUsername = await AsyncStorage.getItem('savedUsername');
      const savedRememberMe = await AsyncStorage.getItem('rememberMe');
      
      // Face ID is available if there's a saved session
      if (savedToken && savedTechnician && biometricEnabled === 'true') {
        setHasSavedCredentials(true);
      }
      
      // Pre-fill email if Remember Me was checked
      if (savedUsername && savedRememberMe === 'true') {
        setEmail(savedUsername);
        setUsername(savedUsername);
        setRememberMe(true);
      }
    } catch (error) {
      console.error('Load credentials error:', error);
    }
  };

  const attemptAutoFaceID = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Login to Blue Box Air',
        fallbackLabel: 'Use Password',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        const savedToken = await AsyncStorage.getItem('authToken');
        const savedTechnician = await AsyncStorage.getItem('technician');
        
        if (savedToken && savedTechnician) {
          await navigateAfterAuth();
        }
      }
    } catch (error) {
      // Silently fail - user can still use password
      console.log('Auto Face ID skipped:', error);
    }
  };

  const handleBiometricLogin = async () => {
    // Check if biometrics are available on this device
    if (!biometricAvailable) {
      Alert.alert(
        'Face ID / Biometric',
        'Biometric authentication is available on your mobile device. Please login with your credentials or Google first, then Face ID will be enabled for future logins.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!hasSavedCredentials) {
      Alert.alert(
        'Face ID Setup',
        'Please login with your credentials, Google, or Salesforce first. Face ID will be automatically enabled for your next login.',
        [{ text: 'OK' }]
      );
      return;
    }

    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Login to Blue Box Air',
        fallbackLabel: 'Use Password',
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });

      if (result.success) {
        // Get saved credentials
        const savedToken = await AsyncStorage.getItem('authToken');
        const savedTechnician = await AsyncStorage.getItem('technician');
        
        if (savedToken && savedTechnician) {
          await navigateAfterAuth();
        } else {
          Alert.alert('Session Expired', 'Your saved session has expired. Please login again.');
        }
      }
    } catch (error) {
      console.error('Biometric auth error:', error);
      Alert.alert('Biometric Error', 'Authentication failed. Please try again or use another login method.');
    }
  };

  const handleSalesforceLogin = async () => {
    setSfLoading(true);
    try {
      // Generate the redirect URI for the current platform
      // On native (Expo Go / standalone), this uses the correct scheme
      // On web, we'll handle it via page redirect
      const nativeRedirectUri = Platform.OS !== 'web'
        ? AuthSession.makeRedirectUri({ scheme: 'blueboxairtech', path: 'auth' })
        : '';

      // Get the Salesforce auth URL from the backend, passing mobile redirect if native
      const initUrl = Platform.OS !== 'web'
        ? `${API_URL}/api/auth/salesforce/init?mobile_redirect=${encodeURIComponent(nativeRedirectUri)}`
        : `${API_URL}/api/auth/salesforce/init`;

      const response = await fetch(initUrl);
      const data = await response.json();
      
      if (!data.auth_url) {
        Alert.alert(
          'Salesforce Login', 
          'Salesforce SSO is available for Blue Box Air employees. If you are not a company employee, please use the credentials login below.',
          [{ text: 'OK' }]
        );
        setSfLoading(false);
        setShowCredentialForm(true);
        return;
      }
      
      const authUrl = data.auth_url;
      
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // On web, navigate directly to Salesforce login page
        window.location.href = authUrl;
      } else {
        // On native, use openAuthSessionAsync to capture the redirect back to the app
        console.log('[SF Auth] Opening auth session with redirect:', nativeRedirectUri);
        const result = await WebBrowser.openAuthSessionAsync(authUrl, nativeRedirectUri);
        console.log('[SF Auth] Result:', JSON.stringify(result));
        
        if (result.type === 'success' && result.url) {
          // Parse the redirect URL for SF auth data
          await processSalesforceNativeCallback(result.url);
        } else if (result.type === 'cancel' || result.type === 'dismiss') {
          console.log('[SF Auth] User cancelled');
          Alert.alert('Salesforce Login', 'Login was cancelled. You can try again or use another login method.');
        }
      }
    } catch (error) {
      console.error('Salesforce OAuth error:', error);
      Alert.alert(
        'Salesforce Login', 
        'Unable to reach Salesforce. You can login with your credentials below.',
        [{ text: 'OK' }]
      );
      setShowCredentialForm(true);
    } finally {
      setSfLoading(false);
    }
  };

  // Process Salesforce OAuth callback from native auth session
  const processSalesforceNativeCallback = async (url: string) => {
    try {
      console.log('[SF Native Callback] Processing URL:', url);
      
      // Parse query parameters from the redirect URL
      const urlObj = new URL(url);
      const sfToken = urlObj.searchParams.get('sf_token');
      const sfUser = urlObj.searchParams.get('sf_user');
      const sfSuccess = urlObj.searchParams.get('sf_success');
      const sfError = urlObj.searchParams.get('sf_error');

      if (sfError) {
        Alert.alert(
          'Salesforce Login',
          `Salesforce authentication failed: ${decodeURIComponent(sfError)}\n\nPlease try again or use the credentials login.`,
          [{ text: 'OK' }]
        );
        setShowCredentialForm(true);
        return;
      }

      if (sfSuccess === 'true' && sfToken && sfUser) {
        const technician = JSON.parse(decodeURIComponent(sfUser));
        await AsyncStorage.setItem('authToken', sfToken);
        await AsyncStorage.setItem('technician', JSON.stringify(technician));
        await AsyncStorage.setItem('loginSource', 'salesforce');

        if (biometricAvailable) {
          await AsyncStorage.setItem('biometricEnabled', 'true');
        }

        // Trigger background Salesforce sync
        triggerSalesforceSync(sfToken);

        await navigateAfterAuth();
      } else {
        Alert.alert('Salesforce Login', 'Authentication response was incomplete. Please try again.');
      }
    } catch (error) {
      console.error('SF native callback processing error:', error);
      Alert.alert('Salesforce Login', 'Failed to process login. Please try again.');
    }
  };

  // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        // On web: redirect to Emergent Auth with current origin as redirect
        const redirectUrl = window.location.origin;
        window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      } else {
        // On native: use openAuthSessionAsync to capture the Google redirect
        const nativeRedirectUri = AuthSession.makeRedirectUri({ scheme: 'blueboxairtech', path: 'google-auth' });
        console.log('[Google Auth] Native redirect URI:', nativeRedirectUri);
        
        const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(nativeRedirectUri)}`;
        console.log('[Google Auth] Opening auth session...');
        
        const result = await WebBrowser.openAuthSessionAsync(authUrl, nativeRedirectUri);
        console.log('[Google Auth] Result:', JSON.stringify(result));
        
        if (result.type === 'success' && result.url) {
          // Extract session_id from the redirect URL
          // The URL might have session_id as a hash fragment or query param
          const resultUrl = result.url;
          let sessionId = '';
          
          // Check hash fragment first: ...#session_id=abc123
          if (resultUrl.includes('#session_id=')) {
            sessionId = resultUrl.split('session_id=')[1]?.split('&')[0] || '';
          }
          // Also check query params: ...?session_id=abc123
          if (!sessionId && resultUrl.includes('session_id=')) {
            sessionId = resultUrl.split('session_id=')[1]?.split('&')[0]?.split('#')[0] || '';
          }
          
          if (sessionId) {
            console.log('[Google Auth] Got session_id, exchanging with backend...');
            await processGoogleSession(sessionId);
          } else {
            console.log('[Google Auth] No session_id in URL:', resultUrl);
            Alert.alert('Google Login', 'No authentication token received. Please try again.');
            setGoogleLoading(false);
          }
        } else if (result.type === 'cancel' || result.type === 'dismiss') {
          console.log('[Google Auth] User cancelled');
          setGoogleLoading(false);
        } else {
          setGoogleLoading(false);
        }
      }
    } catch (error) {
      console.error('Google Login error:', error);
      Alert.alert('Google Login', 'Unable to open Google sign-in. Please try again or use credentials.');
      setGoogleLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!registerName.trim()) {
      Alert.alert('Registration', 'Please enter your full name.');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Registration', 'Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Registration', 'Password must be at least 6 characters.');
      return;
    }

    setRegisterLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: registerName.trim(),
          email: email.trim().toLowerCase(),
          password: password,
          phone: registerPhone.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        await AsyncStorage.setItem('authToken', data.token);
        await AsyncStorage.setItem('technician', JSON.stringify(data.technician));
        await AsyncStorage.setItem('loginSource', 'registered');

        if (biometricAvailable) {
          await AsyncStorage.setItem('biometricEnabled', 'true');
        }

        await navigateAfterAuth();
      } else if (response.status === 409) {
        Alert.alert('Account Exists', data.detail || 'An account with this email already exists. Please sign in.');
        setIsRegisterMode(false);
      } else {
        Alert.alert('Registration Failed', data.detail || 'Unable to create account. Please try again.');
      }
    } catch (error: any) {
      console.error('Registration error:', error);
      Alert.alert('Error', 'Unable to connect. Please check your internet connection.');
    } finally {
      setRegisterLoading(false);
    }
  };

  const triggerSalesforceSync = async (token: string) => {
    try {
      // Run syncs in parallel in the background
      const syncUrls = [
        `${API_URL}/api/salesforce/sync-profile?token=${encodeURIComponent(token)}`,
        `${API_URL}/api/salesforce/sync-users?token=${encodeURIComponent(token)}`,
        `${API_URL}/api/salesforce/sync-opportunities?token=${encodeURIComponent(token)}`,
      ];
      await Promise.allSettled(syncUrls.map(url => fetch(url)));
      console.log('Salesforce sync completed');
    } catch (error) {
      console.log('Salesforce sync error (non-blocking):', error);
    }
  };

  const handleLogin = async () => {
    const loginEmail = email.trim() || username.trim();
    if (!loginEmail || !password.trim()) {
      Alert.alert('Sign In', 'Please enter your email and password.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginEmail, password }),
      });

      const data = await response.json();
      
      if (data.success) {
        await AsyncStorage.setItem('authToken', data.token);
        await AsyncStorage.setItem('technician', JSON.stringify(data.technician));
        await AsyncStorage.setItem('loginSource', data.source || 'registered');
        
        // Always enable biometric login for next time
        if (biometricAvailable) {
          await AsyncStorage.setItem('biometricEnabled', 'true');
        }
        
        // Save credentials if Remember Me is checked
        if (rememberMe) {
          await AsyncStorage.setItem('savedUsername', loginEmail);
          await AsyncStorage.setItem('rememberMe', 'true');
        } else {
          await AsyncStorage.removeItem('savedUsername');
          await AsyncStorage.setItem('rememberMe', 'false');
        }
        
        // Trigger Salesforce sync only if logged in via Salesforce (non-blocking)
        if (data.token && data.source === 'salesforce') {
          triggerSalesforceSync(data.token);
        }
        
        // Navigate based on profile completion status
        await navigateAfterAuth();
      } else {
        // Show detailed error with hint for Salesforce auth issues
        const errorMsg = data.detail || data.message || 'Invalid credentials';
        Alert.alert(
          'Login Failed', 
          `${errorMsg}\n\nIf you are a Blue Box Air employee, try the "Login with Salesforce" button above for SSO login.`
        );
      }
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('Error', 'Unable to connect to server. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Show loading overlay during Google OAuth callback processing
  if (googleLoading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <BlueBoxLogo size={90} />
        <ActivityIndicator size="large" color={COLORS.lime} style={{ marginTop: 24 }} />
        <Text style={{ color: COLORS.lime, fontSize: 16, fontWeight: '600', marginTop: 16 }}>
          Signing in with Google...
        </Text>
        <Text style={{ color: COLORS.gray, fontSize: 12, marginTop: 8 }}>
          Syncing with Salesforce
        </Text>
      </SafeAreaView>
    );
  }

  // Show splash video after login
  if (showSplashVideo) {
    return (
      <View style={splashStyles.container}>
        <Video
          ref={videoRef}
          source={{ uri: SPLASH_VIDEO_URL }}
          style={splashStyles.video}
          resizeMode={ResizeMode.COVER}
          shouldPlay={true}
          isLooping={false}
          isMuted={true}
          onPlaybackStatusUpdate={(status: any) => {
            if (status.didJustFinish) {
              handleVideoEnd();
            }
          }}
          onError={handleVideoError}
        />
        {/* Dark overlay for readability */}
        <View style={splashStyles.overlay} />
        {/* Branding overlay */}
        <Animated.View style={[splashStyles.brandingContainer, { opacity: fadeAnim }]}>
          <BlueBoxLogo size={90} />
          <Animated.View style={[splashStyles.textContainer, { opacity: textFadeAnim }]}>
            <Text style={splashStyles.brandTitle}>BLUE BOX AIR</Text>
            <Text style={splashStyles.brandSubtitle}>Coil Management Solutions</Text>
            <View style={splashStyles.loadingRow}>
              <ActivityIndicator size="small" color={COLORS.lime} />
              <Text style={splashStyles.loadingText}>Loading your workspace...</Text>
            </View>
          </Animated.View>
        </Animated.View>
        {/* Skip button */}
        <TouchableOpacity style={splashStyles.skipButton} onPress={handleSkipVideo} activeOpacity={0.7}>
          <Text style={splashStyles.skipText}>Skip</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.white} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo and Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <BlueBoxLogo size={110} />
            </View>
            <Text style={styles.title}>Blue Box Air, Inc-</Text>
            <Text style={styles.tagline}>Coil Management Solutions</Text>
          </View>

          {/* Login Form */}
          <View style={styles.form}>
            {/* Primary: Salesforce OAuth Login */}
            <TouchableOpacity
              style={styles.sfLoginButton}
              onPress={handleSalesforceLogin}
              disabled={sfLoading}
            >
              {sfLoading ? (
                <ActivityIndicator color={COLORS.navy} />
              ) : (
                <>
                  <Ionicons name="cloud-outline" size={22} color={COLORS.navy} />
                  <Text style={styles.sfLoginButtonText}>Login with Salesforce</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={{ color: COLORS.grayDark, fontSize: 11, textAlign: 'center', marginTop: 4 }}>
              For Blue Box Air employees with Salesforce accounts
            </Text>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Sign In / Create Account Toggle */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginVertical: 6, gap: 4 }}>
              <TouchableOpacity
                style={{
                  paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20,
                  backgroundColor: !isRegisterMode ? COLORS.navyLight : 'transparent',
                  borderWidth: 1, borderColor: !isRegisterMode ? COLORS.lime + '40' : COLORS.grayDark,
                }}
                onPress={() => { setIsRegisterMode(false); setShowCredentialForm(true); }}
              >
                <Text style={{ color: !isRegisterMode ? COLORS.lime : COLORS.gray, fontWeight: '600', fontSize: 13 }}>Sign In</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{
                  paddingVertical: 10, paddingHorizontal: 20, borderRadius: 20,
                  backgroundColor: isRegisterMode ? COLORS.navyLight : 'transparent',
                  borderWidth: 1, borderColor: isRegisterMode ? COLORS.lime + '40' : COLORS.grayDark,
                }}
                onPress={() => { setIsRegisterMode(true); setShowCredentialForm(true); }}
              >
                <Text style={{ color: isRegisterMode ? COLORS.lime : COLORS.gray, fontWeight: '600', fontSize: 13 }}>Create Account</Text>
              </TouchableOpacity>
            </View>

            {/* Credential / Registration Form - always visible when tab selected */}
            {showCredentialForm && (
              <View style={styles.credentialForm}>
                {/* Registration: Full Name field */}
                {isRegisterMode && (
                  <View style={styles.inputContainer}>
                    <Ionicons name="person-outline" size={22} color={COLORS.gray} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Full Name"
                      placeholderTextColor={COLORS.grayDark}
                      value={registerName}
                      onChangeText={setRegisterName}
                      autoCapitalize="words"
                    />
                  </View>
                )}

                <View style={styles.inputContainer}>
                  <Ionicons name="mail-outline" size={22} color={COLORS.gray} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Email"
                    placeholderTextColor={COLORS.grayDark}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                  />
                </View>

                <View style={styles.inputContainer}>
                  <Ionicons name="lock-closed-outline" size={22} color={COLORS.gray} style={styles.inputIcon} />
                  <TextInput
                    style={styles.input}
                    placeholder="Password"
                    placeholderTextColor={COLORS.grayDark}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                    <Ionicons 
                      name={showPassword ? "eye-off-outline" : "eye-outline"} 
                      size={22} 
                      color={COLORS.gray} 
                    />
                  </TouchableOpacity>
                </View>

                {/* Registration: Phone field */}
                {isRegisterMode && (
                  <View style={styles.inputContainer}>
                    <Ionicons name="call-outline" size={22} color={COLORS.gray} style={styles.inputIcon} />
                    <TextInput
                      style={styles.input}
                      placeholder="Phone (optional)"
                      placeholderTextColor={COLORS.grayDark}
                      value={registerPhone}
                      onChangeText={setRegisterPhone}
                      keyboardType="phone-pad"
                    />
                  </View>
                )}

                {/* Remember Me (only for sign in) */}
                {!isRegisterMode && (
                  <TouchableOpacity 
                    style={styles.rememberMeContainer}
                    onPress={() => setRememberMe(!rememberMe)}
                  >
                    <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                      {rememberMe && <Ionicons name="checkmark" size={14} color={COLORS.navy} />}
                    </View>
                    <Text style={styles.rememberMeText}>Remember me</Text>
                  </TouchableOpacity>
                )}

                {/* Login or Register Button */}
                {isRegisterMode ? (
                  <TouchableOpacity
                    style={[styles.loginButton, (registerLoading || !registerName.trim() || !email.trim() || password.length < 6) && styles.loginButtonDisabled]}
                    onPress={handleRegister}
                    disabled={registerLoading || !registerName.trim() || !email.trim() || password.length < 6}
                  >
                    {registerLoading ? (
                      <ActivityIndicator color={COLORS.navy} />
                    ) : (
                      <>
                        <Ionicons name="person-add-outline" size={22} color={COLORS.navy} />
                        <Text style={styles.loginButtonText}>Create Account</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.loginButton, (loading || !email.trim() || !password.trim()) && styles.loginButtonDisabled]}
                    onPress={handleLogin}
                    disabled={loading || !email.trim() || !password.trim()}
                  >
                    {loading ? (
                      <ActivityIndicator color={COLORS.navy} />
                    ) : (
                      <>
                        <Ionicons name="log-in-outline" size={22} color={COLORS.navy} />
                        <Text style={styles.loginButtonText}>Sign In</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}

                {/* Toggle link */}
                <TouchableOpacity onPress={() => setIsRegisterMode(!isRegisterMode)} style={{ marginTop: 10, alignItems: 'center' }}>
                  <Text style={{ color: COLORS.lime, fontSize: 13 }}>
                    {isRegisterMode ? 'Already have an account? Sign In' : "Don't have an account? Create one"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Alternative Login Options */}
            <View style={styles.alternativeLogins}>
              {/* Google Login */}
              <TouchableOpacity 
                style={styles.socialButton}
                onPress={handleGoogleLogin}
                disabled={googleLoading}
              >
                {googleLoading ? (
                  <ActivityIndicator size="small" color={COLORS.google} />
                ) : (
                  <Ionicons name="logo-google" size={22} color={COLORS.google} />
                )}
                <Text style={styles.socialButtonText}>
                  {googleLoading ? 'Signing in...' : 'Google'}
                </Text>
              </TouchableOpacity>

              {/* Face ID / Touch ID - always show on supported platforms */}
              {(biometricAvailable || Platform.OS === 'ios' || Platform.OS === 'android') && (
                <TouchableOpacity 
                  style={[styles.socialButton, !hasSavedCredentials && { opacity: 0.5 }]}
                  onPress={handleBiometricLogin}
                  disabled={!hasSavedCredentials && !biometricAvailable}
                >
                  <Ionicons 
                    name={Platform.OS === 'ios' ? "scan-outline" : "finger-print-outline"} 
                    size={22} 
                    color={COLORS.lime} 
                  />
                  <Text style={styles.socialButtonText}>
                    {Platform.OS === 'ios' ? 'Face ID' : 'Biometric'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Footer Info */}
          <View style={styles.footer}>
            <View style={styles.mockBadge}>
              <Ionicons name="shield-checkmark-outline" size={16} color={COLORS.lime} />
              <Text style={styles.mockText}>Secured with Salesforce OAuth</Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.navy,
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 18,
    color: COLORS.lime,
    fontWeight: '500',
    marginTop: 4,
  },
  tagline: {
    fontSize: 13,
    color: COLORS.gray,
    fontWeight: '400',
    marginTop: 6,
    letterSpacing: 1.5,
  },
  form: {
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.navyLight,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    height: 52,
    fontSize: 16,
    color: COLORS.white,
  },
  rememberMeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 4,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.gray,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: COLORS.lime,
    borderColor: COLORS.lime,
  },
  rememberMeText: {
    fontSize: 14,
    color: COLORS.gray,
  },
  loginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.lime,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 10,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.navy,
  },
  sfLoginButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.lime,
    borderRadius: 12,
    paddingVertical: 16,
    gap: 10,
    marginBottom: 4,
  },
  sfLoginButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.navy,
  },
  credentialToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 8,
    marginBottom: 8,
  },
  credentialToggleText: {
    fontSize: 14,
    color: COLORS.gray,
    fontWeight: '500',
  },
  credentialForm: {
    marginBottom: 8,
  },
  credentialButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1.5,
    borderColor: COLORS.lime,
    marginBottom: 4,
  },
  credentialButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.lime,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2d4a6f',
  },
  dividerText: {
    color: COLORS.grayDark,
    paddingHorizontal: 16,
    fontSize: 14,
  },
  alternativeLogins: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  socialButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.navyLight,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  socialButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.white,
  },
  footer: {
    alignItems: 'center',
  },
  mockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(197, 217, 61, 0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 8,
  },
  mockText: {
    fontSize: 13,
    color: COLORS.lime,
    fontWeight: '500',
  },
});

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 39, 68, 0.55)',
  },
  brandingContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 60,
  },
  textContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 3,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  brandSubtitle: {
    fontSize: 15,
    color: COLORS.lime,
    fontWeight: '600',
    marginTop: 6,
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 30,
    gap: 10,
  },
  loadingText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  skipButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 40,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 4,
  },
  skipText: {
    fontSize: 14,
    color: COLORS.white,
    fontWeight: '600',
  },
});
