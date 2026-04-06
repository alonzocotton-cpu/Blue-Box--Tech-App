import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

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

  useEffect(() => {
    initializeLogin();
  }, []);

  const initializeLogin = async () => {
    await checkBiometricSupport();
    await loadSavedCredentials();
    setAutoLoginChecked(true);
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
          router.replace('/(tabs)/home');
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
          router.replace('/(tabs)/home');
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
        
        router.replace('/(tabs)/home');
      } else {
        Alert.alert('Login Failed', data.message || 'Invalid Salesforce credentials. Please check your username and password.');
      }
    } catch (error) {
      console.error('Login error:', error);
      Alert.alert('Error', 'Unable to connect to server');
    } finally {
      setLoading(false);
    }
  };

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

            {/* Salesforce Login Button */}
            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color={COLORS.navy} />
              ) : (
                <>
                  <Ionicons name="cloud-outline" size={22} color={COLORS.navy} />
                  <Text style={styles.loginButtonText}>Sign in with Salesforce</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.divider}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

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
              <Ionicons name="information-circle-outline" size={16} color={COLORS.lime} />
              <Text style={styles.mockText}>Demo Mode - Any credentials work</Text>
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
