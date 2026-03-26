import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { format } from 'date-fns';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

// Blue Box Air colors
const COLORS = {
  navy: '#0f2744',
  navyLight: '#1a365d',
  navyMid: '#1e3a5f',
  lime: '#c5d93d',
  white: '#ffffff',
  gray: '#94a3b8',
  grayDark: '#64748b',
  green: '#22c55e',
  orange: '#f59e0b',
  red: '#ef4444',
};

interface ProjectDetails {
  project: any;
  equipment: any[];
  readings: any[];
  photos: any[];
  service_logs: any[];
}

export default function ProjectDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [details, setDetails] = useState<ProjectDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('equipment');
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [selectedEquipment, setSelectedEquipment] = useState<any>(null);
  const [serviceForm, setServiceForm] = useState({
    service_type: 'Inspection',
    description: '',
    duration_minutes: '',
  });
  
  // Report state
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  
  // Media state (photos & videos)
  const [mediaItems, setMediaItems] = useState<any[]>([]);
  const [mediaLoading, setMediaLoading] = useState(false);
  
  // Share state
  const [showShareModal, setShowShareModal] = useState(false);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [selectedTechs, setSelectedTechs] = useState<string[]>([]);
  const [shareMessage, setShareMessage] = useState('');
  const [sharing, setSharing] = useState(false);

  const fetchDetails = async () => {
    try {
      const response = await fetch(`${API_URL}/api/projects/${id}`);
      const data = await response.json();
      setDetails(data);
    } catch (error) {
      console.error('Error fetching project:', error);
      Alert.alert('Error', 'Failed to load project details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [id]);

  const fetchReport = async () => {
    setReportLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/reports/${id}`);
      const data = await response.json();
      setReportData(data);
    } catch (error) {
      console.error('Error generating report:', error);
      Alert.alert('Error', 'Failed to generate report');
    } finally {
      setReportLoading(false);
    }
  };

  // Fetch report when tab switches to report
  useEffect(() => {
    if (activeTab === 'report' && !reportData) {
      fetchReport();
    }
  }, [activeTab]);

  const generatePDF = async () => {
    if (!reportData) return;
    setPdfGenerating(true);
    try {
      const project = reportData.project || {};
      const summary = reportData.summary || {};
      const sfStatus = reportData.salesforce_sync_status || {};
      
      // Build equipment rows HTML
      let equipmentHTML = '';
      (reportData.equipment_reports || []).forEach((eqReport: any) => {
        const eq = eqReport.equipment || {};
        let readingsRows = '';
        
        if (eqReport.has_data) {
          (eqReport.comparisons || []).forEach((comp: any) => {
            if (!comp.pre && !comp.post) return;
            const diffColor = comp.difference === null ? '#999' 
              : comp.difference > 0 ? '#4CAF50' 
              : comp.difference < 0 ? '#F44336' 
              : '#999';
            const diffDisplay = comp.difference !== null 
              ? `<span style="color:${diffColor};font-weight:bold">${comp.difference > 0 ? '+' : ''}${comp.difference} ${comp.unit}</span>` 
              : '—';
            const pctDisplay = comp.percent_change !== null
              ? `<br/><span style="color:${diffColor};font-size:11px">(${comp.percent_change > 0 ? '+' : ''}${comp.percent_change}%)</span>`
              : '';
            
            readingsRows += `
              <tr>
                <td style="padding:8px 10px;border-bottom:1px solid #1a3a5c;font-weight:500;">${comp.reading_type}<br/><span style="color:#888;font-size:11px">${comp.unit}</span></td>
                <td style="padding:8px 10px;border-bottom:1px solid #1a3a5c;text-align:center;font-weight:600">${comp.pre ? comp.pre.value : '—'}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #1a3a5c;text-align:center;font-weight:600">${comp.post ? comp.post.value : '—'}</td>
                <td style="padding:8px 10px;border-bottom:1px solid #1a3a5c;text-align:center">${diffDisplay}${pctDisplay}</td>
              </tr>`;
          });
        } else {
          readingsRows = '<tr><td colspan="4" style="text-align:center;padding:16px;color:#888;font-style:italic">No readings recorded</td></tr>';
        }
        
        equipmentHTML += `
          <div style="background:#0d2137;border-radius:10px;padding:16px;margin-bottom:16px;border:1px solid #1a3a5c">
            <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:4px">${eq.name || 'Unknown'}</div>
            <div style="font-size:12px;color:#888;margin-bottom:12px">${eq.equipment_type || ''} • ${eq.location || 'N/A'}</div>
            <table style="width:100%;border-collapse:collapse;color:#fff;font-size:13px">
              <thead>
                <tr style="background:#0a1929">
                  <th style="padding:8px 10px;text-align:left;font-weight:700;color:#888;text-transform:uppercase;font-size:11px">Metric</th>
                  <th style="padding:8px 10px;text-align:center;font-weight:700;color:#888;text-transform:uppercase;font-size:11px">Pre</th>
                  <th style="padding:8px 10px;text-align:center;font-weight:700;color:#888;text-transform:uppercase;font-size:11px">Post</th>
                  <th style="padding:8px 10px;text-align:center;font-weight:700;color:#888;text-transform:uppercase;font-size:11px">Change</th>
                </tr>
              </thead>
              <tbody>${readingsRows}</tbody>
            </table>
          </div>`;
      });

      // Build photos section
      const photoCount = summary.total_photos || 0;
      const photosHTML = `
        <div style="background:#0d2137;border-radius:10px;padding:16px;margin-top:16px;border:1px solid rgba(163,230,53,0.3)">
          <div style="font-size:16px;font-weight:600;color:#a3e635">Project Photos (${photoCount})</div>
          <div style="font-size:12px;color:#888;margin-top:4px">
            ${photoCount > 0 ? `${photoCount} photo(s) attached to this project` : 'No photos uploaded yet'}
          </div>
        </div>`;

      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: #0a1929; color: #fff; padding: 24px; margin: 0; }
              .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid #a3e635; margin-bottom: 20px; }
              .header h1 { color: #a3e635; font-size: 24px; margin: 0; }
              .header h2 { color: #fff; font-size: 18px; margin: 4px 0; font-weight: 400; }
              .header p { color: #888; font-size: 12px; margin: 4px 0; }
              .summary { display: flex; gap: 12px; margin-bottom: 24px; }
              .summary-item { flex: 1; background: #0d2137; border-radius: 10px; padding: 14px; text-align: center; border: 1px solid #1a3a5c; }
              .summary-number { font-size: 28px; font-weight: 700; color: #a3e635; }
              .summary-label { font-size: 11px; color: #888; margin-top: 2px; }
              .section-title { font-size: 18px; font-weight: 700; color: #fff; margin: 20px 0 6px; }
              .section-subtitle { font-size: 12px; color: #888; margin-bottom: 14px; }
              .sf-badge { background: rgba(255,152,0,0.1); border: 1px solid rgba(255,152,0,0.3); border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; color: #FF9800; font-size: 12px; }
              .footer { text-align: center; margin-top: 30px; padding-top: 16px; border-top: 1px solid #1a3a5c; color: #888; font-size: 11px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>BLUE BOX AIR, INC.</h1>
              <h2>${project.name || 'Project Report'}</h2>
              <p>Report ID: ${reportData.report_id || 'N/A'}</p>
              <p>Generated: ${reportData.generated_at ? format(new Date(reportData.generated_at), 'MMM d, yyyy h:mm a') : 'Now'}</p>
              <p>Client: ${project.client_name || project.client || 'N/A'} | ${project.address || 'N/A'}</p>
            </div>

            <div class="sf-badge">
              Salesforce: ${sfStatus.mode === 'live' ? 'Connected ✓' : 'Mock Data — Configure credentials for live sync'}
            </div>

            <div class="summary">
              <div class="summary-item">
                <div class="summary-number">${summary.total_equipment || 0}</div>
                <div class="summary-label">Equipment</div>
              </div>
              <div class="summary-item">
                <div class="summary-number">${summary.total_readings || 0}</div>
                <div class="summary-label">Readings</div>
              </div>
              <div class="summary-item">
                <div class="summary-number">${summary.total_photos || 0}</div>
                <div class="summary-label">Photos</div>
              </div>
              <div class="summary-item">
                <div class="summary-number">${summary.total_service_logs || 0}</div>
                <div class="summary-label">Logs</div>
              </div>
            </div>

            <div class="section-title">Equipment Data Changes</div>
            <div class="section-subtitle">Pre vs Post service reading comparisons</div>
            ${equipmentHTML}

            ${photosHTML}

            <div class="footer">
              <p>Blue Box Air, Inc. — Technician Service Report</p>
              <p>This report was auto-generated from equipment service data</p>
            </div>
          </body>
        </html>`;

      if (Platform.OS === 'web') {
        // On web, open the HTML in a new tab for printing/saving
        const printWindow = window.open('', '_blank');
        if (printWindow) {
          printWindow.document.write(html);
          printWindow.document.close();
          printWindow.focus();
          setTimeout(() => printWindow.print(), 500);
        }
      } else {
        // On mobile, generate PDF and share
        const { uri } = await Print.printToFileAsync({ html });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(uri, {
            mimeType: 'application/pdf',
            dialogTitle: `${project.name || 'Project'} Report`,
            UTI: 'com.adobe.pdf',
          });
        } else {
          Alert.alert('PDF Generated', `Report saved to: ${uri}`);
        }
      }
    } catch (error) {
      console.error('PDF generation error:', error);
      Alert.alert('Error', 'Failed to generate PDF report');
    } finally {
      setPdfGenerating(false);
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

    if (!result.canceled && result.assets[0]) {
      try {
        await fetch(`${API_URL}/api/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: id,
            equipment_id: selectedEquipment?.id,
            media_type: 'photo',
            media_uri: result.assets[0].base64 
              ? `data:image/jpeg;base64,${result.assets[0].base64}` 
              : result.assets[0].uri,
          }),
        });
        fetchDetails();
        fetchMedia();
        Alert.alert('Success', 'Photo captured successfully');
      } catch (error) {
        Alert.alert('Error', 'Failed to upload photo');
      }
    }
  };

  const recordVideo = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Camera permission is required to record videos');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['videos'],
      videoMaxDuration: 60,
      quality: ImagePicker.UIImagePickerControllerQualityType.Medium,
    });

    if (!result.canceled && result.assets[0]) {
      try {
        await fetch(`${API_URL}/api/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: id,
            equipment_id: selectedEquipment?.id,
            media_type: 'video',
            media_uri: result.assets[0].uri,
            duration: result.assets[0].duration,
          }),
        });
        fetchDetails();
        fetchMedia();
        Alert.alert('Success', 'Video recorded successfully');
      } catch (error) {
        Alert.alert('Error', 'Failed to upload video');
      }
    }
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      try {
        await fetch(`${API_URL}/api/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: id,
            media_type: isVideo ? 'video' : 'photo',
            media_uri: asset.base64 
              ? `data:image/jpeg;base64,${asset.base64}` 
              : asset.uri,
            duration: isVideo ? asset.duration : undefined,
          }),
        });
        fetchDetails();
        fetchMedia();
        Alert.alert('Success', `${isVideo ? 'Video' : 'Photo'} added successfully`);
      } catch (error) {
        Alert.alert('Error', 'Failed to upload media');
      }
    }
  };

  const showMediaOptions = () => {
    Alert.alert('Add Media', 'Choose an option', [
      { text: 'Take Photo', onPress: takePhoto },
      { text: 'Record Video', onPress: recordVideo },
      { text: 'Choose from Gallery', onPress: pickFromGallery },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const fetchMedia = async () => {
    try {
      const response = await fetch(`${API_URL}/api/media/${id}`);
      const data = await response.json();
      setMediaItems(data.media || []);
    } catch (error) {
      console.error('Error fetching media:', error);
    }
  };

  useEffect(() => {
    if (id) fetchMedia();
  }, [id]);

  // Sharing functions
  const openShareModal = async () => {
    try {
      const response = await fetch(`${API_URL}/api/technicians`);
      const data = await response.json();
      setTechnicians(data.technicians || []);
    } catch (error) {
      console.error('Error fetching technicians:', error);
    }
    setShowShareModal(true);
  };

  const toggleTechSelection = (techId: string) => {
    setSelectedTechs(prev => 
      prev.includes(techId) 
        ? prev.filter(id => id !== techId) 
        : [...prev, techId]
    );
  };

  const shareProject = async () => {
    if (selectedTechs.length === 0) {
      Alert.alert('Select Technicians', 'Please select at least one technician to share with');
      return;
    }
    
    setSharing(true);
    try {
      await fetch(`${API_URL}/api/projects/${id}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          technician_ids: selectedTechs,
          message: shareMessage,
        }),
      });
      setShowShareModal(false);
      setSelectedTechs([]);
      setShareMessage('');
      Alert.alert('Shared!', `Project shared with ${selectedTechs.length} technician(s)`);
    } catch (error) {
      Alert.alert('Error', 'Failed to share project');
    } finally {
      setSharing(false);
    }
  };

  const nativeShare = async () => {
    const project = details?.project;
    if (!project) return;
    
    const shareText = `Blue Box Air, Inc. - Project: ${project.name}\nClient: ${project.client_name}\nAddress: ${project.address || 'N/A'}\nStatus: ${project.status}\n\nShared from Blue Box Air, Inc Tech App`;
    
    if (Platform.OS === 'web') {
      if (navigator.share) {
        try {
          await navigator.share({ title: project.name, text: shareText });
        } catch (e) { /* user cancelled */ }
      } else {
        await navigator.clipboard.writeText(shareText);
        Alert.alert('Copied!', 'Project details copied to clipboard');
      }
    } else {
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        // Create a temp text file to share
        Alert.alert('Share', shareText);
      }
    }
  };

  const submitServiceLog = async () => {
    if (!selectedEquipment || !serviceForm.description) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    try {
      await fetch(`${API_URL}/api/service-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: id,
          equipment_id: selectedEquipment.id,
          service_type: serviceForm.service_type,
          description: serviceForm.description,
          duration_minutes: serviceForm.duration_minutes ? parseInt(serviceForm.duration_minutes) : null,
        }),
      });
      setShowServiceModal(false);
      setServiceForm({ service_type: 'Inspection', description: '', duration_minutes: '' });
      setSelectedEquipment(null);
      fetchDetails();
      Alert.alert('Success', 'Service log created successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to create service log');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return COLORS.lime;
      case 'Completed': return COLORS.green;
      case 'On Hold': return COLORS.orange;
      default: return COLORS.gray;
    }
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

  const { project, equipment, readings, photos, service_logs } = details;

  const renderEquipmentItem = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.equipmentCard}
      onPress={() => router.push(`/equipment/${item.id}`)}
    >
      <View style={styles.equipmentHeader}>
        <View style={styles.equipmentIcon}>
          <Ionicons name="cube" size={24} color={COLORS.lime} />
        </View>
        <View style={styles.equipmentInfo}>
          <Text style={styles.equipmentName}>{item.name}</Text>
          <Text style={styles.equipmentType}>{item.equipment_type}</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={COLORS.grayDark} />
      </View>
      <View style={styles.equipmentDetails}>
        {item.model && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Model:</Text>
            <Text style={styles.detailValue}>{item.model}</Text>
          </View>
        )}
        {item.location && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Location:</Text>
            <Text style={styles.detailValue}>{item.location}</Text>
          </View>
        )}
      </View>
      <View style={styles.equipmentActions}>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => {
            setSelectedEquipment(item);
            setShowServiceModal(true);
          }}
        >
          <Ionicons name="create" size={18} color={COLORS.lime} />
          <Text style={styles.actionText}>Log Service</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={() => {
            setSelectedEquipment(item);
            takePhoto();
          }}
        >
          <Ionicons name="camera" size={18} color={COLORS.lime} />
          <Text style={styles.actionText}>Photo</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <Text style={styles.headerNumber}>{project.project_number}</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity style={styles.moreButton} onPress={openShareModal}>
            <Ionicons name="share-social" size={22} color={COLORS.lime} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.moreButton} onPress={showMediaOptions}>
            <Ionicons name="camera" size={24} color={COLORS.lime} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Project Info */}
        <View style={styles.projectInfo}>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(project.status) + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(project.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(project.status) }]}>
              {project.status}
            </Text>
          </View>
          <Text style={styles.projectName}>{project.name}</Text>
          {project.description && (
            <Text style={styles.projectDescription}>{project.description}</Text>
          )}
        </View>

        {/* Client Info Card */}
        <View style={styles.infoCard}>
          <View style={styles.cardRow}>
            <Ionicons name="business" size={18} color={COLORS.lime} />
            <View style={styles.cardRowText}>
              <Text style={styles.cardLabel}>Client</Text>
              <Text style={styles.cardValue}>{project.client_name}</Text>
            </View>
          </View>
          {project.address && (
            <View style={styles.cardRow}>
              <Ionicons name="location" size={18} color={COLORS.lime} />
              <View style={styles.cardRowText}>
                <Text style={styles.cardLabel}>Address</Text>
                <Text style={styles.cardValue}>{project.address}</Text>
              </View>
            </View>
          )}
          {project.start_date && (
            <View style={styles.cardRow}>
              <Ionicons name="calendar" size={18} color={COLORS.lime} />
              <View style={styles.cardRowText}>
                <Text style={styles.cardLabel}>Schedule</Text>
                <Text style={styles.cardValue}>
                  {format(new Date(project.start_date), 'MMM d')} - {project.end_date ? format(new Date(project.end_date), 'MMM d, yyyy') : 'Ongoing'}
                </Text>
              </View>
            </View>
          )}
        </View>

        {/* Primary Contact Card */}
        {project.primary_contact && (
          <View style={[styles.infoCard, { marginTop: 12 }]}>
            <View style={styles.contactHeader}>
              <Ionicons name="person-circle" size={20} color={COLORS.lime} />
              <Text style={styles.contactHeaderText}>Primary Contact</Text>
            </View>
            <View style={styles.contactDetails}>
              <Text style={styles.contactName}>{project.primary_contact.name}</Text>
              <Text style={styles.contactTitle}>{project.primary_contact.title}</Text>
              {project.primary_contact.email && (
                <View style={styles.contactRow}>
                  <Ionicons name="mail-outline" size={16} color={COLORS.gray} />
                  <Text style={styles.contactInfo}>{project.primary_contact.email}</Text>
                </View>
              )}
            </View>
            <View style={styles.contactActions}>
              <TouchableOpacity
                style={styles.callButton}
                onPress={() => {
                  const phone = project.primary_contact.phone.replace(/[^\d+]/g, '');
                  Linking.openURL(`tel:${phone}`).catch(() => {
                    Alert.alert('Unable to Call', 'Phone calling is not available on this device.');
                  });
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="call" size={20} color={COLORS.navy} />
                <Text style={styles.callButtonText}>Call {project.primary_contact.name.split(' ')[0]}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.emailButton}
                onPress={() => {
                  Linking.openURL(`mailto:${project.primary_contact.email}`).catch(() => {
                    Alert.alert('Unable to Email', 'Email is not available on this device.');
                  });
                }}
                activeOpacity={0.7}
              >
                <Ionicons name="mail" size={20} color={COLORS.lime} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="cube" size={24} color={COLORS.lime} />
            <Text style={styles.statNumber}>{equipment.length}</Text>
            <Text style={styles.statLabel}>Equipment</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="document-text" size={24} color={COLORS.lime} />
            <Text style={styles.statNumber}>{service_logs?.length || 0}</Text>
            <Text style={styles.statLabel}>Service Logs</Text>
          </View>
          <View style={styles.statCard}>
            <Ionicons name="images" size={24} color={COLORS.lime} />
            <Text style={styles.statNumber}>{photos?.length || 0}</Text>
            <Text style={styles.statLabel}>Photos</Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsContainer}>
          {['report', 'equipment', 'service', 'photos'].map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
            >
              {tab === 'report' && (
                <Ionicons 
                  name="document-text" 
                  size={16} 
                  color={activeTab === tab ? COLORS.navy : COLORS.gray} 
                  style={{ marginRight: 4 }}
                />
              )}
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'report' ? 'Report' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Content */}
        {activeTab === 'report' && (
          <View style={styles.tabContent}>
            {reportLoading ? (
              <View style={styles.reportLoadingContainer}>
                <ActivityIndicator size="large" color={COLORS.lime} />
                <Text style={styles.reportLoadingText}>Generating Report...</Text>
              </View>
            ) : reportData ? (
              <View>
                {/* Report Header */}
                <View style={styles.reportHeader}>
                  <View style={styles.reportTitleRow}>
                    <Ionicons name="document-text" size={28} color={COLORS.lime} />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.reportTitle}>Project Report</Text>
                      <Text style={styles.reportSubtitle}>{reportData.report_id}</Text>
                    </View>
                  </View>
                  <Text style={styles.reportGenerated}>
                    Generated: {reportData.generated_at ? format(new Date(reportData.generated_at), 'MMM d, yyyy h:mm a') : 'Now'}
                  </Text>
                </View>

                {/* Salesforce Sync Badge */}
                <View style={[styles.sfSyncBadge, reportData.salesforce_sync_status?.connected && { borderColor: COLORS.green + '30', backgroundColor: COLORS.green + '15' }]}>
                  <Ionicons 
                    name={reportData.salesforce_sync_status?.connected ? "cloud-done" : "cloud-outline"} 
                    size={16} 
                    color={reportData.salesforce_sync_status?.connected ? COLORS.green : COLORS.orange} 
                  />
                  <Text style={[styles.sfSyncText, reportData.salesforce_sync_status?.connected && { color: COLORS.green }]}>
                    {reportData.salesforce_sync_status?.message || 'Mock Data — Configure Salesforce for live sync'}
                  </Text>
                </View>

                {/* Report Summary */}
                <View style={styles.reportSummaryCard}>
                  <Text style={styles.reportSectionTitle}>Summary</Text>
                  <View style={styles.summaryGrid}>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryNumber}>{reportData.summary?.total_equipment || 0}</Text>
                      <Text style={styles.summaryLabel}>Equipment</Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryNumber}>{reportData.summary?.total_readings || 0}</Text>
                      <Text style={styles.summaryLabel}>Readings</Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryNumber}>{reportData.summary?.total_photos || 0}</Text>
                      <Text style={styles.summaryLabel}>Photos</Text>
                    </View>
                    <View style={styles.summaryItem}>
                      <Text style={styles.summaryNumber}>{reportData.summary?.total_service_logs || 0}</Text>
                      <Text style={styles.summaryLabel}>Logs</Text>
                    </View>
                  </View>
                </View>

                {/* Equipment Data Changes */}
                <Text style={styles.reportSectionTitle}>Equipment Data Changes</Text>
                <Text style={styles.reportSectionSubtitle}>Pre vs Post service reading comparisons</Text>

                {reportData.equipment_reports?.map((eqReport: any, idx: number) => (
                  <View key={eqReport.equipment?.id || idx} style={styles.reportEquipmentCard}>
                    <View style={styles.reportEquipmentHeader}>
                      <View style={styles.reportEquipmentIconContainer}>
                        <Ionicons name="cube" size={20} color={COLORS.lime} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reportEquipmentName}>{eqReport.equipment?.name}</Text>
                        <Text style={styles.reportEquipmentType}>
                          {eqReport.equipment?.equipment_type} • {eqReport.equipment?.location || 'N/A'}
                        </Text>
                      </View>
                    </View>

                    {eqReport.has_data ? (
                      <View style={styles.reportReadingsTable}>
                        {/* Table Header */}
                        <View style={styles.reportTableHeader}>
                          <Text style={[styles.reportTableHeaderCell, { flex: 2 }]}>Metric</Text>
                          <Text style={styles.reportTableHeaderCell}>Pre</Text>
                          <Text style={styles.reportTableHeaderCell}>Post</Text>
                          <Text style={styles.reportTableHeaderCell}>Change</Text>
                        </View>

                        {/* Table Rows */}
                        {eqReport.comparisons?.map((comp: any, cIdx: number) => {
                          if (!comp.pre && !comp.post) return null;
                          
                          const diffColor = comp.difference === null ? COLORS.grayDark 
                            : comp.difference > 0 ? COLORS.green 
                            : comp.difference < 0 ? COLORS.red 
                            : COLORS.gray;
                          
                          return (
                            <View key={cIdx} style={styles.reportTableRow}>
                              <View style={[styles.reportTableCell, { flex: 2 }]}>
                                <Text style={styles.reportMetricName}>{comp.reading_type}</Text>
                                <Text style={styles.reportMetricUnit}>{comp.unit}</Text>
                              </View>
                              <View style={styles.reportTableCell}>
                                <Text style={styles.reportValueText}>
                                  {comp.pre ? comp.pre.value : '—'}
                                </Text>
                              </View>
                              <View style={styles.reportTableCell}>
                                <Text style={styles.reportValueText}>
                                  {comp.post ? comp.post.value : '—'}
                                </Text>
                              </View>
                              <View style={styles.reportTableCell}>
                                {comp.difference !== null ? (
                                  <View style={[styles.reportChangeBadge, { backgroundColor: diffColor + '20' }]}>
                                    <Ionicons 
                                      name={comp.difference > 0 ? 'arrow-up' : comp.difference < 0 ? 'arrow-down' : 'remove'} 
                                      size={12} 
                                      color={diffColor} 
                                    />
                                    <Text style={[styles.reportChangeText, { color: diffColor }]}>
                                      {Math.abs(comp.difference)}
                                    </Text>
                                  </View>
                                ) : (
                                  <Text style={styles.reportNoData}>—</Text>
                                )}
                                {comp.percent_change !== null && (
                                  <Text style={[styles.reportPercentText, { color: diffColor }]}>
                                    {comp.percent_change > 0 ? '+' : ''}{comp.percent_change}%
                                  </Text>
                                )}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      <View style={styles.reportNoDataContainer}>
                        <Text style={styles.reportNoDataText}>No readings recorded</Text>
                      </View>
                    )}
                  </View>
                ))}

                {/* Photos Link */}
                <Text style={[styles.reportSectionTitle, { marginTop: 20 }]}>Project Photos</Text>
                <TouchableOpacity 
                  style={styles.photosLinkCard}
                  onPress={() => setActiveTab('photos')}
                >
                  <View style={styles.photosLinkContent}>
                    <View style={styles.photosLinkIconContainer}>
                      <Ionicons name="images" size={28} color={COLORS.lime} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.photosLinkTitle}>
                        View All Photos ({reportData.summary?.total_photos || 0})
                      </Text>
                      <Text style={styles.photosLinkSubtitle}>
                        {reportData.photos?.length > 0 
                          ? `${reportData.photos.filter((p: any) => p.photo_type === 'Equipment').length} equipment, ${reportData.photos.filter((p: any) => p.photo_type === 'General').length} general photos`
                          : 'No photos uploaded yet'}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={22} color={COLORS.lime} />
                  </View>
                </TouchableOpacity>

                {/* Service Logs */}
                {(reportData.service_logs || []).length > 0 && (
                  <View style={{ marginTop: 20 }}>
                    <Text style={styles.reportSectionTitle}>Service Logs</Text>
                    {reportData.service_logs.map((log: any, idx: number) => (
                      <View key={log.id || idx} style={styles.serviceLogCard}>
                        <View style={styles.serviceLogRow}>
                          <Ionicons name="construct" size={16} color={COLORS.lime} />
                          <Text style={styles.serviceLogType}>{log.service_type || 'Service'}</Text>
                          <Text style={styles.serviceLogDate}>
                            {log.created_at ? format(new Date(log.created_at), 'MMM d, yyyy') : ''}
                          </Text>
                        </View>
                        {log.description ? (
                          <Text style={styles.serviceLogDesc}>{log.description}</Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                )}

                {/* Action Buttons */}
                <View style={styles.reportActionButtons}>
                  <TouchableOpacity 
                    style={styles.downloadPdfButton} 
                    onPress={generatePDF}
                    disabled={pdfGenerating}
                  >
                    {pdfGenerating ? (
                      <ActivityIndicator size="small" color={COLORS.white} />
                    ) : (
                      <Ionicons name="download" size={20} color={COLORS.white} />
                    )}
                    <Text style={styles.downloadPdfButtonText}>
                      {pdfGenerating ? 'Generating...' : 'Download PDF'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.regenerateButton} onPress={fetchReport}>
                    <Ionicons name="refresh" size={20} color={COLORS.navy} />
                    <Text style={styles.regenerateButtonText}>Refresh</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.reportEmptyState}>
                <Ionicons name="document-text-outline" size={48} color={COLORS.grayDark} />
                <Text style={styles.reportEmptyTitle}>Generate Project Report</Text>
                <Text style={styles.reportEmptySubtitle}>
                  View equipment data changes, reading comparisons, and project photos
                </Text>
                <TouchableOpacity style={styles.generateButton} onPress={fetchReport}>
                  <Ionicons name="document-text" size={20} color={COLORS.navy} />
                  <Text style={styles.generateButtonText}>Generate Report</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {activeTab === 'equipment' && (
          <View style={styles.tabContent}>
            {equipment.map((item) => (
              <View key={item.id}>
                {renderEquipmentItem({ item })}
              </View>
            ))}
            {equipment.length === 0 && (
              <View style={styles.emptyState}>
                <Ionicons name="cube-outline" size={40} color={COLORS.grayDark} />
                <Text style={styles.emptyText}>No equipment found</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'service' && (
          <View style={styles.tabContent}>
            {service_logs?.map((log: any, index: number) => (
              <View key={log.id || index} style={styles.serviceLogCard}>
                <View style={styles.logHeader}>
                  <View style={styles.logTypeBadge}>
                    <Text style={styles.logTypeText}>{log.service_type}</Text>
                  </View>
                  {log.duration_minutes && (
                    <Text style={styles.logDuration}>{log.duration_minutes} min</Text>
                  )}
                </View>
                <Text style={styles.logDescription}>{log.description}</Text>
                <Text style={styles.logDate}>
                  {log.created_at ? format(new Date(log.created_at), 'MMM d, yyyy h:mm a') : ''}
                </Text>
              </View>
            ))}
            {(!service_logs || service_logs.length === 0) && (
              <View style={styles.emptyState}>
                <Ionicons name="document-text-outline" size={40} color={COLORS.grayDark} />
                <Text style={styles.emptyText}>No service logs yet</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'photos' && (
          <View style={styles.tabContent}>
            {/* Media Action Bar */}
            <View style={styles.mediaActionBar}>
              <TouchableOpacity style={styles.mediaActionBtn} onPress={takePhoto}>
                <Ionicons name="camera" size={20} color={COLORS.navy} />
                <Text style={styles.mediaActionBtnText}>Photo</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.mediaActionBtn} onPress={recordVideo}>
                <Ionicons name="videocam" size={20} color={COLORS.navy} />
                <Text style={styles.mediaActionBtnText}>Video</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.mediaActionBtn} onPress={pickFromGallery}>
                <Ionicons name="images" size={20} color={COLORS.navy} />
                <Text style={styles.mediaActionBtnText}>Gallery</Text>
              </TouchableOpacity>
            </View>

            {/* Media Grid */}
            {(mediaItems.length > 0 || (photos && photos.length > 0)) ? (
              <View style={styles.photosGrid}>
                {mediaItems.map((item: any, index: number) => (
                  <View key={item.id || index} style={styles.photoThumb}>
                    {item.media_type === 'video' ? (
                      <View style={styles.videoThumbOverlay}>
                        <Ionicons name="videocam" size={28} color={COLORS.lime} />
                        {item.duration && (
                          <Text style={styles.videoDuration}>
                            {Math.round((item.duration || 0) / 1000)}s
                          </Text>
                        )}
                      </View>
                    ) : (
                      <Ionicons name="image" size={28} color={COLORS.lime} />
                    )}
                    <Text style={styles.mediaLabel}>
                      {item.media_type === 'video' ? 'Video' : 'Photo'}
                    </Text>
                  </View>
                ))}
                {photos?.map((photo: any, index: number) => (
                  <View key={`photo-${photo.id || index}`} style={styles.photoThumb}>
                    <Ionicons name="image" size={28} color={COLORS.grayDark} />
                    <Text style={styles.mediaLabel}>Photo</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="images-outline" size={40} color={COLORS.grayDark} />
                <Text style={styles.emptyText}>No media yet</Text>
                <Text style={styles.emptySubtext}>Capture photos and videos of your work</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Service Log Modal */}
      <Modal visible={showServiceModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Log Service</Text>
              <TouchableOpacity onPress={() => setShowServiceModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.white} />
              </TouchableOpacity>
            </View>

            {selectedEquipment && (
              <Text style={styles.selectedEquipment}>{selectedEquipment.name}</Text>
            )}

            <View style={styles.serviceTypes}>
              {['Inspection', 'Maintenance', 'Repair', 'Cleaning'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.serviceTypeBtn,
                    serviceForm.service_type === type && styles.serviceTypeBtnActive,
                  ]}
                  onPress={() => setServiceForm({ ...serviceForm, service_type: type })}
                >
                  <Text
                    style={[
                      styles.serviceTypeBtnText,
                      serviceForm.service_type === type && styles.serviceTypeBtnTextActive,
                    ]}
                  >
                    {type}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TextInput
              style={[styles.modalInput, styles.modalTextArea]}
              placeholder="Description of work performed"
              placeholderTextColor={COLORS.grayDark}
              value={serviceForm.description}
              onChangeText={(text) => setServiceForm({ ...serviceForm, description: text })}
              multiline
              numberOfLines={4}
            />

            <TextInput
              style={styles.modalInput}
              placeholder="Duration (minutes)"
              placeholderTextColor={COLORS.grayDark}
              keyboardType="numeric"
              value={serviceForm.duration_minutes}
              onChangeText={(text) => setServiceForm({ ...serviceForm, duration_minutes: text })}
            />

            <TouchableOpacity style={styles.submitButton} onPress={submitServiceLog}>
              <Text style={styles.submitButtonText}>Save Service Log</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Share Project Modal */}
      <Modal visible={showShareModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Share Project</Text>
              <TouchableOpacity onPress={() => setShowShareModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.white} />
              </TouchableOpacity>
            </View>

            <Text style={styles.shareSubtitle}>
              Share with Blue Box Air, Inc. team members
            </Text>

            {/* Native Share Option */}
            <TouchableOpacity style={styles.nativeShareBtn} onPress={nativeShare}>
              <Ionicons name="share-outline" size={20} color={COLORS.lime} />
              <Text style={styles.nativeShareText}>Share via Email / Message</Text>
              <Ionicons name="chevron-forward" size={18} color={COLORS.grayDark} />
            </TouchableOpacity>

            <Text style={styles.shareDividerText}>OR assign to team members</Text>

            {/* Technician List */}
            <ScrollView style={styles.techList} showsVerticalScrollIndicator={false}>
              {technicians.map((tech) => (
                <TouchableOpacity
                  key={tech.id}
                  style={[
                    styles.techItem,
                    selectedTechs.includes(tech.id) && styles.techItemSelected,
                  ]}
                  onPress={() => toggleTechSelection(tech.id)}
                >
                  <View style={styles.techAvatar}>
                    <Ionicons name="person" size={20} color={COLORS.lime} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.techName}>{tech.full_name}</Text>
                    <Text style={styles.techRole}>{tech.title} • {tech.email}</Text>
                  </View>
                  <View style={[
                    styles.techCheckbox,
                    selectedTechs.includes(tech.id) && styles.techCheckboxChecked,
                  ]}>
                    {selectedTechs.includes(tech.id) && (
                      <Ionicons name="checkmark" size={16} color={COLORS.navy} />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Message */}
            <TextInput
              style={[styles.modalInput, { marginTop: 12 }]}
              placeholder="Add a message (optional)"
              placeholderTextColor={COLORS.grayDark}
              value={shareMessage}
              onChangeText={setShareMessage}
            />

            {/* Share Button */}
            <TouchableOpacity
              style={[styles.submitButton, selectedTechs.length === 0 && { opacity: 0.5 }]}
              onPress={shareProject}
              disabled={sharing || selectedTechs.length === 0}
            >
              {sharing ? (
                <ActivityIndicator size="small" color={COLORS.navy} />
              ) : (
                <Text style={styles.submitButtonText}>
                  Share with {selectedTechs.length} technician{selectedTechs.length !== 1 ? 's' : ''}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
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
  headerNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.lime,
  },
  moreButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  projectInfo: {
    padding: 20,
    alignItems: 'flex-start',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
    marginBottom: 12,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '600',
  },
  projectName: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 8,
  },
  projectDescription: {
    fontSize: 15,
    color: COLORS.gray,
    lineHeight: 22,
  },
  infoCard: {
    backgroundColor: COLORS.navyLight,
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 16,
    gap: 16,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  cardRowText: {
    flex: 1,
  },
  cardLabel: {
    fontSize: 12,
    color: COLORS.grayDark,
    marginBottom: 2,
  },
  cardValue: {
    fontSize: 15,
    color: COLORS.white,
    fontWeight: '500',
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 20,
    gap: 12,
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  contactHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.lime,
    letterSpacing: 0.5,
  },
  contactDetails: {
    marginBottom: 14,
  },
  contactName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 2,
  },
  contactTitle: {
    fontSize: 13,
    color: COLORS.grayDark,
    marginBottom: 8,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  contactInfo: {
    fontSize: 14,
    color: COLORS.gray,
  },
  contactActions: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: '#2d4a6f',
    paddingTop: 14,
  },
  callButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.lime,
    borderRadius: 12,
    paddingVertical: 14,
  },
  callButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.navy,
  },
  emailButton: {
    width: 50,
    height: 50,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.navyLight,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
    marginTop: 6,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 2,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 8,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: COLORS.navyLight,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  tabActive: {
    backgroundColor: COLORS.lime,
    borderColor: COLORS.lime,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.gray,
  },
  tabTextActive: {
    color: COLORS.navy,
  },
  tabContent: {
    paddingHorizontal: 20,
  },
  equipmentCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  equipmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  equipmentIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: COLORS.lime + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  equipmentInfo: {
    flex: 1,
  },
  equipmentName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.white,
  },
  equipmentType: {
    fontSize: 13,
    color: COLORS.lime,
  },
  equipmentDetails: {
    gap: 6,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
  },
  detailRow: {
    flexDirection: 'row',
  },
  detailLabel: {
    fontSize: 13,
    color: COLORS.grayDark,
    width: 70,
  },
  detailValue: {
    flex: 1,
    fontSize: 13,
    color: COLORS.gray,
  },
  equipmentActions: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: COLORS.lime + '20',
    borderRadius: 8,
  },
  actionText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.lime,
  },
  serviceLogCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logTypeBadge: {
    backgroundColor: COLORS.lime + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  logTypeText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.lime,
  },
  logDuration: {
    fontSize: 12,
    color: COLORS.gray,
  },
  logDescription: {
    fontSize: 14,
    color: COLORS.white,
    marginBottom: 8,
  },
  logDate: {
    fontSize: 12,
    color: COLORS.grayDark,
  },
  photosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoThumb: {
    width: '31%',
    aspectRatio: 1,
    backgroundColor: COLORS.navyLight,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: COLORS.grayDark,
    marginTop: 12,
  },
  addPhotoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.lime,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  addPhotoBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.navy,
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
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.white,
  },
  selectedEquipment: {
    fontSize: 15,
    color: COLORS.lime,
    marginBottom: 16,
  },
  serviceTypes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  serviceTypeBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: COLORS.navy,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  serviceTypeBtnActive: {
    backgroundColor: COLORS.lime,
    borderColor: COLORS.lime,
  },
  serviceTypeBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.gray,
  },
  serviceTypeBtnTextActive: {
    color: COLORS.navy,
  },
  modalInput: {
    backgroundColor: COLORS.navy,
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: COLORS.white,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  modalTextArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: COLORS.lime,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.navy,
  },
  // ============ Report Styles ============
  reportLoadingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  reportLoadingText: {
    fontSize: 14,
    color: COLORS.gray,
    marginTop: 12,
  },
  reportHeader: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  reportTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  reportTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
  },
  reportSubtitle: {
    fontSize: 11,
    color: COLORS.grayDark,
    marginTop: 2,
  },
  reportGenerated: {
    fontSize: 12,
    color: COLORS.gray,
  },
  sfSyncBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.orange + '15',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.orange + '30',
  },
  sfSyncText: {
    fontSize: 12,
    color: COLORS.orange,
    fontWeight: '500',
  },
  reportSummaryCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  reportSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 4,
  },
  reportSectionSubtitle: {
    fontSize: 12,
    color: COLORS.grayDark,
    marginBottom: 14,
  },
  summaryGrid: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: COLORS.navy,
    borderRadius: 10,
    padding: 12,
  },
  summaryNumber: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.lime,
  },
  summaryLabel: {
    fontSize: 11,
    color: COLORS.gray,
    marginTop: 2,
  },
  reportEquipmentCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  reportEquipmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
  },
  reportEquipmentIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.lime + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  reportEquipmentName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  reportEquipmentType: {
    fontSize: 12,
    color: COLORS.grayDark,
    marginTop: 2,
  },
  reportReadingsTable: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  reportTableHeader: {
    flexDirection: 'row',
    backgroundColor: COLORS.navy,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 4,
  },
  reportTableHeaderCell: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.grayDark,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  reportTableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f20',
    alignItems: 'center',
  },
  reportTableCell: {
    flex: 1,
    alignItems: 'center',
  },
  reportMetricName: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.white,
  },
  reportMetricUnit: {
    fontSize: 10,
    color: COLORS.grayDark,
  },
  reportValueText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  reportChangeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  reportChangeText: {
    fontSize: 13,
    fontWeight: '700',
  },
  reportPercentText: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 2,
  },
  reportNoData: {
    fontSize: 14,
    color: COLORS.grayDark,
  },
  reportNoDataContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  reportNoDataText: {
    fontSize: 13,
    color: COLORS.grayDark,
    fontStyle: 'italic',
  },
  photosLinkCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.lime + '30',
  },
  photosLinkContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  photosLinkIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.lime + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  photosLinkTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.lime,
  },
  photosLinkSubtitle: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 3,
  },
  regenerateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.lime,
    paddingVertical: 14,
    borderRadius: 12,
    flex: 1,
  },
  regenerateButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.navy,
  },
  reportActionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    marginBottom: 10,
  },
  downloadPdfButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingVertical: 14,
    borderRadius: 12,
    flex: 1,
  },
  downloadPdfButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  serviceLogCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  serviceLogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  serviceLogType: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
    flex: 1,
  },
  serviceLogDate: {
    fontSize: 12,
    color: COLORS.grayDark,
  },
  serviceLogDesc: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 6,
    marginLeft: 24,
  },
  reportEmptyState: {
    alignItems: 'center',
    paddingVertical: 50,
  },
  reportEmptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.white,
    marginTop: 16,
  },
  reportEmptySubtitle: {
    fontSize: 13,
    color: COLORS.gray,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
    lineHeight: 20,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.lime,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.navy,
  },
  // Media styles
  mediaActionBar: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  mediaActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.lime,
    paddingVertical: 12,
    borderRadius: 10,
  },
  mediaActionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.navy,
  },
  videoThumbOverlay: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoDuration: {
    fontSize: 10,
    color: COLORS.lime,
    marginTop: 2,
    fontWeight: '600',
  },
  mediaLabel: {
    fontSize: 10,
    color: COLORS.grayDark,
    marginTop: 4,
  },
  // Share styles
  shareSubtitle: {
    fontSize: 13,
    color: COLORS.gray,
    marginBottom: 16,
  },
  nativeShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.navyLight,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.lime + '30',
    marginBottom: 16,
  },
  nativeShareText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.lime,
  },
  shareDividerText: {
    fontSize: 12,
    color: COLORS.grayDark,
    textAlign: 'center',
    marginBottom: 12,
  },
  techList: {
    maxHeight: 240,
  },
  techItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    marginBottom: 6,
    backgroundColor: COLORS.navy,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  techItemSelected: {
    borderColor: COLORS.lime,
    backgroundColor: COLORS.lime + '10',
  },
  techAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.lime + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  techName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
  },
  techRole: {
    fontSize: 11,
    color: COLORS.grayDark,
    marginTop: 2,
  },
  techCheckbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2d4a6f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  techCheckboxChecked: {
    backgroundColor: COLORS.lime,
    borderColor: COLORS.lime,
  },
});
