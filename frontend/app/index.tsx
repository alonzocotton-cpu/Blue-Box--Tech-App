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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import { Video, ResizeMode } from 'expo-av';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [autoLoginChecked, setAutoLoginChecked] = useState(false);
  const [showSplashVideo, setShowSplashVideo] = useState(false);
  const videoRef = useRef<any>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const textFadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    initializeLogin();
  }, []);

  const initializeLogin = async () => {
    // Check if we're returning from Salesforce OAuth callback
    await checkSalesforceCallback();
    await checkBiometricSupport();
    await loadSavedCredentials();
    setAutoLoginChecked(true);
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
          Alert.alert('Salesforce Login Failed', decodeURIComponent(sfError));
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
      
      // On native, check deep link for SF callback
      const url = await Linking.getInitialURL();
      if (url && url.includes('sf_token=')) {
        const urlParams = new URL(url);
        const sfToken = urlParams.searchParams.get('sf_token');
        const sfUser = urlParams.searchParams.get('sf_user');
        
        if (sfToken && sfUser) {
          const technician = JSON.parse(decodeURIComponent(sfUser));
          await AsyncStorage.setItem('authToken', sfToken);
          await AsyncStorage.setItem('technician', JSON.stringify(technician));
          await AsyncStorage.setItem('loginSource', 'salesforce');
          await navigateAfterAuth();
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
      
      // Pre-fill username if Remember Me was checked
      if (savedUsername && savedRememberMe === 'true') {
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
          // No saved session, do regular login
          Alert.alert('Info', 'Please login with your credentials first');
        }
      }
    } catch (error) {
      console.error('Biometric auth error:', error);
      Alert.alert('Error', 'Biometric authentication failed');
    }
  };

  const handleGoogleLogin = async () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    try {
      // For native app, we'll use a deep link scheme
      const redirectUrl = Platform.OS === 'web' 
        ? `${window.location.origin}/auth/callback` 
        : 'fieldtechconnect://auth/callback';
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      
      const supported = await Linking.canOpenURL(authUrl);
      if (supported) {
        await Linking.openURL(authUrl);
      } else {
        Alert.alert('Error', 'Cannot open Google login');
      }
    } catch (error) {
      console.error('Google login error:', error);
      Alert.alert('Error', 'Google login failed');
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
    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter username and password');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      
      if (data.success) {
        await AsyncStorage.setItem('authToken', data.token);
        await AsyncStorage.setItem('technician', JSON.stringify(data.technician));
        await AsyncStorage.setItem('loginSource', data.source || 'mock');
        
        // Always enable biometric login for next time
        if (biometricAvailable) {
          await AsyncStorage.setItem('biometricEnabled', 'true');
        }
        
        // Save credentials if Remember Me is checked
        if (rememberMe) {
          await AsyncStorage.setItem('savedUsername', username);
          await AsyncStorage.setItem('rememberMe', 'true');
        } else {
          await AsyncStorage.removeItem('savedUsername');
          await AsyncStorage.setItem('rememberMe', 'false');
        }
        
        // Trigger Salesforce sync in the background (non-blocking) BEFORE navigation
        if (data.token) {
          triggerSalesforceSync(data.token);
        }
        
        // Navigate based on profile completion status
        await navigateAfterAuth();
      } else {
        // Show detailed error with hint for Salesforce auth issues
        const errorMsg = data.message || 'Invalid credentials';
        const hint = data.hint || '';
        Alert.alert(
          'Login Failed', 
          hint ? `${errorMsg}\n\n${hint}` : errorMsg
        );
      }
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('Error', 'Unable to connect to server');
    } finally {
      setLoading(false);
    }
  };

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
        <View style={styles.content}>
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
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={22} color={COLORS.gray} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Username"
                placeholderTextColor={COLORS.grayDark}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
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

            {/* Remember Me */}
            <TouchableOpacity 
              style={styles.rememberMeContainer}
              onPress={() => setRememberMe(!rememberMe)}
            >
              <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                {rememberMe && <Ionicons name="checkmark" size={14} color={COLORS.navy} />}
              </View>
              <Text style={styles.rememberMeText}>Remember me</Text>
            </TouchableOpacity>

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.loginButton, (loading || !username.trim() || !password.trim()) && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loading || !username.trim() || !password.trim()}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.navy} />
              ) : (
                <>
                  <Ionicons name="log-in-outline" size={22} color={COLORS.navy} />
                  <Text style={styles.loginButtonText}>Login</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Alternative Login Options */}
            <View style={styles.alternativeLogins}>
              {/* Google Login */}
              <TouchableOpacity 
                style={styles.socialButton}
                onPress={handleGoogleLogin}
              >
                <Ionicons name="logo-google" size={22} color={COLORS.google} />
                <Text style={styles.socialButtonText}>Google</Text>
              </TouchableOpacity>

              {/* Face ID / Touch ID */}
              {biometricAvailable && (
                <TouchableOpacity 
                  style={styles.socialButton}
                  onPress={handleBiometricLogin}
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
        </View>
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
    flex: 1,
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
    paddingVertical: 16,
    gap: 10,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.navy,
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
