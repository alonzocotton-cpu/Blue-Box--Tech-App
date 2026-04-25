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
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Paths, File } from 'expo-file-system';
import { writeAsStringAsync, EncodingType, cacheDirectory } from 'expo-file-system/legacy';
import { format } from 'date-fns';

import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_BASE_URL } from '../../utils/api';

const API_URL = API_BASE_URL;

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
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [showMediaViewer, setShowMediaViewer] = useState(false);
  
  // Share state
  const [showShareModal, setShowShareModal] = useState(false);
  const [technicians, setTechnicians] = useState<any[]>([]);
  const [selectedTechs, setSelectedTechs] = useState<string[]>([]);
  const [shareMessage, setShareMessage] = useState('');
  const [sharing, setSharing] = useState(false);

  // Report upload state
  const [reportUploading, setReportUploading] = useState(false);
  const [reportUploadResult, setReportUploadResult] = useState<any>(null);

  // Assigned technicians state
  const [assignedTechs, setAssignedTechs] = useState<any[]>([]);
  const [showAssignTechModal, setShowAssignTechModal] = useState(false);

  // Auto-load team members when assign modal opens
  useEffect(() => {
    if (showAssignTechModal) {
      searchTechnicians('');
    }
  }, [showAssignTechModal]);
  const [techSearch, setTechSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchingTechs, setSearchingTechs] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserEmail, setCurrentUserEmail] = useState('');

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
    loadUserContext();
    fetchAssignedTechs();
  }, [id]);

  const loadUserContext = async () => {
    try {
      const techStr = await AsyncStorage.getItem('technician');
      if (techStr) {
        const tech = JSON.parse(techStr);
        const email = tech.email || '';
        setCurrentUserEmail(email);
        const adminRes = await fetch(`${API_URL}/api/admin/check?email=${encodeURIComponent(email)}`);
        const adminData = await adminRes.json();
        setIsAdmin(adminData.is_admin || false);
      }
    } catch (error) {
      console.error('Error loading user context:', error);
    }
  };

  const fetchAssignedTechs = async () => {
    try {
      const response = await fetch(`${API_URL}/api/projects/${id}/technicians`);
      const data = await response.json();
      setAssignedTechs(data.technicians || []);
    } catch (error) {
      console.error('Error fetching assigned techs:', error);
    }
  };

  const searchTechnicians = async (query: string) => {
    setTechSearch(query);
    if (query.length < 1) {
      // Show all team members when search is empty (for easy browsing)
      setSearchingTechs(true);
      try {
        const response = await fetch(`${API_URL}/api/team/members`);
        const data = await response.json();
        const assignedEmails = assignedTechs.map((t: any) => t.email?.toLowerCase());
        const assignedNames = assignedTechs.map((t: any) => t.name?.toLowerCase());
        const filtered = (data.members || []).filter((m: any) => 
          !assignedEmails.includes(m.email?.toLowerCase()) &&
          !assignedNames.includes(m.name?.toLowerCase())
        );
        setSearchResults(filtered);
      } catch (error) {
        console.error('Error loading team members:', error);
        setSearchResults([]);
      } finally {
        setSearchingTechs(false);
      }
      return;
    }
    setSearchingTechs(true);
    try {
      // Search team members from the org chart
      const response = await fetch(`${API_URL}/api/team/members?search=${encodeURIComponent(query)}`);
      const data = await response.json();
      const assignedEmails = assignedTechs.map((t: any) => t.email?.toLowerCase());
      const assignedNames = assignedTechs.map((t: any) => t.name?.toLowerCase());
      const filtered = (data.members || []).filter((m: any) => 
        !assignedEmails.includes(m.email?.toLowerCase()) &&
        !assignedNames.includes(m.name?.toLowerCase())
      );
      setSearchResults(filtered);
      
      // Also try Salesforce users if team search returns few results
      if (filtered.length < 3) {
        try {
          const sfResponse = await fetch(`${API_URL}/api/salesforce/users?search=${encodeURIComponent(query)}`);
          const sfData = await sfResponse.json();
          const existingNames = new Set(filtered.map((m: any) => m.name?.toLowerCase()));
          const sfFiltered = (sfData.users || []).filter((u: any) => 
            !assignedEmails.includes(u.email?.toLowerCase()) &&
            !existingNames.has((u.name || u.full_name)?.toLowerCase())
          );
          setSearchResults([...filtered, ...sfFiltered]);
        } catch (e) {
          // SF search failed, just use team results
        }
      }
    } catch (error) {
      console.error('Error searching team members:', error);
      setSearchResults([]);
    } finally {
      setSearchingTechs(false);
    }
  };

  const assignTechToProject = async (tech: any) => {
    try {
      const response = await fetch(`${API_URL}/api/projects/${id}/technicians`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: tech.name || tech.full_name,
          email: tech.email,
          role: tech.title || tech.role || 'Technician',
          user_id: tech.id || tech.salesforce_id || '',
          requester_email: currentUserEmail,
        }),
      });
      const data = await response.json();
      if (data.success) {
        Alert.alert('Assigned', `${tech.name || tech.full_name} added to project`);
        fetchAssignedTechs();
        setTechSearch('');
        setSearchResults([]);
        setShowAssignTechModal(false);
      } else {
        Alert.alert('Error', data.detail || 'Failed to assign technician');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to assign technician');
    }
  };

  const removeTechFromProject = (tech: any) => {
    if (!isAdmin) return;
    Alert.alert('Remove Technician', `Remove ${tech.name} from this project?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            const assignId = tech._id || tech.user_id;
            const response = await fetch(
              `${API_URL}/api/projects/${id}/technicians/${assignId}?email=${encodeURIComponent(currentUserEmail)}`,
              { method: 'DELETE' }
            );
            const data = await response.json();
            if (data.success) {
              fetchAssignedTechs();
            } else {
              Alert.alert('Error', data.detail || 'Failed to remove');
            }
          } catch (error) {
            Alert.alert('Error', 'Failed to remove technician');
          }
        },
      },
    ]);
  };

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
            const diffColor = comp.difference === null ? '#7a8ea3' 
              : comp.difference > 0 ? '#4ade80' 
              : comp.difference < 0 ? '#f87171' 
              : '#7a8ea3';
            const diffClass = comp.difference === null ? 'change-neutral' 
              : comp.difference > 0 ? 'change-up' 
              : comp.difference < 0 ? 'change-down' 
              : 'change-neutral';
            const diffDisplay = comp.difference !== null 
              ? `<span class="${diffClass}">${comp.difference > 0 ? '+' : ''}${comp.difference} ${comp.unit}</span>` 
              : '<span class="change-neutral">—</span>';
            const pctDisplay = comp.percent_change !== null
              ? `<br/><span style="color:${diffColor};font-size:11px">(${comp.percent_change > 0 ? '+' : ''}${comp.percent_change}%)</span>`
              : '';
            
            readingsRows += `
              <tr>
                <td style="font-weight:500;">${comp.reading_type}<br/><span style="color:#7a8ea3;font-size:11px">${comp.unit}</span></td>
                <td style="font-weight:600">${comp.pre ? comp.pre.value : '—'}</td>
                <td style="font-weight:600">${comp.post ? comp.post.value : '—'}</td>
                <td>${diffDisplay}${pctDisplay}</td>
              </tr>`;
          });
        } else {
          readingsRows = '<tr><td colspan="4" class="no-data">No readings recorded</td></tr>';
        }
        
        equipmentHTML += `
          <div class="eq-card">
            <div class="eq-name">${eq.name || 'Unknown'}</div>
            <div class="eq-meta">${eq.equipment_type || ''} \u2022 ${eq.location || 'N/A'}</div>
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Pre</th>
                  <th>Post</th>
                  <th>Change</th>
                </tr>
              </thead>
              <tbody>${readingsRows}</tbody>
            </table>
          </div>`;
      });

      // Build photos section
      const photoCount = summary.total_photos || 0;
      const photosHTML = `
        <div class="photos-card">
          <div class="photos-title">Project Photos (${photoCount})</div>
          <div class="photos-detail">
            ${photoCount > 0 ? photoCount + ' photo(s) attached to this project' : 'No photos uploaded yet'}
          </div>
        </div>`;

      // Build contact card HTML separately
      let contactCardHTML = '';
      if (reportData.primary_contact) {
        const pc = reportData.primary_contact;
        contactCardHTML = '<div class="contact-card">'
          + '<div class="label">Primary Contact</div>'
          + '<div class="name">' + (pc.name || '') + '</div>'
          + '<div class="detail">' + (pc.title || '') + '</div>'
          + '<div class="detail">' + (pc.phone || '') + (pc.email ? ' - ' + pc.email : '') + '</div>'
          + '</div>';
      }

      // Build SF badge
      const sfBadgeText = sfStatus.mode === 'live' 
        ? 'Salesforce Connected' 
        : 'Mock Data - Configure credentials for live Salesforce sync';

      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              @page { margin: 0; }
              * { box-sizing: border-box; }
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; background: #0a1929; color: #e0e0e0; padding: 0; margin: 0; }
              .brand-bar { background: linear-gradient(135deg, #0d2137 0%, #132f4c 100%); padding: 28px 32px 24px; text-align: center; border-bottom: 3px solid #a3e635; }
              .brand-logo { width: 60px; height: 60px; border-radius: 14px; margin: 0 auto 10px; display: block; }
              .brand-name { font-size: 26px; font-weight: 800; color: #ffffff; letter-spacing: 4px; margin: 0; text-transform: uppercase; }
              .brand-tagline { font-size: 11px; color: #a3e635; letter-spacing: 2px; text-transform: uppercase; margin-top: 4px; }
              .report-meta { background: #0d2137; padding: 20px 32px; border-bottom: 1px solid #1a3a5c; }
              .report-meta h2 { color: #ffffff; font-size: 20px; font-weight: 700; margin: 0 0 4px; }
              .report-meta p { color: #7a8ea3; font-size: 12px; margin: 2px 0; }
              .content { padding: 20px 32px 32px; }
              .contact-card { background: #132f4c; border-radius: 12px; padding: 16px 18px; margin-bottom: 18px; border-left: 3px solid #a3e635; }
              .contact-card .label { color: #a3e635; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700; margin-bottom: 6px; }
              .contact-card .name { color: #fff; font-size: 15px; font-weight: 700; }
              .contact-card .detail { color: #7a8ea3; font-size: 12px; margin-top: 2px; }
              .sf-badge { background: rgba(255,152,0,0.08); border: 1px solid rgba(255,152,0,0.2); border-radius: 8px; padding: 10px 16px; margin-bottom: 18px; color: #FF9800; font-size: 12px; display: flex; align-items: center; gap: 8px; }
              .summary { display: flex; gap: 10px; margin-bottom: 24px; }
              .summary-item { flex: 1; background: #132f4c; border-radius: 12px; padding: 16px 12px; text-align: center; border: 1px solid #1a3a5c; }
              .summary-number { font-size: 28px; font-weight: 800; color: #a3e635; }
              .summary-label { font-size: 10px; color: #7a8ea3; margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
              .section-title { font-size: 16px; font-weight: 700; color: #ffffff; margin: 24px 0 4px; letter-spacing: 0.5px; }
              .section-subtitle { font-size: 12px; color: #7a8ea3; margin-bottom: 14px; }
              .eq-card { background: #132f4c; border-radius: 12px; padding: 18px; margin-bottom: 14px; border: 1px solid #1a3a5c; }
              .eq-name { font-size: 16px; font-weight: 700; color: #fff; margin-bottom: 2px; }
              .eq-meta { font-size: 11px; color: #7a8ea3; margin-bottom: 14px; }
              table { width: 100%; border-collapse: collapse; color: #e0e0e0; font-size: 13px; }
              thead tr { background: #0a1929; }
              th { padding: 8px 10px; text-align: left; font-weight: 700; color: #7a8ea3; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
              th:not(:first-child) { text-align: center; }
              td { padding: 10px 10px; border-bottom: 1px solid #1a3a5c; }
              td:not(:first-child) { text-align: center; font-weight: 600; }
              .change-up { color: #4ade80; font-weight: 700; }
              .change-down { color: #f87171; font-weight: 700; }
              .change-neutral { color: #7a8ea3; }
              .photos-card { background: #132f4c; border-radius: 12px; padding: 16px 18px; margin-top: 18px; border: 1px solid rgba(163,230,53,0.25); }
              .photos-title { font-size: 15px; font-weight: 600; color: #a3e635; }
              .photos-detail { font-size: 12px; color: #7a8ea3; margin-top: 4px; }
              .footer { text-align: center; margin-top: 36px; padding: 20px 32px; border-top: 2px solid #1a3a5c; background: #0d2137; }
              .footer-brand { font-size: 14px; font-weight: 700; color: #a3e635; letter-spacing: 2px; }
              .footer-tagline { font-size: 10px; color: #7a8ea3; margin-top: 2px; letter-spacing: 1px; }
              .footer-note { font-size: 10px; color: #4a5f76; margin-top: 8px; }
              .no-data { text-align: center; padding: 20px; color: #4a5f76; font-style: italic; font-size: 13px; }
            </style>
          </head>
          <body>
            <div class="brand-bar">
              <img class="brand-logo" src="https://customer-assets.emergentagent.com/job_ff19b27f-9c44-4d68-b174-1452a3057557/artifacts/2vycib7s_IMG_2827.jpeg" alt="Blue Box Air" />
              <div class="brand-name">Blue Box Air</div>
              <div class="brand-tagline">Coil Management Solutions</div>
            </div>

            <div class="report-meta">
              <h2>${project.name || 'Service Report'}</h2>
              <p>Report ID: ${reportData.report_id || 'N/A'}</p>
              <p>Generated: ${reportData.generated_at ? format(new Date(reportData.generated_at), 'MMM d, yyyy h:mm a') : 'Now'}</p>
              <p>Client: ${project.client_name || project.client || 'N/A'} \u2022 ${project.address || 'N/A'}</p>
            </div>

            <div class="content">
              ${contactCardHTML}

              <div class="sf-badge">
                ${sfBadgeText}
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
            </div>

            <div class="footer">
              <div class="footer-brand">BLUE BOX AIR, INC.</div>
              <div class="footer-tagline">Coil Management Solutions</div>
              <div class="footer-note">Technician Service Report \u2022 Auto-generated from equipment service data</div>
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

  const generateAndShareReport = async () => {
    setReportUploading(true);
    setReportUploadResult(null);
    try {
      // Get technician info from AsyncStorage
      let techName = 'Unknown Technician';
      let techEmail = '';
      try {
        const techStr = await AsyncStorage.getItem('technician');
        if (techStr) {
          const tech = JSON.parse(techStr);
          techName = tech.full_name || tech.name || 'Unknown Technician';
          techEmail = tech.email || '';
        }
      } catch {}

      // Call the backend to generate PDF + upload to Salesforce
      const response = await fetch(`${API_URL}/api/projects/${id}/generate-report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          technician_name: techName,
          technician_email: techEmail,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || 'Failed to generate report');
      }

      const result = await response.json();
      setReportUploadResult(result);

      // Show Salesforce upload status
      const sfUpload = result.salesforce_upload || {};
      if (sfUpload.success) {
        // Don't alert here yet, we'll show it inline
      }

      // Save PDF and share
      if (result.pdf_base64) {
        if (Platform.OS === 'web') {
          // On web: create a blob and download
          const byteCharacters = atob(result.pdf_base64);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: 'application/pdf' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = result.filename || 'BBA_Report.pdf';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);

          Alert.alert(
            'Report Generated',
            `PDF downloaded.${sfUpload.success ? ' File also uploaded to Salesforce.' : ''}`,
          );
        } else {
          // On mobile: save to file system and share
          const fileUri = `${cacheDirectory}${result.filename || 'BBA_Report.pdf'}`;
          await writeAsStringAsync(fileUri, result.pdf_base64, {
            encoding: EncodingType.Base64,
          });

          const canShare = await Sharing.isAvailableAsync();
          if (canShare) {
            await Sharing.shareAsync(fileUri, {
              mimeType: 'application/pdf',
              dialogTitle: 'Share Service Report via Gmail',
              UTI: 'com.adobe.pdf',
            });
          } else {
            Alert.alert(
              'Report Generated',
              `Report saved to device.${sfUpload.success ? '\nFile uploaded to Salesforce.' : ''}`,
            );
          }
        }
      }
    } catch (error: any) {
      console.error('Report generation error:', error);
      Alert.alert('Error', error.message || 'Failed to generate report');
    } finally {
      setReportUploading(false);
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

  const handleDeleteMedia = (item: any) => {
    Alert.alert(
      'Delete Media',
      `Delete this ${item.media_type === 'video' ? 'video' : 'photo'}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch(`${API_URL}/api/media/${item.id}`, { method: 'DELETE' });
              setMediaItems(prev => prev.filter(m => m.id !== item.id));
              setShowMediaViewer(false);
              setSelectedMedia(null);
            } catch (error) {
              Alert.alert('Error', 'Failed to delete media');
            }
          },
        },
      ]
    );
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
            showMediaOptions();
          }}
        >
          <Ionicons name="camera" size={18} color={COLORS.lime} />
          <Text style={styles.actionText}>Media</Text>
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

        {/* Assigned Technicians Section */}
        <View style={styles.assignedTechSection}>
          <View style={styles.assignedTechHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="people" size={18} color={COLORS.lime} />
              <Text style={styles.assignedTechTitle}>
                Assigned Techs ({assignedTechs.length})
              </Text>
            </View>
            {isAdmin && (
              <TouchableOpacity
                style={styles.addTechButton}
                onPress={() => setShowAssignTechModal(true)}
              >
                <Ionicons name="person-add" size={16} color={COLORS.navy} />
                <Text style={styles.addTechButtonText}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
          {assignedTechs.length === 0 ? (
            <Text style={styles.noTechsText}>No technicians assigned yet</Text>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              {assignedTechs.map((tech: any, idx: number) => (
                <TouchableOpacity
                  key={tech._id || idx}
                  style={styles.techChip}
                  onLongPress={() => isAdmin && removeTechFromProject(tech)}
                  activeOpacity={isAdmin ? 0.7 : 1}
                >
                  <View style={styles.techChipAvatar}>
                    <Text style={styles.techChipInitial}>
                      {(tech.name || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.techChipName} numberOfLines={1}>{tech.name}</Text>
                    <Text style={styles.techChipRole} numberOfLines={1}>{tech.role || 'Technician'}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
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
                {/* Branded Report Header */}
                <View style={styles.reportBrandHeader}>
                  <Image
                    source={{ uri: 'https://customer-assets.emergentagent.com/job_ff19b27f-9c44-4d68-b174-1452a3057557/artifacts/2vycib7s_IMG_2827.jpeg' }}
                    style={styles.reportBrandLogo}
                    resizeMode="contain"
                  />
                  <View>
                    <Text style={styles.reportBrandName}>BLUE BOX AIR</Text>
                    <Text style={styles.reportBrandTagline}>Coil Management Solutions</Text>
                  </View>
                </View>

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

                {/* Primary Contact in Report */}
                {reportData.primary_contact && (
                  <View style={styles.reportContactCard}>
                    <View style={styles.reportContactHeader}>
                      <Ionicons name="person-circle" size={18} color={COLORS.lime} />
                      <Text style={styles.reportContactTitle}>Primary Contact</Text>
                    </View>
                    <Text style={styles.reportContactName}>{reportData.primary_contact.name}</Text>
                    <Text style={styles.reportContactDetail}>{reportData.primary_contact.title}</Text>
                    {reportData.primary_contact.phone ? (
                      <TouchableOpacity
                        onPress={() => {
                          const phone = reportData.primary_contact.phone.replace(/[^\d+]/g, '');
                          Linking.openURL(`tel:${phone}`).catch(() => {});
                        }}
                        style={styles.reportContactPhoneRow}
                      >
                        <Ionicons name="call" size={14} color={COLORS.lime} />
                        <Text style={styles.reportContactPhone}>{reportData.primary_contact.phone}</Text>
                      </TouchableOpacity>
                    ) : null}
                    {reportData.primary_contact.email ? (
                      <View style={styles.reportContactPhoneRow}>
                        <Ionicons name="mail" size={14} color={COLORS.gray} />
                        <Text style={styles.reportContactDetail}>{reportData.primary_contact.email}</Text>
                      </View>
                    ) : null}
                  </View>
                )}

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
                  {/* Primary: Generate, Upload to SF & Share */}
                  <TouchableOpacity 
                    style={[styles.downloadPdfButton, { backgroundColor: COLORS.lime }]} 
                    onPress={generateAndShareReport}
                    disabled={reportUploading}
                  >
                    {reportUploading ? (
                      <ActivityIndicator size="small" color={COLORS.navy} />
                    ) : (
                      <Ionicons name="cloud-upload" size={20} color={COLORS.navy} />
                    )}
                    <Text style={[styles.downloadPdfButtonText, { color: COLORS.navy }]}>
                      {reportUploading ? 'Generating & Uploading...' : 'Generate & Share Report'}
                    </Text>
                  </TouchableOpacity>

                  {/* Salesforce upload result */}
                  {reportUploadResult && (
                    <View style={{
                      backgroundColor: reportUploadResult.salesforce_upload?.success 
                        ? COLORS.green + '15' : COLORS.orange + '15',
                      borderRadius: 10,
                      padding: 12,
                      marginTop: 10,
                      borderLeftWidth: 3,
                      borderLeftColor: reportUploadResult.salesforce_upload?.success 
                        ? COLORS.green : COLORS.orange,
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <Ionicons 
                          name={reportUploadResult.salesforce_upload?.success ? 'cloud-done' : 'cloud-offline'} 
                          size={16} 
                          color={reportUploadResult.salesforce_upload?.success ? COLORS.green : COLORS.orange} 
                        />
                        <Text style={{ 
                          color: reportUploadResult.salesforce_upload?.success ? COLORS.green : COLORS.orange,
                          fontWeight: '700', fontSize: 12, marginLeft: 6,
                        }}>
                          {reportUploadResult.salesforce_upload?.success 
                            ? 'Uploaded to Salesforce' 
                            : 'Salesforce Upload Pending'}
                        </Text>
                      </View>
                      <Text style={{ color: COLORS.gray, fontSize: 11 }}>
                        {reportUploadResult.salesforce_upload?.success 
                          ? 'Report file attached to this Opportunity in Salesforce.'
                          : (reportUploadResult.salesforce_upload?.error || 'Login via Salesforce to enable upload.')}
                      </Text>
                    </View>
                  )}

                  {/* Report Averages Summary */}
                  {reportUploadResult?.report_data && (
                    <View style={{
                      backgroundColor: COLORS.navyLight,
                      borderRadius: 12,
                      padding: 16,
                      marginTop: 14,
                      borderWidth: 1,
                      borderColor: COLORS.lime + '30',
                    }}>
                      <Text style={{ color: COLORS.lime, fontWeight: '800', fontSize: 13, marginBottom: 10, letterSpacing: 0.5 }}>
                        REPORT AVERAGES
                      </Text>
                      
                      {/* Per-unit averages */}
                      {reportUploadResult.report_data.unit_averages?.length > 0 && (
                        <>
                          <Text style={{ color: COLORS.gray, fontSize: 10, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                            Per Unit
                          </Text>
                          {reportUploadResult.report_data.unit_averages.map((ua: any, idx: number) => (
                            <View key={idx} style={{
                              backgroundColor: COLORS.navy,
                              borderRadius: 8,
                              padding: 10,
                              marginBottom: 6,
                            }}>
                              <Text style={{ color: COLORS.white, fontWeight: '600', fontSize: 12, marginBottom: 4 }}>
                                {ua.equipment_name}
                              </Text>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ color: COLORS.gray, fontSize: 9, textTransform: 'uppercase' }}>Avg DP Drop</Text>
                                  <Text style={{ color: ua.avg_pressure_drop != null ? COLORS.green : COLORS.grayDark, fontWeight: '700', fontSize: 14 }}>
                                    {ua.avg_pressure_drop != null ? `${ua.avg_pressure_drop} inWC` : '—'}
                                  </Text>
                                </View>
                                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                                  <Text style={{ color: COLORS.gray, fontSize: 9, textTransform: 'uppercase' }}>Avg Airflow Increase</Text>
                                  <Text style={{ color: ua.avg_airflow_increase != null ? COLORS.lime : COLORS.grayDark, fontWeight: '700', fontSize: 14 }}>
                                    {ua.avg_airflow_increase != null ? `${ua.avg_airflow_increase} FPM` : '—'}
                                  </Text>
                                </View>
                              </View>
                            </View>
                          ))}
                        </>
                      )}

                      {/* Overall averages */}
                      <Text style={{ color: COLORS.gray, fontSize: 10, fontWeight: '600', marginTop: 10, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>
                        Overall Project Averages
                      </Text>
                      <View style={{
                        backgroundColor: COLORS.navy,
                        borderRadius: 8,
                        padding: 12,
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        borderWidth: 1,
                        borderColor: COLORS.lime + '25',
                      }}>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: COLORS.gray, fontSize: 9, textTransform: 'uppercase' }}>Avg Decrease DP</Text>
                          <Text style={{ 
                            color: reportUploadResult.report_data.overall_averages?.avg_pressure_drop != null ? COLORS.green : COLORS.grayDark, 
                            fontWeight: '800', fontSize: 18 
                          }}>
                            {reportUploadResult.report_data.overall_averages?.avg_pressure_drop != null 
                              ? `${reportUploadResult.report_data.overall_averages.avg_pressure_drop} inWC` 
                              : 'No data'}
                          </Text>
                        </View>
                        <View style={{ flex: 1, alignItems: 'flex-end' }}>
                          <Text style={{ color: COLORS.gray, fontSize: 9, textTransform: 'uppercase' }}>Avg Increase Airflow</Text>
                          <Text style={{ 
                            color: reportUploadResult.report_data.overall_averages?.avg_airflow_increase != null ? COLORS.lime : COLORS.grayDark, 
                            fontWeight: '800', fontSize: 18 
                          }}>
                            {reportUploadResult.report_data.overall_averages?.avg_airflow_increase != null 
                              ? `${reportUploadResult.report_data.overall_averages.avg_airflow_increase} FPM` 
                              : 'No data'}
                          </Text>
                        </View>
                      </View>
                    </View>
                  )}

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                    {/* Secondary: Download local PDF */}
                    <TouchableOpacity 
                      style={[styles.regenerateButton, { flex: 1 }]} 
                      onPress={generatePDF}
                      disabled={pdfGenerating}
                    >
                      {pdfGenerating ? (
                        <ActivityIndicator size="small" color={COLORS.navy} />
                      ) : (
                        <Ionicons name="download" size={18} color={COLORS.navy} />
                      )}
                      <Text style={styles.regenerateButtonText}>
                        {pdfGenerating ? 'Generating...' : 'Local PDF'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity style={[styles.regenerateButton, { flex: 1 }]} onPress={fetchReport}>
                      <Ionicons name="refresh" size={18} color={COLORS.navy} />
                      <Text style={styles.regenerateButtonText}>Refresh</Text>
                    </TouchableOpacity>
                  </View>
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
            {/* Single Add Media Button */}
            <TouchableOpacity style={styles.addMediaBtn} onPress={showMediaOptions}>
              <Ionicons name="add-circle" size={22} color={COLORS.navy} />
              <Text style={styles.addMediaBtnText}>Add Photo or Video</Text>
            </TouchableOpacity>

            {/* Media Count */}
            {mediaItems.length > 0 && (
              <Text style={{ color: COLORS.gray, fontSize: 12, marginBottom: 12 }}>
                {mediaItems.filter(m => m.media_type === 'photo').length} Photos · {mediaItems.filter(m => m.media_type === 'video').length} Videos
              </Text>
            )}

            {/* Media Grid */}
            {mediaItems.length > 0 ? (
              <View style={styles.photosGrid}>
                {mediaItems.map((item: any, index: number) => (
                  <TouchableOpacity
                    key={item.id || index}
                    style={styles.photoThumb}
                    onPress={() => {
                      setSelectedMedia(item);
                      setShowMediaViewer(true);
                    }}
                    activeOpacity={0.8}
                  >
                    {item.media_uri && item.media_uri.startsWith('data:image') ? (
                      <Image
                        source={{ uri: item.media_uri }}
                        style={styles.photoThumbImage}
                        resizeMode="cover"
                      />
                    ) : item.media_type === 'video' ? (
                      <View style={styles.videoThumbOverlay}>
                        <Ionicons name="play-circle" size={36} color={COLORS.lime} />
                        {item.duration && (
                          <Text style={styles.videoDuration}>
                            {Math.round((item.duration || 0) / 1000)}s
                          </Text>
                        )}
                      </View>
                    ) : (
                      <View style={styles.videoThumbOverlay}>
                        <Ionicons name="image" size={32} color={COLORS.lime} />
                      </View>
                    )}
                    {/* Type badge */}
                    <View style={[styles.mediaTypeBadge, { backgroundColor: item.media_type === 'video' ? '#ef444480' : COLORS.lime + '80' }]}>
                      <Text style={styles.mediaTypeBadgeText}>
                        {item.media_type === 'video' ? 'VID' : 'IMG'}
                      </Text>
                    </View>
                    {/* Timestamp */}
                    {item.created_at && (
                      <Text style={styles.mediaTimestamp}>
                        {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    )}
                    {/* Delete button */}
                    <TouchableOpacity
                      style={styles.mediaDeleteBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        handleDeleteMedia(item);
                      }}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="trash" size={14} color="#fff" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons name="images-outline" size={40} color={COLORS.grayDark} />
                <Text style={styles.emptyText}>No media yet</Text>
                <Text style={styles.emptyText}>Capture photos and videos of your work</Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Full Screen Media Viewer */}
      <Modal visible={showMediaViewer} animationType="fade" transparent>
        <View style={styles.mediaViewerOverlay}>
          <View style={styles.mediaViewerHeader}>
            <TouchableOpacity onPress={() => setShowMediaViewer(false)}>
              <Ionicons name="close" size={28} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.mediaViewerTitle}>
              {selectedMedia?.media_type === 'video' ? 'Video' : 'Photo'}
              {selectedMedia?.caption ? ` - ${selectedMedia.caption}` : ''}
            </Text>
            <TouchableOpacity onPress={() => selectedMedia && handleDeleteMedia(selectedMedia)}>
              <Ionicons name="trash-outline" size={24} color="#ef4444" />
            </TouchableOpacity>
          </View>
          <View style={styles.mediaViewerBody}>
            {selectedMedia?.media_uri && selectedMedia.media_uri.startsWith('data:image') ? (
              <Image
                source={{ uri: selectedMedia.media_uri }}
                style={styles.mediaViewerImage}
                resizeMode="contain"
              />
            ) : selectedMedia?.media_type === 'video' ? (
              <View style={styles.mediaViewerPlaceholder}>
                <Ionicons name="play-circle-outline" size={80} color={COLORS.lime} />
                <Text style={{ color: COLORS.gray, marginTop: 12 }}>Video playback</Text>
                {selectedMedia?.duration && (
                  <Text style={{ color: COLORS.grayDark, marginTop: 4 }}>
                    Duration: {Math.round((selectedMedia.duration || 0) / 1000)}s
                  </Text>
                )}
              </View>
            ) : (
              <View style={styles.mediaViewerPlaceholder}>
                <Ionicons name="image-outline" size={80} color={COLORS.lime} />
                <Text style={{ color: COLORS.gray, marginTop: 12 }}>Photo</Text>
              </View>
            )}
          </View>
          <View style={styles.mediaViewerFooter}>
            {selectedMedia?.created_at && (
              <Text style={styles.mediaViewerDate}>
                {new Date(selectedMedia.created_at).toLocaleString('en-US', {
                  month: 'long', day: 'numeric', year: 'numeric',
                  hour: '2-digit', minute: '2-digit',
                })}
              </Text>
            )}
            {selectedMedia?.caption && (
              <Text style={styles.mediaViewerCaption}>{selectedMedia.caption}</Text>
            )}
          </View>
        </View>
      </Modal>

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

      {/* Assign Team Member to Project Modal */}
      <Modal visible={showAssignTechModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign Team Member</Text>
              <TouchableOpacity onPress={() => {
                setShowAssignTechModal(false);
                setTechSearch('');
                setSearchResults([]);
              }}>
                <Ionicons name="close" size={24} color={COLORS.white} />
              </TouchableOpacity>
            </View>
            
            <Text style={{ color: COLORS.gray, fontSize: 12, paddingHorizontal: 16, marginBottom: 8 }}>
              Select a team member from your org chart to assign to this project
            </Text>
            
            <View style={styles.techSearchContainer}>
              <Ionicons name="search" size={18} color={COLORS.grayDark} />
              <TextInput
                style={styles.techSearchInput}
                placeholder="Search team members by name, email, or role..."
                placeholderTextColor={COLORS.grayDark}
                value={techSearch}
                onChangeText={searchTechnicians}
              />
              {searchingTechs && <ActivityIndicator size="small" color={COLORS.lime} />}
            </View>

            <ScrollView style={{ maxHeight: 400 }} keyboardShouldPersistTaps="handled">
              {searchResults.length > 0 ? (
                searchResults.map((user: any, idx: number) => (
                  <TouchableOpacity
                    key={user.email || user.id || idx}
                    style={styles.techSearchResult}
                    onPress={() => assignTechToProject(user)}
                  >
                    <View style={[styles.techSearchAvatar, { backgroundColor: (user.color || COLORS.lime) + '25' }]}>
                      <Text style={[styles.techSearchInitial, { color: user.color || COLORS.lime }]}>
                        {(user.name || user.full_name || '?').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.techSearchName}>{user.name || user.full_name}</Text>
                      <Text style={styles.techSearchEmail}>
                        {user.role || user.title || 'Team Member'}{user.region ? ` · ${user.region}` : ''}{user.email ? ` · ${user.email}` : ''}
                      </Text>
                    </View>
                    <Ionicons name="add-circle" size={24} color={COLORS.lime} />
                  </TouchableOpacity>
                ))
              ) : !searchingTechs ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Ionicons name="people-outline" size={32} color={COLORS.grayDark} />
                  <Text style={{ color: COLORS.grayDark, marginTop: 8, textAlign: 'center' }}>
                    {techSearch.length > 0 
                      ? 'No matching team members found' 
                      : 'Add team members in the Team tab first'}
                  </Text>
                </View>
              ) : null}
            </ScrollView>
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
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2d4a6f',
    overflow: 'hidden',
    position: 'relative',
  },
  photoThumbImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  mediaTypeBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  mediaTypeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  mediaTimestamp: {
    position: 'absolute',
    bottom: 4,
    left: 6,
    fontSize: 9,
    color: '#ffffffbb',
    fontWeight: '500',
  },
  mediaDeleteBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ef444499',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaViewerOverlay: {
    flex: 1,
    backgroundColor: '#000000ee',
  },
  mediaViewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  mediaViewerTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  mediaViewerBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  mediaViewerImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  mediaViewerPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  mediaViewerFooter: {
    padding: 20,
    alignItems: 'center',
  },
  mediaViewerDate: {
    color: '#ffffffaa',
    fontSize: 13,
  },
  mediaViewerCaption: {
    color: '#fff',
    fontSize: 14,
    marginTop: 6,
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
  reportBrandHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.navyLight,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.lime + '30',
    borderBottomWidth: 3,
    borderBottomColor: COLORS.lime,
    gap: 14,
  },
  reportBrandLogo: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  reportBrandName: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 3,
  },
  reportBrandTagline: {
    fontSize: 11,
    color: COLORS.lime,
    letterSpacing: 1,
    marginTop: 2,
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
  reportContactCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 14,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  reportContactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  reportContactTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.lime,
    letterSpacing: 0.5,
  },
  reportContactName: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 2,
  },
  reportContactDetail: {
    fontSize: 13,
    color: COLORS.gray,
  },
  reportContactPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  reportContactPhone: {
    fontSize: 14,
    color: COLORS.lime,
    fontWeight: '500',
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
  addMediaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.lime,
    borderRadius: 12,
    paddingVertical: 14,
    marginBottom: 14,
  },
  addMediaBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.navy,
  },
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
  // Assigned Technicians Section
  assignedTechSection: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: COLORS.navyLight,
    marginHorizontal: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  assignedTechHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  assignedTechTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.white,
    marginLeft: 8,
  },
  addTechButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.lime,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 4,
  },
  addTechButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.navy,
  },
  noTechsText: {
    fontSize: 13,
    color: COLORS.grayDark,
    marginTop: 8,
    textAlign: 'center',
  },
  techChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.navy,
    borderRadius: 10,
    padding: 10,
    marginRight: 10,
    width: 180,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  techChipAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.lime + '25',
    alignItems: 'center',
    justifyContent: 'center',
  },
  techChipInitial: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.lime,
  },
  techChipName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  techChipRole: {
    fontSize: 11,
    color: COLORS.grayDark,
  },
  // Tech search modal
  techSearchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.navy,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    margin: 16,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  techSearchInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.white,
    marginLeft: 8,
    padding: 0,
  },
  techSearchResult: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e3a5f',
  },
  techSearchAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.lime + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  techSearchInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.lime,
  },
  techSearchName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
  techSearchEmail: {
    fontSize: 12,
    color: COLORS.grayDark,
    marginTop: 2,
  },
});
