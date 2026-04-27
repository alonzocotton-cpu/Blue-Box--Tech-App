import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { format } from 'date-fns';

// Only import DateTimePicker on native platforms
let DateTimePicker: any = null;
if (Platform.OS !== 'web') {
  DateTimePicker = require('@react-native-community/datetimepicker').default;
}

import { API_BASE_URL } from '../../utils/api';

const API_URL = API_BASE_URL;

// Blue Box Air colors
const COLORS = {
  navy: '#0f2744',
  navyLight: '#1a365d',
  lime: '#c5d93d',
  white: '#ffffff',
  gray: '#94a3b8',
  grayDark: '#64748b',
  green: '#22c55e',
  blue: '#3b82f6',
  orange: '#f59e0b',
  red: '#ef4444',
};

interface EquipmentDetails {
  equipment: any;
  readings: any[];
  photos: any[];
  service_logs: any[];
}

interface ReadingComparison {
  type: string;
  unit: string;
  pre: { value: number; captured_at: string } | null;
  post: { value: number; captured_at: string } | null;
  difference: number | null;
}

const READING_TYPES = [
  { type: 'Differential Pressure', unit: 'inWC', icon: 'speedometer' },
  { type: 'Airflow', unit: 'FPM', icon: 'swap-horizontal' },
  { type: 'Temperature', unit: '°F', icon: 'thermometer' },
  { type: 'Humidity', unit: '%', icon: 'water' },
];

// Web-compatible Date/Time Picker Component
function WebDateTimePicker({ date, onDateChange }: { date: Date; onDateChange: (d: Date) => void }) {

  const handleDateChange = (e: any) => {
    const val = e.target?.value;
    if (val) {
      const [year, month, day] = val.split('-').map(Number);
      const newDate = new Date(date);
      newDate.setFullYear(year);
      newDate.setMonth(month - 1);
      newDate.setDate(day);
      onDateChange(newDate);
    }
  };

  const handleTimeChange = (e: any) => {
    const val = e.target?.value;
    if (val) {
      const [hours, minutes] = val.split(':').map(Number);
      const newDate = new Date(date);
      newDate.setHours(hours);
      newDate.setMinutes(minutes);
      onDateChange(newDate);
    }
  };

  // Format date as YYYY-MM-DD for input
  const dateValue = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  // Format time as HH:MM for input
  const timeValue = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  // Create native HTML inputs for web platform
  const DateInput = React.createElement('input', {
    type: 'date',
    value: dateValue,
    onChange: handleDateChange,
    max: dateValue,
    style: {
      width: '100%',
      height: 44,
      backgroundColor: COLORS.navy,
      color: COLORS.white,
      border: `1px solid #2d4a6f`,
      borderRadius: 10,
      padding: '0 12px',
      fontSize: 14,
      fontFamily: 'inherit',
      cursor: 'pointer',
      colorScheme: 'dark',
    },
  });

  const TimeInput = React.createElement('input', {
    type: 'time',
    value: timeValue,
    onChange: handleTimeChange,
    style: {
      width: '100%',
      height: 44,
      backgroundColor: COLORS.navy,
      color: COLORS.white,
      border: `1px solid #2d4a6f`,
      borderRadius: 10,
      padding: '0 12px',
      fontSize: 14,
      fontFamily: 'inherit',
      cursor: 'pointer',
      colorScheme: 'dark',
    },
  });

  return (
    <View style={styles.dateTimeRow}>
      <View style={styles.webDateTimeWrapper}>
        <View style={styles.webDateTimeIconRow}>
          <Ionicons name="calendar" size={18} color={COLORS.lime} />
          <Text style={styles.webDateTimeLabel}>Date</Text>
        </View>
        {DateInput}
      </View>
      <View style={styles.webDateTimeWrapper}>
        <View style={styles.webDateTimeIconRow}>
          <Ionicons name="time" size={18} color={COLORS.lime} />
          <Text style={styles.webDateTimeLabel}>Time</Text>
        </View>
        {TimeInput}
      </View>
    </View>
  );
}

