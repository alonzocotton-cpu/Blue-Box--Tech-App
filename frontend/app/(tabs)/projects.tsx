import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';

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
};

interface Project {
  id: string;
  project_number: string;
  name: string;
  description?: string;
  status: string;
  client_name: string;
  address?: string;
  start_date?: string;
  end_date?: string;
  equipment_count: number;
  line_of_business?: string;
  lob_name?: string;
  lob_color?: string;
}

const STATUS_FILTERS = ['All', 'Active', 'Completed'];
const LOB_FILTERS = [
  { code: 'All', name: 'All LOBs', color: '#94a3b8' },
  { code: 'AS', name: 'Automation', color: '#3b82f6' },
  { code: 'SS', name: 'Self Service', color: '#22c55e' },
  { code: 'DS', name: 'Direct Service', color: '#f59e0b' },
];

export default function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [selectedLob, setSelectedLob] = useState('All');
  const [technician, setTechnician] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    client_name: '',
    address: '',
    description: '',
    line_of_business: '',
    contact_name: '',
    contact_title: '',
    contact_phone: '',
    contact_email: '',
  });
  const [syncing, setSyncing] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);

  const fetchProjects = async () => {
    try {
      const [projectsRes, sfProjectsRes, techData] = await Promise.all([
        fetch(`${API_URL}/api/projects`),
        fetch(`${API_URL}/api/salesforce/projects`),
        AsyncStorage.getItem('technician'),
      ]);

      const data = await projectsRes.json();
      const sfData = await sfProjectsRes.json();
      
      // Merge mock/manual projects with SF projects
      const allProjects = [
        ...(data.projects || []),
        ...(sfData.projects || []).map((p: any) => ({
          ...p,
          id: p.salesforce_id || p._id,
          project_number: `SF-${(p.salesforce_id || '').slice(-8)}`,
          equipment_count: p.equipment_count || 0,
        })),
      ];
      
      setProjects(allProjects);
      setFilteredProjects(allProjects);
      if (techData) setTechnician(JSON.parse(techData));
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${API_URL}/api/notifications`);
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount(data.unread_count || 0);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const syncFromSalesforce = async () => {
    setSyncing(true);
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        Alert.alert('Not Connected', 'Please log in with Salesforce first to sync opportunities.');
        setSyncing(false);
        return;
      }
      const res = await fetch(`${API_URL}/api/salesforce/sync-opportunities?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (data.success) {
        Alert.alert(
          'Sync Complete',
          `${data.total_synced} opportunities synced\n${data.new_projects} new projects\n${data.equipment_synced} equipment items`,
        );
        fetchProjects();
        fetchNotifications();
      } else {
        Alert.alert('Sync Failed', data.error || 'Could not sync from Salesforce');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to sync from Salesforce');
    } finally {
      setSyncing(false);
    }
  };

  const markNotificationRead = async (id: string) => {
    await fetch(`${API_URL}/api/notifications/${id}/read`, { method: 'POST' });
    fetchNotifications();
  };

  const markAllRead = async () => {
    await fetch(`${API_URL}/api/notifications/read-all`, { method: 'POST' });
    fetchNotifications();
    setShowNotifications(false);
  };

  useEffect(() => {
    fetchProjects();
    fetchNotifications();
  }, []);

  useEffect(() => {
    let filtered = projects;
    if (selectedFilter !== 'All') {
      filtered = filtered.filter(p => p.status === selectedFilter);
    }
    if (selectedLob !== 'All') {
      filtered = filtered.filter(p => p.line_of_business === selectedLob);
    }
    setFilteredProjects(filtered);
  }, [selectedFilter, selectedLob, projects]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchProjects();
  }, []);

  const handleSaveProject = async () => {
    if (!newProject.name.trim()) {
      Alert.alert('Required', 'Project name is required');
      return;
    }
    if (!newProject.client_name.trim()) {
      Alert.alert('Required', 'Client name is required');
      return;
    }
    if (!newProject.line_of_business) {
      Alert.alert('Required', 'Please select a Line of Business (AS, SS, or DS)');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProject),
      });
      const data = await response.json();
      if (data.success) {
        setShowAddModal(false);
        setNewProject({
          name: '',
          client_name: '',
          address: '',
          description: '',
          line_of_business: '',
          contact_name: '',
          contact_title: '',
          contact_phone: '',
          contact_email: '',
        });
        fetchProjects();
        Alert.alert('Success', `Project created: ${data.project?.name}\n#${data.project?.project_number}`);
      }
    } catch (error) {
      console.error('Error creating project:', error);
      Alert.alert('Error', 'Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    const s = (status || '').toLowerCase();
    if (s === 'completed' || s === 'closed won' || s === 'done') return '#22c55e';
    if (s === 'closed lost' || s === 'cancelled' || s === 'not completed' || s === 'inactive') return '#ef4444';
    if (s === 'on hold') return '#f59e0b';
    if (s === 'active' || s === 'in progress') return '#f59e0b';
    return '#f59e0b'; // default to in-progress yellow
  };

  const renderProject = ({ item }: { item: Project }) => {
    const stageColor = getStatusColor(item.status);
    return (
    <TouchableOpacity
      style={styles.projectCard}
      onPress={() => router.push(`/project/${item.id}`)}
      activeOpacity={0.7}
    >
      {/* Stage color bar */}
      <View style={[styles.cardStageBar, { backgroundColor: stageColor }]} />
      <View style={styles.cardInner}>
      <View style={styles.cardHeader}>
        <View style={styles.projectInfo}>
          <Text style={styles.projectNumber}>{item.project_number}</Text>
          <View style={[styles.statusBadge, { backgroundColor: stageColor + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: stageColor }]} />
            <Text style={[styles.statusText, { color: stageColor }]}>
              {item.status}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.projectName}>{item.name}</Text>
      
      <View style={styles.clientRow}>
        <Ionicons name="business-outline" size={16} color={COLORS.gray} />
        <Text style={styles.clientName}>{item.client_name}</Text>
        {item.line_of_business ? (
          <View style={[styles.lobBadge, { backgroundColor: (item.lob_color || '#94a3b8') + '20' }]}>
            <Text style={[styles.lobBadgeText, { color: item.lob_color || '#94a3b8' }]}>
              {item.line_of_business}
            </Text>
          </View>
        ) : null}
      </View>

      {item.address && (
        <View style={styles.addressRow}>
          <Ionicons name="location-outline" size={16} color={COLORS.grayDark} />
          <Text style={styles.addressText} numberOfLines={1}>{item.address}</Text>
        </View>
      )}

      <View style={styles.cardFooter}>
        <View style={styles.equipmentBadge}>
          <Ionicons name="cube-outline" size={16} color={COLORS.lime} />
          <Text style={styles.equipmentText}>{item.equipment_count} Equipment</Text>
        </View>
        {item.source === 'salesforce' && (
          <View style={[styles.lobBadge, { backgroundColor: '#3b82f620' }]}>
            <Text style={[styles.lobBadgeText, { color: '#3b82f6' }]}>SF</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={20} color={COLORS.grayDark} />
      </View>
      </View>
    </TouchableOpacity>
  );
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

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.brandContainer}>
            <Image
              source={{ uri: 'https://customer-assets.emergentagent.com/job_ff19b27f-9c44-4d68-b174-1452a3057557/artifacts/jz43di8v_IMG_2827.jpeg' }}
              style={styles.headerLogo}
              resizeMode="contain"
            />
            <Text style={styles.brandText}>BLUE BOX</Text>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              {/* Kanban Board Button */}
              <TouchableOpacity 
                style={[styles.addButton, { backgroundColor: COLORS.inProgress }]}
                onPress={() => router.push('/kanban')}
              >
                <Ionicons name="grid" size={20} color="#fff" />
              </TouchableOpacity>
              {/* SF Sync Button */}
              <TouchableOpacity 
                style={[styles.addButton, { backgroundColor: syncing ? COLORS.grayDark : '#3b82f6' }]}
                onPress={syncFromSalesforce}
                disabled={syncing}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Ionicons name="cloud-download" size={20} color="#fff" />
                )}
              </TouchableOpacity>
              {/* Notification Bell */}
              <TouchableOpacity 
                style={styles.addButton}
                onPress={() => setShowNotifications(!showNotifications)}
              >
                <Ionicons name="notifications" size={20} color={COLORS.lime} />
                {unreadCount > 0 && (
                  <View style={styles.notifBadge}>
                    <Text style={styles.notifBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              {/* Add Project */}
              <TouchableOpacity 
                style={styles.addButton}
                onPress={() => setShowAddModal(true)}
              >
                <Ionicons name="add" size={24} color={COLORS.lime} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <Text style={styles.welcomeText}>Welcome, {technician?.full_name || 'Technician'}</Text>
        <Text style={styles.headerSubtitle}>{filteredProjects.length} Projects Assigned</Text>
      </View>

      {/* Notification Dropdown */}
      {showNotifications && (
        <View style={styles.notifDropdown}>
          <View style={styles.notifDropdownHeader}>
            <Text style={styles.notifDropdownTitle}>Notifications</Text>
            {unreadCount > 0 && (
              <TouchableOpacity onPress={markAllRead}>
                <Text style={{ color: COLORS.lime, fontSize: 12, fontWeight: '600' }}>Mark All Read</Text>
              </TouchableOpacity>
            )}
          </View>
          {notifications.length > 0 ? (
            <ScrollView style={{ maxHeight: 250 }}>
              {notifications.map((notif: any, idx: number) => (
                <TouchableOpacity 
                  key={notif._id || idx} 
                  style={[styles.notifItem, !notif.read && styles.notifItemUnread]}
                  onPress={() => {
                    if (!notif.read && notif._id) markNotificationRead(notif._id);
                    setShowNotifications(false);
                  }}
                >
                  <Ionicons 
                    name={notif.type === 'new_project' ? 'briefcase' : 'notifications'} 
                    size={18} 
                    color={notif.read ? COLORS.grayDark : COLORS.lime} 
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.notifTitle, !notif.read && { color: COLORS.white }]}>{notif.title}</Text>
                    <Text style={styles.notifMessage}>{notif.message}</Text>
                    <Text style={styles.notifTime}>
                      {notif.created_at ? new Date(notif.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          ) : (
            <Text style={{ color: COLORS.grayDark, textAlign: 'center', padding: 20 }}>No notifications</Text>
          )}
        </View>
      )}

      {/* Combined Filters Row */}
      <View style={styles.filterContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterList}>
          {STATUS_FILTERS.map(item => (
            <TouchableOpacity
              key={item}
              style={[
                styles.filterTab,
                selectedFilter === item && styles.filterTabActive,
              ]}
              onPress={() => setSelectedFilter(item)}
            >
              <Text
                style={[
                  styles.filterText,
                  selectedFilter === item && styles.filterTextActive,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          ))}
          <View style={styles.filterDivider} />
          {LOB_FILTERS.map(lob => (
            <TouchableOpacity
              key={lob.code}
              onPress={() => setSelectedLob(lob.code)}
              style={[
                styles.lobFilterTab,
                selectedLob === lob.code && { backgroundColor: lob.color + '25', borderColor: lob.color },
              ]}
            >
              <View style={[styles.lobFilterDot, { backgroundColor: lob.color }]} />
              <Text style={[
                styles.lobFilterText,
                selectedLob === lob.code && { color: lob.color },
              ]}>
                {lob.code === 'All' ? 'All' : lob.code}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Projects List */}
      <FlatList
        data={filteredProjects}
        renderItem={renderProject}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.lime}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="folder-open-outline" size={48} color={COLORS.grayDark} />
            <Text style={styles.emptyText}>No projects found</Text>
          </View>
        }
      />

      {/* Add Project Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowAddModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalContainer}
        >
          {/* Modal Header */}
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowAddModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Project</Text>
            <TouchableOpacity onPress={handleSaveProject} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color={COLORS.lime} />
              ) : (
                <Text style={styles.modalSave}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView 
            style={styles.modalScroll} 
            contentContainerStyle={styles.modalScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Project Details Section */}
            <Text style={styles.modalSectionTitle}>PROJECT DETAILS</Text>
            <View style={styles.modalCard}>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Project Name *</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newProject.name}
                  onChangeText={(text) => setNewProject({ ...newProject, name: text })}
                  placeholder="e.g., Coil Cleaning, Air Quality Assessment"
                  placeholderTextColor={COLORS.grayDark}
                />
                <Text style={{ fontSize: 11, color: COLORS.grayDark, marginTop: 4 }}>
                  Format: "Client Name - Service Type" (auto-formatted)
                </Text>
              </View>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Client Name *</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newProject.client_name}
                  onChangeText={(text) => setNewProject({ ...newProject, client_name: text })}
                  placeholder="e.g., Acme Corporation"
                  placeholderTextColor={COLORS.grayDark}
                />
              </View>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Address</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newProject.address}
                  onChangeText={(text) => setNewProject({ ...newProject, address: text })}
                  placeholder="e.g., 123 Main St, City, State"
                  placeholderTextColor={COLORS.grayDark}
                />
              </View>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Line of Business *</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  {LOB_FILTERS.filter(l => l.code !== 'All').map(lob => (
                    <TouchableOpacity
                      key={lob.code}
                      onPress={() => setNewProject({ ...newProject, line_of_business: lob.code })}
                      style={[
                        styles.lobSelectBtn,
                        newProject.line_of_business === lob.code && { backgroundColor: lob.color + '25', borderColor: lob.color },
                      ]}
                    >
                      <View style={[styles.lobFilterDot, { backgroundColor: lob.color }]} />
                      <Text style={[
                        styles.lobSelectText,
                        newProject.line_of_business === lob.code && { color: lob.color, fontWeight: '700' },
                      ]}>
                        {lob.code} - {lob.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Description</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalTextArea]}
                  value={newProject.description}
                  onChangeText={(text) => setNewProject({ ...newProject, description: text })}
                  placeholder="Brief description of the project scope..."
                  placeholderTextColor={COLORS.grayDark}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>
            </View>

            {/* Primary Contact Section */}
            <Text style={styles.modalSectionTitle}>PRIMARY CONTACT (Optional)</Text>
            <View style={styles.modalCard}>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Contact Name</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newProject.contact_name}
                  onChangeText={(text) => setNewProject({ ...newProject, contact_name: text })}
                  placeholder="e.g., James Wilson"
                  placeholderTextColor={COLORS.grayDark}
                />
              </View>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Title</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newProject.contact_title}
                  onChangeText={(text) => setNewProject({ ...newProject, contact_title: text })}
                  placeholder="e.g., Facilities Manager"
                  placeholderTextColor={COLORS.grayDark}
                />
              </View>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Phone</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newProject.contact_phone}
                  onChangeText={(text) => setNewProject({ ...newProject, contact_phone: text })}
                  placeholder="e.g., (555) 123-4567"
                  placeholderTextColor={COLORS.grayDark}
                  keyboardType="phone-pad"
                />
              </View>
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Email</Text>
                <TextInput
                  style={styles.modalInput}
                  value={newProject.contact_email}
                  onChangeText={(text) => setNewProject({ ...newProject, contact_email: text })}
                  placeholder="e.g., contact@company.com"
                  placeholderTextColor={COLORS.grayDark}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>
          </ScrollView>
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
    backgroundColor: COLORS.navyLight,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
  },
  headerTop: {
    marginBottom: 6,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLogo: {
    width: 28,
    height: 28,
    borderRadius: 6,
    marginRight: 8,
  },
  brandText: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 2,
  },
  addButton: {
    width: 34,
    height: 34,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeText: {
    fontSize: 13,
    color: COLORS.gray,
    marginBottom: 1,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.lime,
    fontWeight: '500',
  },
  filterContainer: {
    paddingVertical: 6,
    backgroundColor: COLORS.navy,
  },
  filterList: {
    paddingHorizontal: 16,
    gap: 6,
    alignItems: 'center',
  },
  filterDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#2d4a6f',
    marginHorizontal: 4,
  },
  filterTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: COLORS.navyLight,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  filterTabActive: {
    backgroundColor: COLORS.lime,
    borderColor: COLORS.lime,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.gray,
  },
  filterTextActive: {
    color: COLORS.navy,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  projectCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.navyLight,
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d4a6f',
    overflow: 'hidden',
  },
  cardStageBar: {
    width: 4,
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  cardInner: {
    flex: 1,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  projectInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  projectNumber: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.lime,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  projectName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 6,
    lineHeight: 20,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  clientName: {
    fontSize: 13,
    color: COLORS.gray,
    fontWeight: '500',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  addressText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.grayDark,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#2d4a6f',
  },
  equipmentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  equipmentText: {
    fontSize: 13,
    color: COLORS.lime,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.grayDark,
    marginTop: 12,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.navy,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.navyLight,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
  },
  modalCancel: {
    fontSize: 16,
    color: COLORS.gray,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  modalSave: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.lime,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 40,
  },
  modalSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.gray,
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 8,
  },
  modalCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  modalField: {
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.lime,
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: COLORS.navy,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: COLORS.white,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  modalTextArea: {
    minHeight: 80,
    paddingTop: 14,
  },
  lobBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 'auto',
  },
  lobBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  lobFilterTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2d4a6f',
    backgroundColor: COLORS.navyMid,
  },
  lobFilterDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  lobFilterText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.gray,
  },
  lobSelectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2d4a6f',
    backgroundColor: COLORS.navyMid,
  },
  lobSelectText: {
    fontSize: 12,
    color: COLORS.gray,
    fontWeight: '500',
  },
  notifBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ef4444',
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  notifDropdown: {
    backgroundColor: COLORS.navyMid,
    marginHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2d4a6f',
    overflow: 'hidden',
    marginBottom: 8,
  },
  notifDropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
  },
  notifDropdownTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.white,
  },
  notifItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
  },
  notifItemUnread: {
    backgroundColor: COLORS.lime + '08',
  },
  notifTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.grayDark,
  },
  notifMessage: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 2,
  },
  notifTime: {
    fontSize: 10,
    color: COLORS.grayDark,
    marginTop: 4,
  },
});
