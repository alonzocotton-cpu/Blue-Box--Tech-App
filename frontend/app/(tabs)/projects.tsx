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
}

const STATUS_FILTERS = ['All', 'Active', 'On Hold', 'Completed'];

export default function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [technician, setTechnician] = useState<any>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    client_name: '',
    address: '',
    description: '',
    contact_name: '',
    contact_title: '',
    contact_phone: '',
    contact_email: '',
  });

  const fetchProjects = async () => {
    try {
      const [projectsRes, techData] = await Promise.all([
        fetch(`${API_URL}/api/projects`),
        AsyncStorage.getItem('technician'),
      ]);

      const data = await projectsRes.json();
      setProjects(data.projects || []);
      setFilteredProjects(data.projects || []);
      if (techData) setTechnician(JSON.parse(techData));
    } catch (error) {
      console.error('Error fetching projects:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedFilter === 'All') {
      setFilteredProjects(projects);
    } else {
      setFilteredProjects(projects.filter(p => p.status === selectedFilter));
    }
  }, [selectedFilter, projects]);

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
          contact_name: '',
          contact_title: '',
          contact_phone: '',
          contact_email: '',
        });
        fetchProjects();
        Alert.alert('Success', 'Project created successfully!');
      }
    } catch (error) {
      console.error('Error creating project:', error);
      Alert.alert('Error', 'Failed to create project');
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Active': return COLORS.lime;
      case 'Completed': return '#22c55e';
      case 'On Hold': return '#f59e0b';
      default: return COLORS.gray;
    }
  };

  const renderProject = ({ item }: { item: Project }) => (
    <TouchableOpacity
      style={styles.projectCard}
      onPress={() => router.push(`/project/${item.id}`)}
      activeOpacity={0.7}
    >
      <View style={styles.cardHeader}>
        <View style={styles.projectInfo}>
          <Text style={styles.projectNumber}>{item.project_number}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <View style={[styles.statusDot, { backgroundColor: getStatusColor(item.status) }]} />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.projectName}>{item.name}</Text>
      
      <View style={styles.clientRow}>
        <Ionicons name="business-outline" size={16} color={COLORS.gray} />
        <Text style={styles.clientName}>{item.client_name}</Text>
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
        <Ionicons name="chevron-forward" size={20} color={COLORS.grayDark} />
      </View>
    </TouchableOpacity>
  );

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
            <TouchableOpacity 
              style={styles.addButton}
              onPress={() => setShowAddModal(true)}
            >
              <Ionicons name="add" size={24} color={COLORS.lime} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.welcomeText}>Welcome, {technician?.full_name || 'Technician'}</Text>
        <Text style={styles.headerSubtitle}>{filteredProjects.length} Projects Assigned</Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUS_FILTERS}
          keyExtractor={(item) => item}
          contentContainerStyle={styles.filterList}
          renderItem={({ item }) => (
            <TouchableOpacity
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
          )}
        />
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
  },
  headerTop: {
    marginBottom: 12,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLogo: {
    width: 36,
    height: 36,
    borderRadius: 8,
    marginRight: 10,
  },
  brandText: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
    letterSpacing: 3,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeText: {
    fontSize: 16,
    color: COLORS.gray,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 14,
    color: COLORS.lime,
    fontWeight: '500',
  },
  filterContainer: {
    paddingVertical: 12,
    backgroundColor: COLORS.navy,
  },
  filterList: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterTab: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: COLORS.navyLight,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  filterTabActive: {
    backgroundColor: COLORS.lime,
    borderColor: COLORS.lime,
  },
  filterText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.gray,
  },
  filterTextActive: {
    color: COLORS.navy,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  projectCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
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
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.white,
    marginBottom: 10,
    lineHeight: 22,
  },
  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  clientName: {
    fontSize: 14,
    color: COLORS.gray,
    fontWeight: '500',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  addressText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.grayDark,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
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
});
