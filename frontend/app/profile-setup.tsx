import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

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
  red: '#ef4444',
};

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

export default function ProfileSetupScreen() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [supervisor, setSupervisor] = useState('');
  const [profilePhoto, setProfilePhoto] = useState('');
  const [showPositionPicker, setShowPositionPicker] = useState(false);
  const [showSupervisorPicker, setShowSupervisorPicker] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const handleSubmit = async () => {
    if (!firstName.trim()) {
      Alert.alert('Required', 'Please enter your first name');
      return;
    }
    if (!lastName.trim()) {
      Alert.alert('Required', 'Please enter your last name');
      return;
    }
    if (!position) {
      Alert.alert('Required', 'Please select your position');
      return;
    }

    setSaving(true);
    try {
      const techStr = await AsyncStorage.getItem('technician');
      const existingTech = techStr ? JSON.parse(techStr) : {};

      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      const profilePayload = {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        full_name: fullName,
        position,
        title: position,
        supervisor,
        phone: phone.trim(),
        profile_photo: profilePhoto,
        email: existingTech.email || '',
        profile_completed: true,
      };

      const response = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profilePayload),
      });

      const data = await response.json();

      if (data.success) {
        // Update stored technician with new profile data
        const updatedTech = {
          ...existingTech,
          ...profilePayload,
        };
        await AsyncStorage.setItem('technician', JSON.stringify(updatedTech));
        router.replace('/(tabs)/home');
      } else {
        Alert.alert('Error', data.detail || 'Failed to save profile');
      }
    } catch (error) {
      console.error('Profile setup error:', error);
      Alert.alert('Error', 'Failed to save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoRow}>
              <Image
                source={{ uri: 'https://customer-assets.emergentagent.com/job_ff19b27f-9c44-4d68-b174-1452a3057557/artifacts/jz43di8v_IMG_2827.jpeg' }}
                style={styles.logo}
                resizeMode="contain"
              />
              <Text style={styles.brandName}>BLUE BOX</Text>
            </View>
            <Text style={styles.title}>Complete Your Profile</Text>
            <Text style={styles.subtitle}>
              Let's get you set up so your team can find you
            </Text>
          </View>

          {/* Profile Photo */}
          <TouchableOpacity style={styles.photoContainer} onPress={pickPhoto}>
            {profilePhoto ? (
              <Image source={{ uri: profilePhoto }} style={styles.photoImage} />
            ) : (
              <View style={styles.photoPlaceholder}>
                <Ionicons name="camera" size={32} color={COLORS.lime} />
              </View>
            )}
            <View style={styles.photoBadge}>
              <Ionicons name="add" size={16} color={COLORS.navy} />
            </View>
          </TouchableOpacity>
          <Text style={styles.photoHint}>Tap to add profile photo</Text>

          {/* Form */}
          <View style={styles.formSection}>
            {/* First Name */}
            <Text style={styles.label}>First Name *</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={18} color={COLORS.grayDark} />
              <TextInput
                style={styles.input}
                placeholder="Enter your first name"
                placeholderTextColor={COLORS.grayDark}
                value={firstName}
                onChangeText={setFirstName}
                autoCapitalize="words"
              />
            </View>

            {/* Last Name */}
            <Text style={styles.label}>Last Name *</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="person-outline" size={18} color={COLORS.grayDark} />
              <TextInput
                style={styles.input}
                placeholder="Enter your last name"
                placeholderTextColor={COLORS.grayDark}
                value={lastName}
                onChangeText={setLastName}
                autoCapitalize="words"
              />
            </View>

            {/* Position Dropdown */}
            <Text style={styles.label}>Position *</Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => {
                setShowPositionPicker(!showPositionPicker);
                setShowSupervisorPicker(false);
              }}
            >
              <Ionicons name="briefcase-outline" size={18} color={COLORS.grayDark} />
              <Text style={position ? styles.dropdownText : styles.dropdownPlaceholder}>
                {position || 'Select your position'}
              </Text>
              <Ionicons
                name={showPositionPicker ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={COLORS.grayDark}
              />
            </TouchableOpacity>
            {showPositionPicker && (
              <View style={styles.dropdownList}>
                {POSITIONS.map((pos) => (
                  <TouchableOpacity
                    key={pos}
                    style={[
                      styles.dropdownOption,
                      position === pos && styles.dropdownOptionSelected,
                    ]}
                    onPress={() => {
                      setPosition(pos);
                      setShowPositionPicker(false);
                    }}
                  >
                    <Ionicons
                      name={position === pos ? 'checkmark-circle' : 'ellipse-outline'}
                      size={18}
                      color={position === pos ? COLORS.lime : COLORS.grayDark}
                    />
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        position === pos && styles.dropdownOptionTextSelected,
                      ]}
                    >
                      {pos}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Supervisor / Operations Manager Dropdown */}
            <Text style={styles.label}>Supervisor / Operations Manager</Text>
            <TouchableOpacity
              style={styles.dropdownButton}
              onPress={() => {
                setShowSupervisorPicker(!showSupervisorPicker);
                setShowPositionPicker(false);
              }}
            >
              <Ionicons name="shield-outline" size={18} color={COLORS.grayDark} />
              <Text style={supervisor ? styles.dropdownText : styles.dropdownPlaceholder}>
                {supervisor || 'Select your supervisor'}
              </Text>
              <Ionicons
                name={showSupervisorPicker ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={COLORS.grayDark}
              />
            </TouchableOpacity>
            {showSupervisorPicker && (
              <View style={styles.dropdownList}>
                {SUPERVISORS_MANAGERS.map((person) => (
                  <TouchableOpacity
                    key={person.name}
                    style={[
                      styles.dropdownOption,
                      supervisor === person.name && styles.dropdownOptionSelected,
                    ]}
                    onPress={() => {
                      setSupervisor(person.name);
                      setShowSupervisorPicker(false);
                    }}
                  >
                    <View style={styles.supervisorAvatar}>
                      <Text style={styles.supervisorInitial}>
                        {person.name.charAt(0)}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.dropdownOptionText,
                          supervisor === person.name && styles.dropdownOptionTextSelected,
                        ]}
                      >
                        {person.name}
                      </Text>
                      <Text style={styles.supervisorRole}>{person.role}</Text>
                    </View>
                    {supervisor === person.name && (
                      <Ionicons name="checkmark-circle" size={18} color={COLORS.lime} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Phone */}
            <Text style={styles.label}>Phone Number</Text>
            <View style={styles.inputContainer}>
              <Ionicons name="call-outline" size={18} color={COLORS.grayDark} />
              <TextInput
                style={styles.input}
                placeholder="(555) 123-4567"
                placeholderTextColor={COLORS.grayDark}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitButton, saving && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={COLORS.navy} />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={20} color={COLORS.navy} />
                <Text style={styles.submitButtonText}>Complete Profile</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.footerText}>
            Blue Box Air, Inc. · Coil Management Solutions
          </Text>
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
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  logo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    marginRight: 10,
  },
  brandName: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.grayDark,
    textAlign: 'center',
  },
  // Photo
  photoContainer: {
    alignSelf: 'center',
    marginBottom: 8,
    position: 'relative',
  },
  photoImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: COLORS.lime,
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.navyLight,
    borderWidth: 2,
    borderColor: COLORS.lime + '40',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.navy,
  },
  photoHint: {
    fontSize: 12,
    color: COLORS.grayDark,
    textAlign: 'center',
    marginBottom: 24,
  },
  // Form
  formSection: {
    gap: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gray,
    marginBottom: 6,
    marginTop: 12,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.navyLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: COLORS.white,
    marginLeft: 10,
    padding: 0,
  },
  // Dropdown
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.navyLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  dropdownText: {
    flex: 1,
    fontSize: 15,
    color: COLORS.white,
    marginLeft: 10,
  },
  dropdownPlaceholder: {
    flex: 1,
    fontSize: 15,
    color: COLORS.grayDark,
    marginLeft: 10,
  },
  dropdownList: {
    backgroundColor: COLORS.navyMid,
    borderRadius: 12,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#2d4a6f',
    overflow: 'hidden',
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e3a5f',
    gap: 10,
  },
  dropdownOptionSelected: {
    backgroundColor: COLORS.lime + '10',
  },
  dropdownOptionText: {
    fontSize: 15,
    color: COLORS.white,
  },
  dropdownOptionTextSelected: {
    color: COLORS.lime,
    fontWeight: '600',
  },
  supervisorAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.lime + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  supervisorInitial: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.lime,
  },
  supervisorRole: {
    fontSize: 11,
    color: COLORS.grayDark,
    marginTop: 1,
  },
  // Submit
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.lime,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 28,
    gap: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.navy,
  },
  footerText: {
    fontSize: 12,
    color: COLORS.grayDark,
    textAlign: 'center',
    marginTop: 20,
  },
});
