import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Switch,
  TextInput,
  Image,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Blue Box Air colors
const COLORS = {
  navy: '#0f2744',
  navyLight: '#1a365d',
  lime: '#c5d93d',
  white: '#ffffff',
  gray: '#94a3b8',
  grayDark: '#64748b',
  red: '#ef4444',
  green: '#22c55e',
  blue: '#3b82f6',
};

interface Technician {
  id: string;
  full_name: string;
  email: string;
  phone?: string;
  title?: string;
  company?: string;
  skills: string[];
  profile_photo?: string;
}

export default function ProfileScreen() {
  const [technician, setTechnician] = useState<Technician | null>(null);
  const [notifications, setNotifications] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    title: '',
    company: 'Blue Box Air, Inc.',
    skills: [] as string[],
  });
  const [newSkill, setNewSkill] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [activeProfileTab, setActiveProfileTab] = useState<'profile' | 'resources'>('profile');
  const [expandedResource, setExpandedResource] = useState<string | null>(null);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      // Try API first
      const response = await fetch(`${API_URL}/api/auth/profile`);
      const data = await response.json();
      setTechnician(data);
      setEditForm({
        full_name: data.full_name || '',
        email: data.email || '',
        phone: data.phone || '',
        title: data.title || 'Technician',
        company: data.company || 'Blue Box Air, Inc.',
        skills: data.skills || [],
      });
      if (data.profile_photo) {
        setProfilePhoto(data.profile_photo);
      }
    } catch (error) {
      // Fallback to AsyncStorage
      const stored = await AsyncStorage.getItem('technician');
      if (stored) {
        const data = JSON.parse(stored);
        setTechnician(data);
        setEditForm({
          full_name: data.full_name || '',
          email: data.email || '',
          phone: data.phone || '',
          title: data.title || 'Technician',
          company: data.company || 'Blue Box Air, Inc.',
          skills: data.skills || [],
        });
      }
    }
  };

  const pickProfilePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
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

  const takeProfilePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera access is needed for profile photo');
      return;
    }
    
    const result = await ImagePicker.launchCameraAsync({
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

  const showPhotoOptions = () => {
    Alert.alert('Profile Photo', 'Choose an option', [
      { text: 'Take Photo', onPress: takeProfilePhoto },
      { text: 'Choose from Gallery', onPress: pickProfilePhoto },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const addSkill = () => {
    if (newSkill.trim() && !editForm.skills.includes(newSkill.trim())) {
      setEditForm({ ...editForm, skills: [...editForm.skills, newSkill.trim()] });
      setNewSkill('');
    }
  };

  const removeSkill = (skill: string) => {
    setEditForm({ ...editForm, skills: editForm.skills.filter(s => s !== skill) });
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          profile_photo: profilePhoto,
        }),
      });
      const data = await response.json();
      if (data.success) {
        setTechnician(data.profile);
        await AsyncStorage.setItem('technician', JSON.stringify(data.profile));
        setEditing(false);
        Alert.alert('Success', 'Profile updated successfully');
      }
    } catch (error) {
      console.error('Save profile error:', error);
      Alert.alert('Error', 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('authToken');
            await AsyncStorage.removeItem('technician');
            router.replace('/');
          },
        },
      ]
    );
  };

  const MenuItem = ({
    icon,
    title,
    subtitle,
    onPress,
    showArrow = true,
    rightElement,
    color = COLORS.white,
  }: {
    icon: string;
    title: string;
    subtitle?: string;
    onPress?: () => void;
    showArrow?: boolean;
    rightElement?: React.ReactNode;
    color?: string;
  }) => (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={styles.menuItemLeft}>
        <View style={[styles.menuItemIcon, { backgroundColor: color + '20' }]}>
          <Ionicons name={icon as any} size={20} color={color} />
        </View>
        <View style={styles.menuItemText}>
          <Text style={[styles.menuItemTitle, { color: color }]}>{title}</Text>
          {subtitle && <Text style={styles.menuItemSubtitle}>{subtitle}</Text>}
        </View>
      </View>
      {rightElement ? rightElement : showArrow && onPress && (
        <Ionicons name="chevron-forward" size={20} color={COLORS.grayDark} />
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Image
            source={{ uri: 'https://customer-assets.emergentagent.com/job_ff19b27f-9c44-4d68-b174-1452a3057557/artifacts/jz43di8v_IMG_2827.jpeg' }}
            style={{ width: 36, height: 36, borderRadius: 8, marginRight: 10 }}
            resizeMode="contain"
          />
          <Text style={styles.brandText}>BLUE BOX</Text>
        </View>
        {activeProfileTab === 'profile' && !editing && (
          <TouchableOpacity onPress={() => setEditing(true)}>
            <Ionicons name="create-outline" size={24} color={COLORS.lime} />
          </TouchableOpacity>
        )}
      </View>

      {/* Profile / Resources Tab Switcher */}
      <View style={styles.profileTabSwitcher}>
        <TouchableOpacity
          style={[styles.profileTabBtn, activeProfileTab === 'profile' && styles.profileTabBtnActive]}
          onPress={() => setActiveProfileTab('profile')}
        >
          <Ionicons name="person" size={18} color={activeProfileTab === 'profile' ? COLORS.navy : COLORS.gray} />
          <Text style={[styles.profileTabBtnText, activeProfileTab === 'profile' && styles.profileTabBtnTextActive]}>
            Profile
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.profileTabBtn, activeProfileTab === 'resources' && styles.profileTabBtnActive]}
          onPress={() => setActiveProfileTab('resources')}
        >
          <Ionicons name="library" size={18} color={activeProfileTab === 'resources' ? COLORS.navy : COLORS.gray} />
          <Text style={[styles.profileTabBtnText, activeProfileTab === 'resources' && styles.profileTabBtnTextActive]}>
            Resources
          </Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          {activeProfileTab === 'resources' ? (
            /* ============ Resources Tab ============ */
            <View style={styles.resourcesContainer}>
              {/* Background Logo */}
              <View style={styles.resourcesBgContainer}>
                <Image
                  source={{ uri: 'https://customer-assets.emergentagent.com/job_ff19b27f-9c44-4d68-b174-1452a3057557/artifacts/2vycib7s_IMG_2827.jpeg' }}
                  style={styles.resourcesBgImage}
                  resizeMode="contain"
                />
              </View>
              
              <Text style={styles.resourcesTitle}>Blue Box Air Resources</Text>
              <Text style={styles.resourcesSubtitle}>Training materials, guides, and reference documents</Text>

              {/* Training Video */}
              <TouchableOpacity
                style={styles.resourceCard}
                onPress={() => setExpandedResource(expandedResource === 'training' ? null : 'training')}
                activeOpacity={0.7}
              >
                <View style={styles.resourceCardHeader}>
                  <View style={[styles.resourceIconBox, { backgroundColor: '#3b82f620' }]}>
                    <Ionicons name="videocam" size={24} color="#3b82f6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resourceCardTitle}>Training Video</Text>
                    <Text style={styles.resourceCardSub}>Equipment operation and best practices</Text>
                  </View>
                  <Ionicons name={expandedResource === 'training' ? 'chevron-up' : 'chevron-down'} size={22} color={COLORS.grayDark} />
                </View>
                {expandedResource === 'training' && (
                  <View style={styles.resourceCardBody}>
                    <View style={styles.underConstructionBanner}>
                      <Ionicons name="construct" size={18} color="#f59e0b" />
                      <Text style={styles.underConstructionText}>Under Construction — More content coming soon</Text>
                    </View>
                    <TouchableOpacity style={styles.resourceItem} onPress={() => {
                      const url = 'https://www.youtube.com/watch?v=I-ORRvYr5Fg';
                      if (Platform.OS === 'web') { window.open(url, '_blank'); } else { import('expo-linking').then(Linking => Linking.default.openURL(url)); }
                    }}>
                      <Ionicons name="logo-youtube" size={18} color="#FF0000" />
                      <Text style={[styles.resourceItemText, { color: COLORS.lime }]}>Blue Box Air Training Video</Text>
                      <Ionicons name="open-outline" size={16} color={COLORS.grayDark} />
                    </TouchableOpacity>
                    <View style={styles.resourceItem}>
                      <Ionicons name="play-circle" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Coil Cleaning Fundamentals</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="play-circle" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Equipment Safety Protocols</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="play-circle" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Pre/Post Service Readings Guide</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="play-circle" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Client Communication Skills</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>

              {/* Troubleshooting Blue Box */}
              <TouchableOpacity
                style={styles.resourceCard}
                onPress={() => setExpandedResource(expandedResource === 'troubleshoot' ? null : 'troubleshoot')}
                activeOpacity={0.7}
              >
                <View style={styles.resourceCardHeader}>
                  <View style={[styles.resourceIconBox, { backgroundColor: '#ef444420' }]}>
                    <Ionicons name="build" size={24} color="#ef4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resourceCardTitle}>Troubleshooting Blue Box</Text>
                    <Text style={styles.resourceCardSub}>Diagnostic guides and common fixes</Text>
                  </View>
                  <Ionicons name={expandedResource === 'troubleshoot' ? 'chevron-up' : 'chevron-down'} size={22} color={COLORS.grayDark} />
                </View>
                {expandedResource === 'troubleshoot' && (
                  <View style={styles.resourceCardBody}>
                    <View style={styles.underConstructionBanner}>
                      <Ionicons name="construct" size={18} color="#f59e0b" />
                      <Text style={styles.underConstructionText}>Under Construction — Content coming soon</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="document-text" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Differential Pressure Issues</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="document-text" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Airflow Troubleshooting (FPM)</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="document-text" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Common Error Codes</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="document-text" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Escalation Procedures</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>

              {/* Automation Install */}
              <TouchableOpacity
                style={styles.resourceCard}
                onPress={() => setExpandedResource(expandedResource === 'automation' ? null : 'automation')}
                activeOpacity={0.7}
              >
                <View style={styles.resourceCardHeader}>
                  <View style={[styles.resourceIconBox, { backgroundColor: '#a3e63520' }]}>
                    <Ionicons name="hardware-chip" size={24} color={COLORS.lime} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resourceCardTitle}>Automation Install</Text>
                    <Text style={styles.resourceCardSub}>Bio-Automation setup and configuration</Text>
                  </View>
                  <Ionicons name={expandedResource === 'automation' ? 'chevron-up' : 'chevron-down'} size={22} color={COLORS.grayDark} />
                </View>
                {expandedResource === 'automation' && (
                  <View style={styles.resourceCardBody}>
                    <View style={styles.underConstructionBanner}>
                      <Ionicons name="construct" size={18} color="#f59e0b" />
                      <Text style={styles.underConstructionText}>Under Construction — Content coming soon</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="list" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Installation Checklist</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="document-text" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Wiring Diagrams</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="document-text" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Sensor Calibration Guide</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="play-circle" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Step-by-Step Install Video</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>

              {/* Pricing Model */}
              <TouchableOpacity
                style={styles.resourceCard}
                onPress={() => setExpandedResource(expandedResource === 'pricing' ? null : 'pricing')}
                activeOpacity={0.7}
              >
                <View style={styles.resourceCardHeader}>
                  <View style={[styles.resourceIconBox, { backgroundColor: '#f59e0b20' }]}>
                    <Ionicons name="pricetag" size={24} color="#f59e0b" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resourceCardTitle}>Pricing Model</Text>
                    <Text style={styles.resourceCardSub}>Service rates and cost estimator</Text>
                  </View>
                  <Ionicons name={expandedResource === 'pricing' ? 'chevron-up' : 'chevron-down'} size={22} color={COLORS.grayDark} />
                </View>
                {expandedResource === 'pricing' && (
                  <View style={styles.resourceCardBody}>
                    <View style={styles.underConstructionBanner}>
                      <Ionicons name="construct" size={18} color="#f59e0b" />
                      <Text style={styles.underConstructionText}>Under Construction — Content coming soon</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="cash" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Standard Service Rates</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="calculator" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Cost Estimator Tool</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="document-text" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Contract Pricing Guide</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="trending-up" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Upsell Opportunities</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>

              {/* FAQs */}
              <TouchableOpacity
                style={styles.resourceCard}
                onPress={() => setExpandedResource(expandedResource === 'faqs' ? null : 'faqs')}
                activeOpacity={0.7}
              >
                <View style={styles.resourceCardHeader}>
                  <View style={[styles.resourceIconBox, { backgroundColor: '#8b5cf620' }]}>
                    <Ionicons name="help-circle" size={24} color="#8b5cf6" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.resourceCardTitle}>FAQs</Text>
                    <Text style={styles.resourceCardSub}>Frequently asked questions</Text>
                  </View>
                  <Ionicons name={expandedResource === 'faqs' ? 'chevron-up' : 'chevron-down'} size={22} color={COLORS.grayDark} />
                </View>
                {expandedResource === 'faqs' && (
                  <View style={styles.resourceCardBody}>
                    <View style={styles.underConstructionBanner}>
                      <Ionicons name="construct" size={18} color="#f59e0b" />
                      <Text style={styles.underConstructionText}>Under Construction — Content coming soon</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="chatbubble-ellipses" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>How to submit service reports?</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="chatbubble-ellipses" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>What are acceptable pressure ranges?</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="chatbubble-ellipses" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>How to connect to Salesforce?</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="chatbubble-ellipses" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Scheduling and dispatch process</Text>
                    </View>
                    <View style={styles.resourceItem}>
                      <Ionicons name="chatbubble-ellipses" size={18} color={COLORS.grayDark} />
                      <Text style={[styles.resourceItemText, { color: COLORS.grayDark }]}>Emergency contact protocol</Text>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          ) : (
          /* ============ Profile Tab ============ */
          <View>
          {/* Profile Header */}
          <View style={styles.profileHeader}>
            <TouchableOpacity 
              style={styles.avatarContainer} 
              onPress={showPhotoOptions}
              activeOpacity={0.7}
            >
              <View style={styles.avatar}>
                {profilePhoto ? (
                  <Image source={{ uri: profilePhoto }} style={styles.avatarImage} />
                ) : (
                  <Ionicons name="person" size={40} color={COLORS.lime} />
                )}
              </View>
              <View style={styles.cameraOverlay}>
                <Ionicons name="camera" size={16} color={COLORS.white} />
              </View>
            </TouchableOpacity>

            {editing ? (
              <View style={styles.editNameContainer}>
                <TextInput
                  style={styles.editNameInput}
                  value={editForm.full_name}
                  onChangeText={(text) => setEditForm({ ...editForm, full_name: text })}
                  placeholder="Full Name"
                  placeholderTextColor={COLORS.grayDark}
                />
                <TextInput
                  style={styles.editTitleInput}
                  value={editForm.title}
                  onChangeText={(text) => setEditForm({ ...editForm, title: text })}
                  placeholder="Title (e.g., Lead Technician)"
                  placeholderTextColor={COLORS.grayDark}
                />
              </View>
            ) : (
              <>
                <Text style={styles.name}>{technician?.full_name || 'Technician'}</Text>
                <Text style={styles.title}>{technician?.title || 'Technician'}</Text>
                <Text style={styles.company}>{technician?.company || 'Blue Box Air, Inc.'}</Text>
              </>
            )}

            {!editing && technician?.skills && technician.skills.length > 0 && (
              <View style={styles.skillsContainer}>
                {technician.skills.map((skill, index) => (
                  <View key={index} style={styles.skillBadge}>
                    <Text style={styles.skillText}>{skill}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          {editing ? (
            /* Edit Mode */
            <View style={styles.editSection}>
              <Text style={styles.sectionTitle}>CONTACT INFO</Text>
              <View style={styles.sectionContent}>
                <View style={styles.editField}>
                  <Ionicons name="mail-outline" size={20} color={COLORS.lime} style={styles.editFieldIcon} />
                  <TextInput
                    style={styles.editFieldInput}
                    value={editForm.email}
                    onChangeText={(text) => setEditForm({ ...editForm, email: text })}
                    placeholder="Email"
                    placeholderTextColor={COLORS.grayDark}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
                <View style={styles.editField}>
                  <Ionicons name="call-outline" size={20} color={COLORS.lime} style={styles.editFieldIcon} />
                  <TextInput
                    style={styles.editFieldInput}
                    value={editForm.phone}
                    onChangeText={(text) => setEditForm({ ...editForm, phone: text })}
                    placeholder="Phone Number"
                    placeholderTextColor={COLORS.grayDark}
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={styles.editField}>
                  <Ionicons name="business-outline" size={20} color={COLORS.lime} style={styles.editFieldIcon} />
                  <TextInput
                    style={styles.editFieldInput}
                    value={editForm.company}
                    onChangeText={(text) => setEditForm({ ...editForm, company: text })}
                    placeholder="Company"
                    placeholderTextColor={COLORS.grayDark}
                  />
                </View>
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 20 }]}>SKILLS</Text>
              <View style={styles.sectionContent}>
                <View style={styles.skillsEditContainer}>
                  {editForm.skills.map((skill, index) => (
                    <TouchableOpacity 
                      key={index} 
                      style={styles.skillBadgeEdit}
                      onPress={() => removeSkill(skill)}
                    >
                      <Text style={styles.skillText}>{skill}</Text>
                      <Ionicons name="close-circle" size={16} color={COLORS.lime} />
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.addSkillRow}>
                  <TextInput
                    style={styles.addSkillInput}
                    value={newSkill}
                    onChangeText={setNewSkill}
                    placeholder="Add a skill..."
                    placeholderTextColor={COLORS.grayDark}
                    onSubmitEditing={addSkill}
                  />
                  <TouchableOpacity style={styles.addSkillBtn} onPress={addSkill}>
                    <Ionicons name="add" size={22} color={COLORS.navy} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Save / Cancel Buttons */}
              <View style={styles.editActions}>
                <TouchableOpacity 
                  style={styles.saveButton} 
                  onPress={saveProfile}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color={COLORS.navy} />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={22} color={COLORS.navy} />
                      <Text style={styles.saveButtonText}>Save Profile</Text>
                    </>
                  )}
                </TouchableOpacity>
                <TouchableOpacity 
                  style={styles.cancelButton} 
                  onPress={() => {
                    setEditing(false);
                    // Reset form
                    if (technician) {
                      setEditForm({
                        full_name: technician.full_name || '',
                        email: technician.email || '',
                        phone: technician.phone || '',
                        title: technician.title || 'Technician',
                        company: technician.company || 'Blue Box Air, Inc.',
                        skills: technician.skills || [],
                      });
                    }
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* View Mode */
            <>
              {/* Account Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>ACCOUNT</Text>
                <View style={styles.sectionContent}>
                  <MenuItem
                    icon="person-outline"
                    title="Edit Profile"
                    subtitle="Update your personal information"
                    onPress={() => setEditing(true)}
                    color={COLORS.lime}
                  />
                  <MenuItem
                    icon="mail-outline"
                    title="Email"
                    subtitle={technician?.email || 'Not set'}
                    showArrow={false}
                    color={COLORS.white}
                  />
                  <MenuItem
                    icon="call-outline"
                    title="Phone"
                    subtitle={technician?.phone || 'Not set'}
                    showArrow={false}
                    color={COLORS.white}
                  />
                  <MenuItem
                    icon="cloud-outline"
                    title="Salesforce Connection"
                    subtitle="Connected (Mock)"
                    onPress={() => {}}
                    color={COLORS.lime}
                  />
                </View>
              </View>

              {/* Settings Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>SETTINGS</Text>
                <View style={styles.sectionContent}>
                  <MenuItem
                    icon="notifications-outline"
                    title="Push Notifications"
                    subtitle="Receive project updates"
                    showArrow={false}
                    color={COLORS.white}
                    rightElement={
                      <Switch
                        value={notifications}
                        onValueChange={setNotifications}
                        trackColor={{ false: '#2d4a6f', true: COLORS.lime }}
                        thumbColor={COLORS.white}
                      />
                    }
                  />
                  <MenuItem
                    icon="camera-outline"
                    title="Camera & Video"
                    subtitle="Capture photos and videos"
                    showArrow={false}
                    color={COLORS.white}
                  />
                </View>
              </View>

              {/* Support Section */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>SUPPORT</Text>
                <View style={styles.sectionContent}>
                  <MenuItem
                    icon="help-circle-outline"
                    title="Help Center"
                    onPress={() => {}}
                    color={COLORS.white}
                  />
                  <MenuItem
                    icon="information-circle-outline"
                    title="About"
                    subtitle="Blue Box Air, Inc. v1.0.0"
                    showArrow={false}
                    color={COLORS.white}
                  />
                </View>
              </View>

              {/* Logout */}
              <View style={styles.logoutSection}>
                <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                  <Ionicons name="log-out-outline" size={22} color={COLORS.red} />
                  <Text style={styles.logoutText}>Logout</Text>
                </TouchableOpacity>
              </View>

              {/* Footer */}
              <View style={styles.footer}>
                <Text style={styles.footerText}>Blue Box Air, Inc.</Text>
                <Text style={styles.footerSubtext}>Coil Management Solutions</Text>
              </View>
            </>
          )}
          </View>
          )}
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
  header: {
    backgroundColor: COLORS.navyLight,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandText: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 3,
  },
  scrollView: {
    flex: 1,
  },
  profileHeader: {
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
  },
  avatarContainer: {
    marginBottom: 16,
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.navyLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: COLORS.lime,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  cameraOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.navy,
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 4,
  },
  title: {
    fontSize: 14,
    color: COLORS.lime,
    fontWeight: '500',
    marginBottom: 2,
  },
  company: {
    fontSize: 13,
    color: COLORS.gray,
    marginBottom: 12,
  },
  editNameContainer: {
    alignItems: 'center',
    width: '80%',
  },
  editNameInput: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.white,
    textAlign: 'center',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.lime,
    paddingBottom: 6,
    marginBottom: 8,
    width: '100%',
  },
  editTitleInput: {
    fontSize: 14,
    color: COLORS.lime,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
    paddingBottom: 4,
    width: '100%',
  },
  skillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  skillBadge: {
    backgroundColor: COLORS.lime + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  skillBadgeEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.lime + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  skillText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.lime,
  },
  skillsEditContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 16,
    paddingBottom: 8,
  },
  addSkillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 8,
  },
  addSkillInput: {
    flex: 1,
    backgroundColor: COLORS.navy,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: COLORS.white,
    fontSize: 14,
  },
  addSkillBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  editSection: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.grayDark,
    letterSpacing: 1,
    marginBottom: 12,
  },
  sectionContent: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  editField: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
  },
  editFieldIcon: {
    marginRight: 14,
  },
  editFieldInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.white,
  },
  editActions: {
    marginTop: 24,
    gap: 12,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.lime,
    paddingVertical: 16,
    borderRadius: 12,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.navy,
  },
  cancelButton: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  cancelButtonText: {
    fontSize: 15,
    color: COLORS.gray,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  menuItemIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuItemText: {
    flex: 1,
  },
  menuItemTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  menuItemSubtitle: {
    fontSize: 12,
    color: COLORS.grayDark,
    marginTop: 2,
  },
  logoutSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.red + '20',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 10,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.red,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
  },
  footerText: {
    fontSize: 14,
    color: COLORS.gray,
    fontWeight: '600',
  },
  footerSubtext: {
    fontSize: 12,
    color: COLORS.grayDark,
    marginTop: 4,
  },
  // Profile Tab Switcher
  profileTabSwitcher: {
    flexDirection: 'row',
    backgroundColor: COLORS.navyLight,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  profileTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  profileTabBtnActive: {
    backgroundColor: COLORS.lime,
  },
  profileTabBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.gray,
  },
  profileTabBtnTextActive: {
    color: COLORS.navy,
  },
  // Resources
  resourcesContainer: {
    padding: 20,
    position: 'relative',
    minHeight: 600,
  },
  resourcesBgContainer: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    alignItems: 'center',
    opacity: 0.06,
    zIndex: 0,
  },
  resourcesBgImage: {
    width: 280,
    height: 280,
  },
  resourcesTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 4,
    zIndex: 1,
  },
  resourcesSubtitle: {
    fontSize: 13,
    color: COLORS.grayDark,
    marginBottom: 20,
    zIndex: 1,
  },
  resourceCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d4a6f',
    overflow: 'hidden',
  },
  resourceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  resourceIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resourceCardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  resourceCardSub: {
    fontSize: 12,
    color: COLORS.grayDark,
    marginTop: 2,
  },
  resourceCardBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: '#2d4a6f',
    paddingTop: 12,
    gap: 10,
  },
  resourceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  resourceItemText: {
    fontSize: 14,
    color: COLORS.white,
    flex: 1,
  },
  underConstructionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f59e0b15',
    borderWidth: 1,
    borderColor: '#f59e0b30',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  underConstructionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#f59e0b',
    flex: 1,
  },
});