export default function EquipmentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [details, setDetails] = useState<EquipmentDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [showReadingModal, setShowReadingModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'comparison' | 'history'>('comparison');
  
  // Reading form state
  const [readingForm, setReadingForm] = useState({
    reading_type: 'Differential Pressure',
    reading_phase: 'Pre' as 'Pre' | 'Post',
    value: '',
    unit: 'inWC',
    notes: '',
  });
  
  // Date/Time picker state
  const [captureDate, setCaptureDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const fetchDetails = async () => {
    try {
      const response = await fetch(`${API_URL}/api/equipment/detail/${id}`);
      const data = await response.json();
      setDetails(data);
    } catch (error) {
      console.error('Error fetching equipment:', error);
      Alert.alert('Error', 'Failed to load equipment details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [id]);

  // Calculate comparison data - group by reading type, get latest Pre and Post
  const comparisonData = useMemo((): ReadingComparison[] => {
    if (!details?.readings) return READING_TYPES.map(rt => ({
      type: rt.type,
      unit: rt.unit,
      pre: null,
      post: null,
      difference: null,
    }));

    return READING_TYPES.map(rt => {
      const typeReadings = details.readings.filter(r => r.reading_type === rt.type);
      const preReadings = typeReadings.filter(r => r.reading_phase === 'Pre');
      const postReadings = typeReadings.filter(r => r.reading_phase === 'Post');
      
      // Get most recent Pre and Post
      const latestPre = preReadings.length > 0 
        ? preReadings.reduce((a, b) => 
            new Date(a.captured_at || a.timestamp) > new Date(b.captured_at || b.timestamp) ? a : b
          )
        : null;
      
      const latestPost = postReadings.length > 0 
        ? postReadings.reduce((a, b) => 
            new Date(a.captured_at || a.timestamp) > new Date(b.captured_at || b.timestamp) ? a : b
          )
        : null;

      const difference = (latestPre && latestPost) 
        ? parseFloat((latestPost.value - latestPre.value).toFixed(2))
        : null;

      return {
        type: rt.type,
        unit: rt.unit,
        pre: latestPre ? { value: latestPre.value, captured_at: latestPre.captured_at || latestPre.timestamp } : null,
        post: latestPost ? { value: latestPost.value, captured_at: latestPost.captured_at || latestPost.timestamp } : null,
        difference,
      };
    });
  }, [details?.readings]);

  const openReadingModal = (readingType: string, unit: string, suggestedPhase?: 'Pre' | 'Post') => {
    // Auto-suggest phase based on existing data
    const comparison = comparisonData.find(c => c.type === readingType);
    let phase: 'Pre' | 'Post' = suggestedPhase || 'Pre';
    if (!suggestedPhase && comparison) {
      if (!comparison.pre) phase = 'Pre';
      else if (!comparison.post) phase = 'Post';
    }

    setReadingForm({
      ...readingForm,
      reading_type: readingType,
      reading_phase: phase,
      unit: unit,
      value: '',
      notes: '',
    });
    setCaptureDate(new Date());
    setShowReadingModal(true);
  };

  const submitReading = async () => {
    if (!readingForm.value) {
      Alert.alert('Error', 'Please enter a value');
      return;
    }

    try {
      await fetch(`${API_URL}/api/readings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          equipment_id: id,
          project_id: details?.equipment?.project_id,
          reading_type: readingForm.reading_type,
          reading_phase: readingForm.reading_phase,
          value: parseFloat(readingForm.value),
          unit: readingForm.unit,
          captured_at: captureDate.toISOString(),
          notes: readingForm.notes || undefined,
        }),
      });
      setShowReadingModal(false);
      setReadingForm({ 
        reading_type: 'Differential Pressure', 
        reading_phase: 'Pre',
        value: '', 
        unit: 'inWC', 
        notes: '' 
      });
      fetchDetails();
      Alert.alert('Success', `${readingForm.reading_phase} reading recorded successfully`);
    } catch (error) {
      Alert.alert('Error', 'Failed to save reading');
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is required to take photos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      try {
        await fetch(`${API_URL}/api/photos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: details?.equipment?.project_id,
            equipment_id: id,
            image_data: `data:image/jpeg;base64,${result.assets[0].base64}`,
            photo_type: 'Equipment',
          }),
        });
        fetchDetails();
        Alert.alert('Success', 'Photo uploaded successfully');
      } catch (error) {
        Alert.alert('Error', 'Failed to upload photo');
      }
    }
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      const newDate = new Date(captureDate);
      newDate.setFullYear(selectedDate.getFullYear());
      newDate.setMonth(selectedDate.getMonth());
      newDate.setDate(selectedDate.getDate());
      setCaptureDate(newDate);
    }
  };

  const onTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const newDate = new Date(captureDate);
      newDate.setHours(selectedTime.getHours());
      newDate.setMinutes(selectedTime.getMinutes());
      setCaptureDate(newDate);
    }
  };

  // Color logic: context-aware per reading type
  // Differential Pressure, Temperature, Humidity: a DROP is positive (green)
  // Airflow: an INCREASE is positive (green)
  const getDifferenceColor = (diff: number | null, readingType?: string) => {
    if (diff === null) return COLORS.grayDark;
    
    // For these types, a decrease (negative diff) is GOOD (green)
    const decreaseIsGood = ['Differential Pressure', 'Temperature', 'Humidity'];
    if (readingType && decreaseIsGood.includes(readingType)) {
      if (diff < 0) return COLORS.green;   // Drop = positive improvement
      if (diff > 0) return COLORS.red;     // Increase = negative
      return COLORS.gray;
    }
    
    // For Airflow and others, an increase is good
    if (diff > 0) return COLORS.green;
    if (diff < 0) return COLORS.red;
    return COLORS.gray;
  };

  const getDifferenceIcon = (diff: number | null, readingType?: string) => {
    if (diff === null) return 'remove';
    
    const decreaseIsGood = ['Differential Pressure', 'Temperature', 'Humidity'];
    if (readingType && decreaseIsGood.includes(readingType)) {
      if (diff < 0) return 'trending-down';  // Drop = good
      if (diff > 0) return 'trending-up';    // Rise = bad
      return 'remove';
    }
    
    if (diff > 0) return 'trending-up';
    if (diff < 0) return 'trending-down';
    return 'remove';
  };

  const getDifferenceLabel = (diff: number | null, readingType?: string) => {
    if (diff === null) return '';
    const decreaseIsGood = ['Differential Pressure', 'Temperature', 'Humidity'];
    if (readingType && decreaseIsGood.includes(readingType)) {
      if (diff < 0) return 'Improved';
      if (diff > 0) return 'Increased';
      return 'No Change';
    }
    if (diff > 0) return 'Improved';
    if (diff < 0) return 'Decreased';
    return 'No Change';
  };

  if (loading || !details) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.lime} />
        </View>
      </SafeAreaView>
    );
  }

  const { equipment, readings, photos, service_logs } = details;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Equipment</Text>
        </View>
        <TouchableOpacity style={styles.cameraButton} onPress={takePhoto}>
          <Ionicons name="camera" size={24} color={COLORS.lime} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Equipment Info */}
        <View style={styles.equipmentHeader}>
          <View style={styles.equipmentIcon}>
            <Ionicons name="cube" size={40} color={COLORS.lime} />
          </View>
          <Text style={styles.equipmentName}>{equipment.name}</Text>
          <View style={styles.typeBadge}>
            <Text style={styles.typeText}>{equipment.equipment_type}</Text>
          </View>
        </View>

        {/* Details Card */}
        <View style={styles.detailsCard}>
          {equipment.model && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Model</Text>
              <Text style={styles.detailValue}>{equipment.model}</Text>
            </View>
          )}
          {equipment.serial_number && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Serial Number</Text>
              <Text style={styles.detailValue}>{equipment.serial_number}</Text>
            </View>
          )}
          {equipment.location && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Location</Text>
              <Text style={styles.detailValue}>{equipment.location}</Text>
            </View>
          )}
        </View>

        {/* Tab Toggle */}
        <View style={styles.tabToggle}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'comparison' && styles.tabBtnActive]}
            onPress={() => setActiveTab('comparison')}
          >
            <Ionicons name="git-compare" size={18} color={activeTab === 'comparison' ? COLORS.navy : COLORS.gray} />
            <Text style={[styles.tabBtnText, activeTab === 'comparison' && styles.tabBtnTextActive]}>
              Comparison
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'history' && styles.tabBtnActive]}
            onPress={() => setActiveTab('history')}
          >
            <Ionicons name="time" size={18} color={activeTab === 'history' ? COLORS.navy : COLORS.gray} />
            <Text style={[styles.tabBtnText, activeTab === 'history' && styles.tabBtnTextActive]}>
              History
            </Text>
          </TouchableOpacity>
        </View>

        {/* Comparison View */}
        {activeTab === 'comparison' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Pre vs Post Comparison</Text>
            <Text style={styles.sectionSubtitle}>Tap a reading type to add Pre or Post values</Text>
            
            {comparisonData.map((comp, index) => {
              const rtInfo = READING_TYPES.find(rt => rt.type === comp.type);
              const hasData = comp.pre || comp.post;
              const isComplete = comp.pre && comp.post;
              
              return (
                <View key={comp.type} style={styles.comparisonCard}>
                  {/* Reading Type Header */}
                  <View style={styles.compHeader}>
                    <View style={styles.compTitleRow}>
                      <View style={[styles.compIcon, { backgroundColor: COLORS.lime + '20' }]}>
                        <Ionicons name={rtInfo?.icon as any || 'analytics'} size={20} color={COLORS.lime} />
                      </View>
                      <View>
                        <Text style={styles.compTitle}>{comp.type}</Text>
                        <Text style={styles.compUnit}>{comp.unit}</Text>
                      </View>
                    </View>
                    {isComplete && (
                      <View style={[styles.diffBadge, { backgroundColor: getDifferenceColor(comp.difference, comp.type) + '20' }]}>
                        <Ionicons 
                          name={getDifferenceIcon(comp.difference, comp.type)} 
                          size={14} 
                          color={getDifferenceColor(comp.difference, comp.type)} 
                        />
                        <Text style={[styles.diffText, { color: getDifferenceColor(comp.difference, comp.type) }]}>
                          {comp.difference !== null ? (comp.difference > 0 ? '+' : '') + comp.difference : '—'}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* Pre/Post Values */}
                  <View style={styles.compValues}>
                    {/* Pre Value */}
                    <TouchableOpacity 
                      style={[styles.valueCard, styles.preCard]}
                      onPress={() => openReadingModal(comp.type, comp.unit, 'Pre')}
                    >
                      <Text style={styles.valueLabel}>PRE</Text>
                      {comp.pre ? (
                        <>
                          <Text style={styles.valueNumber}>{comp.pre.value}</Text>
                          <Text style={styles.valueTime}>
                            {format(new Date(comp.pre.captured_at), 'MMM d, h:mm a')}
                          </Text>
                        </>
                      ) : (
                        <View style={styles.addValueBtn}>
                          <Ionicons name="add-circle" size={28} color={COLORS.blue} />
                          <Text style={styles.addValueText}>Add Pre</Text>
                        </View>
                      )}
                    </TouchableOpacity>

                    {/* Arrow */}
                    <View style={styles.arrowContainer}>
                      <Ionicons name="arrow-forward" size={20} color={COLORS.grayDark} />
                    </View>

                    {/* Post Value */}
                    <TouchableOpacity 
                      style={[styles.valueCard, styles.postCard]}
                      onPress={() => openReadingModal(comp.type, comp.unit, 'Post')}
                    >
                      <Text style={styles.valueLabel}>POST</Text>
                      {comp.post ? (
                        <>
                          <Text style={styles.valueNumber}>{comp.post.value}</Text>
                          <Text style={styles.valueTime}>
                            {format(new Date(comp.post.captured_at), 'MMM d, h:mm a')}
                          </Text>
                        </>
                      ) : (
                        <View style={styles.addValueBtn}>
                          <Ionicons name="add-circle" size={28} color={COLORS.green} />
                          <Text style={styles.addValueText}>Add Post</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Difference Display when both values exist */}
                  {isComplete && (
                    <View style={styles.differenceRow}>
                      <Text style={styles.differenceLabel}>
                        {getDifferenceLabel(comp.difference, comp.type)}:
                      </Text>
                      <View style={[styles.differenceValue, { backgroundColor: getDifferenceColor(comp.difference, comp.type) + '15' }]}>
                        <Ionicons 
                          name={getDifferenceIcon(comp.difference, comp.type)} 
                          size={16} 
                          color={getDifferenceColor(comp.difference, comp.type)} 
                        />
                        <Text style={[styles.differenceNumber, { color: getDifferenceColor(comp.difference, comp.type) }]}>
                          {comp.difference !== null ? Math.abs(comp.difference) : 0} {comp.unit}
                        </Text>
                        <Text style={[styles.differencePercent, { color: getDifferenceColor(comp.difference, comp.type) }]}>
                          ({comp.pre && comp.difference !== null 
                            ? Math.abs((comp.difference / comp.pre.value) * 100).toFixed(1) 
                            : 0}%)
                        </Text>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* History View */}
        {activeTab === 'history' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Reading History</Text>
            {readings && readings.length > 0 ? (
              readings.map((reading: any, index: number) => (
                <View key={reading.id || index} style={styles.historyCard}>
                  <View style={styles.historyHeader}>
                    <View style={styles.historyInfo}>
                      <View style={[
                        styles.phaseBadge,
                        { backgroundColor: reading.reading_phase === 'Pre' ? COLORS.blue + '20' : COLORS.green + '20' }
                      ]}>
                        <Text style={[
                          styles.phaseText,
                          { color: reading.reading_phase === 'Pre' ? COLORS.blue : COLORS.green }
                        ]}>
                          {reading.reading_phase}
                        </Text>
                      </View>
                      <Text style={styles.historyType}>{reading.reading_type}</Text>
                    </View>
                    <View style={styles.historyValueContainer}>
                      <Text style={styles.historyValue}>{reading.value}</Text>
                      <Text style={styles.historyUnit}>{reading.unit}</Text>
                    </View>
                  </View>
                  <Text style={styles.historyTime}>
                    {reading.captured_at ? format(new Date(reading.captured_at), 'MMM d, yyyy h:mm a') : ''}
                  </Text>
                </View>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="analytics-outline" size={32} color={COLORS.grayDark} />
                <Text style={styles.emptyText}>No readings recorded yet</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Reading Modal with Pre/Post and Date/Time */}
      <Modal visible={showReadingModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Record Reading</Text>
              <TouchableOpacity onPress={() => setShowReadingModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.white} />
              </TouchableOpacity>
            </View>

            {/* Reading Type Selector */}
            <Text style={styles.fieldLabel}>Reading Type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {READING_TYPES.map((rt) => (
                  <TouchableOpacity
                    key={rt.type}
                    style={[
                      styles.readingTypeChip,
                      readingForm.reading_type === rt.type && styles.readingTypeChipActive,
                    ]}
                    onPress={() => setReadingForm({ ...readingForm, reading_type: rt.type, unit: rt.unit })}
                  >
                    <Ionicons
                      name={rt.icon as any}
                      size={16}
                      color={readingForm.reading_type === rt.type ? COLORS.navy : COLORS.gray}
                    />
                    <Text style={[
                      styles.readingTypeChipText,
                      readingForm.reading_type === rt.type && styles.readingTypeChipTextActive,
                    ]}>
                      {rt.type === 'Differential Pressure' ? 'Diff. Pressure' : rt.type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Pre/Post Phase Selection */}
            <View style={styles.phaseSelection}>
              <Text style={styles.fieldLabel}>Reading Phase</Text>
              <View style={styles.phaseButtons}>
                <TouchableOpacity
                  style={[
                    styles.phaseButton,
                    readingForm.reading_phase === 'Pre' && styles.phaseButtonActivePre
                  ]}
                  onPress={() => setReadingForm({ ...readingForm, reading_phase: 'Pre' })}
                >
                  <Ionicons 
                    name="arrow-down-circle" 
                    size={22} 
                    color={readingForm.reading_phase === 'Pre' ? COLORS.white : COLORS.blue} 
                  />
                  <Text style={[
                    styles.phaseButtonText,
                    readingForm.reading_phase === 'Pre' && styles.phaseButtonTextActive
                  ]}>Pre</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.phaseButton,
                    readingForm.reading_phase === 'Post' && styles.phaseButtonActivePost
                  ]}
                  onPress={() => setReadingForm({ ...readingForm, reading_phase: 'Post' })}
                >
                  <Ionicons 
                    name="arrow-up-circle" 
                    size={22} 
                    color={readingForm.reading_phase === 'Post' ? COLORS.white : COLORS.green} 
                  />
                  <Text style={[
                    styles.phaseButtonText,
                    readingForm.reading_phase === 'Post' && styles.phaseButtonTextActive
                  ]}>Post</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Date/Time Selection */}
            <View style={styles.dateTimeSection}>
              <Text style={styles.fieldLabel}>Capture Date & Time</Text>
              {Platform.OS === 'web' ? (
                <WebDateTimePicker date={captureDate} onDateChange={setCaptureDate} />
              ) : (
                <View style={styles.dateTimeRow}>
                  <TouchableOpacity 
                    style={styles.dateTimeButton}
                    onPress={() => setShowDatePicker(true)}
                  >
                    <Ionicons name="calendar" size={20} color={COLORS.lime} />
                    <Text style={styles.dateTimeText}>
                      {format(captureDate, 'MMM d, yyyy')}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.dateTimeButton}
                    onPress={() => setShowTimePicker(true)}
                  >
                    <Ionicons name="time" size={20} color={COLORS.lime} />
                    <Text style={styles.dateTimeText}>
                      {format(captureDate, 'h:mm a')}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Value Input */}
            <Text style={styles.fieldLabel}>Value</Text>
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.modalInput, styles.valueInput]}
                placeholder="Enter value"
                placeholderTextColor={COLORS.grayDark}
                keyboardType="decimal-pad"
                value={readingForm.value}
                onChangeText={(text) => setReadingForm({ ...readingForm, value: text })}
              />
              <View style={styles.unitDisplay}>
                <Text style={styles.unitText}>{readingForm.unit}</Text>
              </View>
            </View>

            {/* Notes */}
            <Text style={styles.fieldLabel}>Notes (optional)</Text>
            <TextInput
              style={[styles.modalInput, styles.notesInput]}
              placeholder="Add any notes about this reading"
              placeholderTextColor={COLORS.grayDark}
              value={readingForm.notes}
              onChangeText={(text) => setReadingForm({ ...readingForm, notes: text })}
              multiline
            />

            <TouchableOpacity style={[
              styles.submitButton,
              { backgroundColor: readingForm.reading_phase === 'Pre' ? COLORS.blue : COLORS.green }
            ]} onPress={submitReading}>
              <Text style={styles.submitButtonText}>
                Save {readingForm.reading_phase} Reading
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>

        {/* Native Date Picker (iOS/Android only) */}
        {Platform.OS !== 'web' && showDatePicker && DateTimePicker && (
          <DateTimePicker
            value={captureDate}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onDateChange}
            maximumDate={new Date()}
          />
        )}

        {/* Native Time Picker (iOS/Android only) */}
        {Platform.OS !== 'web' && showTimePicker && DateTimePicker && (
          <DateTimePicker
            value={captureDate}
            mode="time"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onTimeChange}
          />
        )}
      </Modal>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.navyLight,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
  },
  cameraButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  equipmentHeader: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  equipmentIcon: {
    width: 70,
    height: 70,
    borderRadius: 18,
    backgroundColor: COLORS.lime + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  equipmentName: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  typeBadge: {
    backgroundColor: COLORS.lime + '20',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
  },
  typeText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.lime,
  },
  detailsCard: {
    backgroundColor: COLORS.navyLight,
    marginHorizontal: 20,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 13,
    color: COLORS.grayDark,
  },
  detailValue: {
    fontSize: 13,
    color: COLORS.white,
    fontWeight: '500',
  },
  tabToggle: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 20,
    gap: 10,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: COLORS.navyLight,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  tabBtnActive: {
    backgroundColor: COLORS.lime,
    borderColor: COLORS.lime,
  },
  tabBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.gray,
  },
  tabBtnTextActive: {
    color: COLORS.navy,
  },
  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: COLORS.grayDark,
    marginBottom: 14,
  },
  comparisonCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  compHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  compTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  compIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  compUnit: {
    fontSize: 12,
    color: COLORS.grayDark,
  },
  diffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  diffText: {
    fontSize: 14,
    fontWeight: '700',
  },
  compValues: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  valueCard: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    minHeight: 90,
    justifyContent: 'center',
  },
  preCard: {
    backgroundColor: COLORS.blue + '15',
    borderWidth: 1,
    borderColor: COLORS.blue + '30',
  },
  postCard: {
    backgroundColor: COLORS.green + '15',
    borderWidth: 1,
    borderColor: COLORS.green + '30',
  },
  valueLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gray,
    marginBottom: 4,
    letterSpacing: 1,
  },
  valueNumber: {
    fontSize: 26,
    fontWeight: '700',
    color: COLORS.white,
  },
  valueTime: {
    fontSize: 10,
    color: COLORS.grayDark,
    marginTop: 4,
  },
  addValueBtn: {
    alignItems: 'center',
  },
  addValueText: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 4,
  },
  arrowContainer: {
    paddingHorizontal: 10,
  },
  differenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#2d4a6f',
  },
  differenceLabel: {
    fontSize: 13,
    color: COLORS.gray,
  },
  differenceValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  differenceNumber: {
    fontSize: 15,
    fontWeight: '700',
  },
  differencePercent: {
    fontSize: 12,
    fontWeight: '500',
  },
  historyCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  historyInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  phaseBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  phaseText: {
    fontSize: 10,
    fontWeight: '700',
  },
  historyType: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.white,
  },
  historyValueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  historyValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.lime,
  },
  historyUnit: {
    fontSize: 11,
    color: COLORS.gray,
  },
  historyTime: {
    fontSize: 11,
    color: COLORS.grayDark,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 30,
    backgroundColor: COLORS.navyLight,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.grayDark,
    marginTop: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.navyLight,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.gray,
    marginBottom: 8,
  },
  phaseSelection: {
    marginBottom: 14,
  },
  phaseButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  phaseButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: COLORS.navy,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2d4a6f',
  },
  phaseButtonActivePre: {
    backgroundColor: COLORS.blue,
    borderColor: COLORS.blue,
  },
  phaseButtonActivePost: {
    backgroundColor: COLORS.green,
    borderColor: COLORS.green,
  },
  phaseButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.gray,
  },
  phaseButtonTextActive: {
    color: COLORS.white,
  },
  dateTimeSection: {
    marginBottom: 14,
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateTimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: COLORS.navy,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  dateTimeText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.white,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 14,
  },
  modalInput: {
    backgroundColor: COLORS.navy,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: COLORS.white,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  valueInput: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
  },
  unitDisplay: {
    backgroundColor: COLORS.lime + '20',
    borderRadius: 10,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.lime,
  },
  notesInput: {
    height: 70,
    textAlignVertical: 'top',
    marginBottom: 14,
  },
  submitButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  webDateTimeWrapper: {
    flex: 1,
    gap: 6,
  },
  webDateTimeIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  webDateTimeLabel: {
    fontSize: 12,
    color: COLORS.lime,
    fontWeight: '500',
  },
  readingTypeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: COLORS.navyLight,
    borderWidth: 1,
    borderColor: '#2d4a6f',
    gap: 6,
  },
  readingTypeChipActive: {
    backgroundColor: COLORS.lime,
    borderColor: COLORS.lime,
  },
  readingTypeChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.gray,
  },
  readingTypeChipTextActive: {
    color: COLORS.navy,
  },
});
