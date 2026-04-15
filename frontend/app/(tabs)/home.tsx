import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Platform,
  TextInput,
  KeyboardAvoidingView,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as ImagePicker from 'expo-image-picker';

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const COLORS = {
  navy: '#0f2744',
  navyLight: '#1a365d',
  navyMid: '#1e3a5f',
  lime: '#c5d93d',
  white: '#ffffff',
  gray: '#94a3b8',
  grayDark: '#64748b',
  green: '#22c55e',
  blue: '#3b82f6',
  purple: '#8b5cf6',
  orange: '#f59e0b',
};

const LOGO_URI = 'https://customer-assets.emergentagent.com/job_ff19b27f-9c44-4d68-b174-1452a3057557/artifacts/2vycib7s_IMG_2827.jpeg';

const POSITIONS = [
  'Operations Manager',
  'Senior Technician',
  'Junior Technician',
];

const SUPERVISORS_MANAGERS = [
  { name: 'Alonzo Cotton', role: 'Supervisor' },
  { name: 'Ramon Reyes', role: 'Operations Manager' },
  { name: 'Mizael Contreras', role: 'Operations Manager' },
  { name: 'Anthony Reddix', role: 'Operations Manager' },
];

export default function HomeScreen() {
  const [technician, setTechnician] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  // Profile setup state
  const [showProfileSetup, setShowProfileSetup] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [showPositionPicker, setShowPositionPicker] = useState(false);
  const [showSupervisorPicker, setShowSupervisorPicker] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
    registerForPushNotifications();

    // Listen for incoming notifications
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    // Listen for notification taps (navigate to project)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.type === 'new_project' && data?.salesforce_id) {
        router.push(`/project/${data.salesforce_id}`);
      }
    });

    return () => {
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  const registerForPushNotifications = async () => {
    try {
      if (Platform.OS === 'web') return; // Push not supported on web
      
      if (!Device.isDevice) {
        console.log('Push notifications require a physical device');
        return;
      }

      // Check existing permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Push notification permission not granted');
        return;
      }

      // Set notification channel for Android
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('project-assignments', {
          name: 'Project Assignments',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#a3e635',
          sound: 'default',
        });
      }

      // Get push token
      const tokenResult = await Notifications.getExpoPushTokenAsync({
        projectId: '5374137e-6924-4b8b-b7c2-f01b5ca3ac15',
      });
      const pushToken = tokenResult.data;
      console.log('Push token:', pushToken);

      // Get user info to register token
      const techData = await AsyncStorage.getItem('technician');
      const tech = techData ? JSON.parse(techData) : {};

      // Register token with backend
      await fetch(`${API_URL}/api/push-token/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          push_token: pushToken,
          user_id: tech.sf_id || tech.id || '',
          email: tech.email || '',
        }),
      });
      
      console.log('Push token registered successfully');
    } catch (error) {
      console.log('Push notification registration error:', error);
    }
  };

  const loadData = async () => {
    try {
      const [techData, statsRes] = await Promise.all([
        AsyncStorage.getItem('technician'),
        fetch(`${API_URL}/api/dashboard/stats`),
      ]);
      if (techData) {
        const tech = JSON.parse(techData);
        setTechnician(tech);
        
        // Check if first-time setup needed (no first_name means profile not completed)
        if (!tech.first_name || tech.first_name === '') {
          setShowProfileSetup(true);
          if (tech.phone) setPhone(tech.phone);
          if (tech.profile_photo) setProfilePhoto(tech.profile_photo);
        }
      }
      const statsData = await statsRes.json();
      setStats(statsData);
    } catch (error) {
      console.error('Error loading home data:', error);
    } finally {
      setLoading(false);
    }
  };

  const pickPhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const base64 = result.assets[0].base64
        ? `data:image/jpeg;base64,${result.assets[0].base64}`
        : result.assets[0].uri;
      setProfilePhoto(base64);
    }
  };

  const handleProfileSetup = async () => {
    if (!firstName.trim()) { Alert.alert('Required', 'Please enter your first name'); return; }
    if (!lastName.trim()) { Alert.alert('Required', 'Please enter your last name'); return; }
    if (!position) { Alert.alert('Required', 'Please select your position'); return; }

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/profile/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          position,
          supervisor,
          phone: phone.trim(),
          profile_photo: profilePhoto,
          email: technician?.email || '',
        }),
      });
      const data = await response.json();
      if (data.success) {
        const updatedTech = {
          ...technician,
          ...data.technician,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          full_name: `${firstName.trim()} ${lastName.trim()}`,
          position,
          title: position,
          supervisor,
          phone: phone.trim(),
          profile_photo: profilePhoto,
          profile_completed: true,
        };
        await AsyncStorage.setItem('technician', JSON.stringify(updatedTech));
        setTechnician(updatedTech);
        setShowProfileSetup(false);
      } else {
        Alert.alert('Error', data.detail || 'Failed to save profile');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.lime} />
        </View>
      </SafeAreaView>
    );
  }

  if (showProfileSetup) {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <Image source={{ uri: LOGO_URI }} style={{ width: 36, height: 36, borderRadius: 8, marginRight: 10 }} resizeMode="contain" />
                <Text style={{ fontSize: 20, fontWeight: '800', color: COLORS.white, letterSpacing: 2 }}>BLUE BOX</Text>
              </View>
              <Text style={{ fontSize: 24, fontWeight: '700', color: COLORS.white, marginBottom: 8 }}>Complete Your Profile</Text>
              <Text style={{ fontSize: 14, color: '#64748b', textAlign: 'center' }}>Let's get you set up so your team can find you</Text>
            </View>

            <TouchableOpacity style={{ alignSelf: 'center', marginBottom: 8 }} onPress={pickPhoto}>
              {profilePhoto ? (
                <Image source={{ uri: profilePhoto }} style={{ width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: COLORS.lime }} />
              ) : (
                <View style={{ width: 100, height: 100, borderRadius: 50, backgroundColor: '#1a365d', borderWidth: 2, borderColor: COLORS.lime + '40', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="camera" size={32} color={COLORS.lime} />
                </View>
              )}
              <View style={{ position: 'absolute', bottom: 0, right: 0, width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.lime, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: COLORS.navy }}>
                <Ionicons name="add" size={16} color={COLORS.navy} />
              </View>
            </TouchableOpacity>
            <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginBottom: 24 }}>Tap to add profile photo</Text>

            <Text style={setupStyles.label}>First Name *</Text>
            <View style={setupStyles.inputRow}>
              <Ionicons name="person-outline" size={18} color="#64748b" />
              <TextInput style={setupStyles.input} placeholder="Enter your first name" placeholderTextColor="#64748b" value={firstName} onChangeText={setFirstName} autoCapitalize="words" />
            </View>

            <Text style={setupStyles.label}>Last Name *</Text>
            <View style={setupStyles.inputRow}>
              <Ionicons name="person-outline" size={18} color="#64748b" />
              <TextInput style={setupStyles.input} placeholder="Enter your last name" placeholderTextColor="#64748b" value={lastName} onChangeText={setLastName} autoCapitalize="words" />
            </View>

            <Text style={setupStyles.label}>Position *</Text>
            <TouchableOpacity style={setupStyles.dropdown} onPress={() => { setShowPositionPicker(!showPositionPicker); setShowSupervisorPicker(false); }}>
              <Ionicons name="briefcase-outline" size={18} color="#64748b" />
              <Text style={position ? setupStyles.dropdownText : setupStyles.placeholder}>{position || 'Select your position'}</Text>
              <Ionicons name={showPositionPicker ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
            </TouchableOpacity>
            {showPositionPicker && (
              <View style={setupStyles.optionList}>
                {POSITIONS.map((pos) => (
                  <TouchableOpacity key={pos} style={[setupStyles.option, position === pos && setupStyles.optionSelected]} onPress={() => { setPosition(pos); setShowPositionPicker(false); }}>
                    <Ionicons name={position === pos ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={position === pos ? COLORS.lime : '#64748b'} />
                    <Text style={[setupStyles.optionText, position === pos && { color: COLORS.lime, fontWeight: '600' }]}>{pos}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={setupStyles.label}>Supervisor / Operations Manager</Text>
            <TouchableOpacity style={setupStyles.dropdown} onPress={() => { setShowSupervisorPicker(!showSupervisorPicker); setShowPositionPicker(false); }}>
              <Ionicons name="shield-outline" size={18} color="#64748b" />
              <Text style={supervisor ? setupStyles.dropdownText : setupStyles.placeholder}>{supervisor || 'Select your supervisor'}</Text>
              <Ionicons name={showSupervisorPicker ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
            </TouchableOpacity>
            {showSupervisorPicker && (
              <View style={setupStyles.optionList}>
                {SUPERVISORS_MANAGERS.map((person) => (
                  <TouchableOpacity key={person.name} style={[setupStyles.option, supervisor === person.name && setupStyles.optionSelected]} onPress={() => { setSupervisor(person.name); setShowSupervisorPicker(false); }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.lime + '20', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.lime }}>{person.name.charAt(0)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[setupStyles.optionText, supervisor === person.name && { color: COLORS.lime, fontWeight: '600' }]}>{person.name}</Text>
                      <Text style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{person.role}</Text>
                    </View>
                    {supervisor === person.name && <Ionicons name="checkmark-circle" size={18} color={COLORS.lime} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={setupStyles.label}>Phone Number</Text>
            <View style={setupStyles.inputRow}>
              <Ionicons name="call-outline" size={18} color="#64748b" />
              <TextInput style={setupStyles.input} placeholder="(555) 123-4567" placeholderTextColor="#64748b" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            </View>

            <TouchableOpacity style={[setupStyles.submitBtn, saving && { opacity: 0.6 }]} onPress={handleProfileSetup} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color={COLORS.navy} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color={COLORS.navy} />
                  <Text style={setupStyles.submitText}>Complete Profile</Text>
                </>
              )}
            </TouchableOpacity>
            <Text style={{ fontSize: 12, color: '#64748b', textAlign: 'center', marginTop: 20 }}>Blue Box Air, Inc. · Coil Management Solutions</Text>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image
            source={{ uri: LOGO_URI }}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <View>
            <Text style={styles.brandText}>BLUE BOX AIR</Text>
            <Text style={styles.brandSubtext}>Coil Management Solutions</Text>
          </View>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>
            Welcome back,{' '}
            <Text style={styles.welcomeName}>
              {technician?.first_name || technician?.full_name?.split(' ')[0] || 'Technician'}
            </Text>
          </Text>
          <Text style={styles.welcomeSub}>
            What would you like to do today?
          </Text>
        </View>

        {/* Quick Stats Row */}
        {stats && (
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.active || 0}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.total_equipment || 0}</Text>
              <Text style={styles.statLabel}>Equipment</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statNumber}>{stats.total_projects || 0}</Text>
              <Text style={styles.statLabel}>Projects</Text>
            </View>
          </View>
        )}

        {/* Dashboard Cards */}
        <View style={styles.cardsContainer}>
          {/* Projects Card */}
          <TouchableOpacity
            style={[styles.dashCard, styles.dashCardLarge]}
            onPress={() => router.push('/(tabs)/projects')}
            activeOpacity={0.8}
          >
            <View style={styles.dashCardInner}>
              <View style={[styles.dashCardIcon, { backgroundColor: COLORS.lime + '20' }]}>
                <Ionicons name="folder-open" size={32} color={COLORS.lime} />
              </View>
              <View style={styles.dashCardTextContainer}>
                <Text style={styles.dashCardTitle}>My Projects</Text>
                <Text style={styles.dashCardSub}>
                  {stats?.active || 0} active projects assigned
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={COLORS.grayDark} />
            </View>
          </TouchableOpacity>

          {/* AI Chat Card */}
          <TouchableOpacity
            style={[styles.dashCard, styles.dashCardLarge]}
            onPress={() => router.push('/(tabs)/chat')}
            activeOpacity={0.8}
          >
            <View style={styles.dashCardInner}>
              <View style={[styles.dashCardIcon, { backgroundColor: COLORS.purple + '20' }]}>
                <Ionicons name="chatbubbles" size={32} color={COLORS.purple} />
              </View>
              <View style={styles.dashCardTextContainer}>
                <Text style={styles.dashCardTitle}>AI Assistant</Text>
                <Text style={styles.dashCardSub}>
                  Get help with troubleshooting & HVAC issues
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={COLORS.grayDark} />
            </View>
          </TouchableOpacity>

          {/* Profile Card */}
          <TouchableOpacity
            style={[styles.dashCard, styles.dashCardLarge]}
            onPress={() => router.push('/(tabs)/profile')}
            activeOpacity={0.8}
          >
            <View style={styles.dashCardInner}>
              <View style={[styles.dashCardIcon, { backgroundColor: COLORS.blue + '20' }]}>
                <Ionicons name="person" size={32} color={COLORS.blue} />
              </View>
              <View style={styles.dashCardTextContainer}>
                <Text style={styles.dashCardTitle}>My Profile</Text>
                <Text style={styles.dashCardSub}>
                  View skills, settings & resources
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={COLORS.grayDark} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footerSection}>
          <Image
            source={{ uri: LOGO_URI }}
            style={styles.footerLogo}
            resizeMode="contain"
          />
          <Text style={styles.footerText}>Blue Box Air, Inc.</Text>
          <Text style={styles.footerSub}>Coil Management Solutions</Text>
        </View>
      </ScrollView>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.navy,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: COLORS.navyLight,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerLogo: {
    width: 36,
    height: 36,
    borderRadius: 8,
  },
  brandText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 2,
  },
  brandSubtext: {
    fontSize: 11,
    color: COLORS.gray,
    letterSpacing: 1,
    marginTop: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },
  welcomeSection: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 8,
  },
  welcomeText: {
    fontSize: 22,
    color: COLORS.gray,
    fontWeight: '400',
  },
  welcomeName: {
    color: COLORS.white,
    fontWeight: '700',
  },
  welcomeSub: {
    fontSize: 14,
    color: COLORS.grayDark,
    marginTop: 6,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.navyLight,
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 16,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.lime,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 4,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#2d4a6f',
  },
  cardsContainer: {
    paddingHorizontal: 20,
    marginTop: 24,
    gap: 14,
  },
  dashCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2d4a6f',
    overflow: 'hidden',
  },
  dashCardLarge: {
    minHeight: 88,
  },
  dashCardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    gap: 16,
  },
  dashCardIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashCardTextContainer: {
    flex: 1,
  },
  dashCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 4,
  },
  dashCardSub: {
    fontSize: 13,
    color: COLORS.gray,
    lineHeight: 18,
  },
  footerSection: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 20,
    opacity: 0.4,
  },
  footerLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
    marginBottom: 10,
  },
  footerText: {
    fontSize: 14,
    color: COLORS.gray,
    fontWeight: '600',
  },
  footerSub: {
    fontSize: 11,
    color: COLORS.grayDark,
    marginTop: 2,
  },
});

const setupStyles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#94a3b8', marginBottom: 6, marginTop: 12 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a365d', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1, borderColor: '#2d4a6f' },
  input: { flex: 1, fontSize: 15, color: '#ffffff', marginLeft: 10, padding: 0 },
  dropdown: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a365d', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, borderWidth: 1, borderColor: '#2d4a6f' },
  dropdownText: { flex: 1, fontSize: 15, color: '#ffffff', marginLeft: 10 },
  placeholder: { flex: 1, fontSize: 15, color: '#64748b', marginLeft: 10 },
  optionList: { backgroundColor: '#1e3a5f', borderRadius: 12, marginTop: 4, borderWidth: 1, borderColor: '#2d4a6f', overflow: 'hidden' },
  option: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#1e3a5f', gap: 10 },
  optionSelected: { backgroundColor: COLORS.lime + '10' },
  optionText: { fontSize: 15, color: '#ffffff' },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.lime, borderRadius: 12, paddingVertical: 16, marginTop: 28, gap: 8 },
  submitText: { fontSize: 16, fontWeight: '700', color: COLORS.navy },
});
