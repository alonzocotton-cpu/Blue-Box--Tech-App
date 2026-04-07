import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

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
  purple: '#8b5cf6',
  amber: '#f59e0b',
};

const REGION_COLORS: Record<string, string> = {
  'New York': '#3b82f6',
  'Florida': '#22c55e',
  'New Orleans': '#f59e0b',
  'Dallas': '#ef4444',
};

interface Role {
  _id?: string;
  name: string;
  level: number;
  parent: string | null;
  region: string | null;
  color: string;
  icon: string;
}

interface TeamMember {
  _id?: string;
  member_name: string;
  role_name: string;
  region: string | null;
  email?: string;
  phone?: string;
  level: number;
  color: string;
  icon: string;
}

interface HierarchyNode {
  name: string;
  level: number;
  region: string | null;
  color: string;
  icon: string;
  members: TeamMember[];
  children: HierarchyNode[];
}

export default function TeamScreen() {
  const [loading, setLoading] = useState(true);
  const [hierarchy, setHierarchy] = useState<HierarchyNode[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [totalMembers, setTotalMembers] = useState(0);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [expandedRegions, setExpandedRegions] = useState<Record<string, boolean>>({});
  const [assignForm, setAssignForm] = useState({
    member_name: '',
    role_name: '',
    region: '',
    email: '',
    phone: '',
  });
  const [assigning, setAssigning] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [showRegionPicker, setShowRegionPicker] = useState(false);

  useEffect(() => {
    loadHierarchy();
  }, []);

  const loadHierarchy = async () => {
    setLoading(true);
    try {
      const [hierRes, rolesRes] = await Promise.all([
        fetch(`${API_URL}/api/roles/hierarchy`),
        fetch(`${API_URL}/api/roles`),
      ]);
      const hierData = await hierRes.json();
      const rolesData = await rolesRes.json();

      setHierarchy(hierData.hierarchy || []);
      setTotalMembers(hierData.total_members || 0);
      setRegions(hierData.regions || []);
      setRoles(rolesData.roles || []);
    } catch (error) {
      console.error('Load hierarchy error:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleRegion = (region: string) => {
    setExpandedRegions(prev => ({ ...prev, [region]: !prev[region] }));
  };

  const assignMember = async () => {
    if (!assignForm.member_name.trim() || !assignForm.role_name) {
      Alert.alert('Required', 'Please enter a name and select a role.');
      return;
    }

    const selectedRoleObj = roles.find(r => r.name === assignForm.role_name);
    if (selectedRoleObj && (selectedRoleObj.level >= 2) && !assignForm.region) {
      Alert.alert('Required', 'Please select a region for this role.');
      return;
    }

    setAssigning(true);
    try {
      const response = await fetch(`${API_URL}/api/roles/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignForm),
      });
      const data = await response.json();
      if (data.success) {
        Alert.alert('Assigned!', `${assignForm.member_name} assigned as ${assignForm.role_name}${assignForm.region ? ` (${assignForm.region})` : ''}`);
        setShowAssignModal(false);
        setAssignForm({ member_name: '', role_name: '', region: '', email: '', phone: '' });
        loadHierarchy();
      } else {
        Alert.alert('Error', data.detail || 'Failed to assign role');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not assign role');
    } finally {
      setAssigning(false);
    }
  };

  const removeMember = (member: TeamMember) => {
    Alert.alert(
      'Remove Assignment',
      `Remove ${member.member_name} as ${member.role_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const params = new URLSearchParams();
              if (member.role_name) params.append('role_name', member.role_name);
              if (member.region) params.append('region', member.region);
              await fetch(`${API_URL}/api/roles/assign/${encodeURIComponent(member.member_name)}?${params.toString()}`, {
                method: 'DELETE',
              });
              loadHierarchy();
            } catch (error) {
              Alert.alert('Error', 'Could not remove assignment');
            }
          },
        },
      ]
    );
  };

  const renderMember = (member: TeamMember, indent: number = 0) => (
    <TouchableOpacity
      key={`${member.member_name}-${member.role_name}-${member.region}`}
      style={[styles.memberCard, { marginLeft: indent }]}
      onLongPress={() => removeMember(member)}
      activeOpacity={0.8}
    >
      <View style={[styles.memberAvatar, { backgroundColor: member.color + '25' }]}>
        <Text style={[styles.memberInitial, { color: member.color }]}>
          {member.member_name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.memberName}>{member.member_name}</Text>
        <Text style={[styles.memberRole, { color: member.color }]}>{member.role_name}</Text>
        {member.email ? <Text style={styles.memberEmail}>{member.email}</Text> : null}
      </View>
      {member.region && (
        <View style={[styles.regionChip, { backgroundColor: (REGION_COLORS[member.region] || COLORS.blue) + '20' }]}>
          <Text style={[styles.regionChipText, { color: REGION_COLORS[member.region] || COLORS.blue }]}>
            {member.region}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderHierarchyNode = (node: HierarchyNode, depth: number = 0) => {
    const indent = depth * 16;
    const isRegionalOM = node.level === 2 && node.region;
    const regionColor = isRegionalOM ? (REGION_COLORS[node.region || ''] || COLORS.blue) : node.color;
    const isExpanded = isRegionalOM ? expandedRegions[node.region || ''] !== false : true;

    return (
      <View key={`${node.name}-${node.region}-${depth}`} style={{ marginLeft: indent }}>
        {/* Role Header */}
        <TouchableOpacity
          style={styles.roleHeader}
          onPress={() => isRegionalOM && toggleRegion(node.region || '')}
          activeOpacity={isRegionalOM ? 0.7 : 1}
        >
          <View style={styles.roleConnector}>
            {depth > 0 && <View style={[styles.connectorLine, { backgroundColor: regionColor + '40' }]} />}
            <View style={[styles.roleIconCircle, { backgroundColor: regionColor + '20', borderColor: regionColor + '40' }]}>
              <Ionicons name={(node.icon || 'person') as any} size={16} color={regionColor} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleName}>{node.name}</Text>
            {node.region && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <Ionicons name="location" size={12} color={regionColor} />
                <Text style={[styles.roleRegion, { color: regionColor }]}>{node.region}</Text>
              </View>
            )}
          </View>
          <View style={styles.memberCount}>
            <Text style={styles.memberCountText}>{node.members.length}</Text>
          </View>
          {isRegionalOM && (
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={COLORS.grayDark}
              style={{ marginLeft: 8 }}
            />
          )}
        </TouchableOpacity>

        {/* Members */}
        {node.members.map(m => renderMember(m, 44))}

        {/* Children */}
        {isExpanded && node.children.map(child => renderHierarchyNode(child, depth + 1))}
      </View>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.lime} />
          <Text style={styles.loadingText}>Loading organization...</Text>
        </View>
      </SafeAreaView>
    );
  }

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
          <Text style={styles.brandText}>TEAM</Text>
        </View>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAssignModal(true)}
        >
          <Ionicons name="person-add" size={20} color={COLORS.navy} />
        </TouchableOpacity>
      </View>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{totalMembers}</Text>
          <Text style={styles.statLabel}>Team Members</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{regions.length}</Text>
          <Text style={styles.statLabel}>Regions</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{roles.length}</Text>
          <Text style={styles.statLabel}>Roles</Text>
        </View>
      </View>

      {/* Region Legend */}
      <View style={styles.regionLegend}>
        {regions.map(region => (
          <View key={region} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: REGION_COLORS[region] || COLORS.blue }]} />
            <Text style={styles.legendText}>{region}</Text>
          </View>
        ))}
      </View>

      {/* Hierarchy Tree */}
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.treeContainer}>
          {hierarchy.length > 0 ? (
            hierarchy.map(node => renderHierarchyNode(node))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={48} color={COLORS.grayDark} />
              <Text style={styles.emptyTitle}>No Team Structure Yet</Text>
              <Text style={styles.emptySubtitle}>Tap the + button to start building your org chart</Text>
            </View>
          )}
        </View>

        <View style={styles.tipCard}>
          <Ionicons name="information-circle" size={18} color={COLORS.blue} />
          <Text style={styles.tipText}>Long-press a team member to remove their assignment</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Assign Role Modal */}
      <Modal visible={showAssignModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign Role</Text>
              <TouchableOpacity onPress={() => setShowAssignModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.white} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Name */}
              <Text style={styles.fieldLabel}>Team Member Name *</Text>
              <TextInput
                style={styles.input}
                value={assignForm.member_name}
                onChangeText={t => setAssignForm({ ...assignForm, member_name: t })}
                placeholder="Enter full name"
                placeholderTextColor={COLORS.grayDark}
              />

              {/* Role Picker */}
              <Text style={styles.fieldLabel}>Role *</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowRolePicker(!showRolePicker)}
              >
                <Text style={assignForm.role_name ? styles.pickerText : styles.pickerPlaceholder}>
                  {assignForm.role_name || 'Select a role'}
                </Text>
                <Ionicons name="chevron-down" size={20} color={COLORS.grayDark} />
              </TouchableOpacity>
              {showRolePicker && (
                <View style={styles.pickerDropdown}>
                  {roles.filter((r, i, arr) => arr.findIndex(x => x.name === r.name) === i).map((role, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.pickerOption, assignForm.role_name === role.name && styles.pickerOptionSelected]}
                      onPress={() => {
                        setAssignForm({ ...assignForm, role_name: role.name });
                        setShowRolePicker(false);
                      }}
                    >
                      <Ionicons name={(role.icon || 'person') as any} size={16} color={role.color} />
                      <Text style={[styles.pickerOptionText, { color: assignForm.role_name === role.name ? COLORS.lime : COLORS.white }]}>
                        {role.name}
                      </Text>
                      <Text style={styles.pickerOptionLevel}>Level {role.level}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Region Picker - show for level 2+ */}
              {assignForm.role_name && roles.find(r => r.name === assignForm.role_name && (r.level >= 2)) && (
                <>
                  <Text style={styles.fieldLabel}>Region *</Text>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setShowRegionPicker(!showRegionPicker)}
                  >
                    <Text style={assignForm.region ? styles.pickerText : styles.pickerPlaceholder}>
                      {assignForm.region || 'Select a region'}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color={COLORS.grayDark} />
                  </TouchableOpacity>
                  {showRegionPicker && (
                    <View style={styles.pickerDropdown}>
                      {regions.map(region => (
                        <TouchableOpacity
                          key={region}
                          style={[styles.pickerOption, assignForm.region === region && styles.pickerOptionSelected]}
                          onPress={() => {
                            setAssignForm({ ...assignForm, region });
                            setShowRegionPicker(false);
                          }}
                        >
                          <View style={[styles.legendDot, { backgroundColor: REGION_COLORS[region] }]} />
                          <Text style={[styles.pickerOptionText, { color: assignForm.region === region ? COLORS.lime : COLORS.white }]}>
                            {region}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}

              {/* Email */}
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                value={assignForm.email}
                onChangeText={t => setAssignForm({ ...assignForm, email: t })}
                placeholder="email@blueboxair.com"
                placeholderTextColor={COLORS.grayDark}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              {/* Phone */}
              <Text style={styles.fieldLabel}>Phone</Text>
              <TextInput
                style={styles.input}
                value={assignForm.phone}
                onChangeText={t => setAssignForm({ ...assignForm, phone: t })}
                placeholder="(555) 123-4567"
                placeholderTextColor={COLORS.grayDark}
                keyboardType="phone-pad"
              />
            </ScrollView>

            {/* Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.assignButton}
                onPress={assignMember}
                disabled={assigning}
              >
                {assigning ? (
                  <ActivityIndicator size="small" color={COLORS.navy} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color={COLORS.navy} />
                    <Text style={styles.assignButtonText}>Assign Role</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelModalButton}
                onPress={() => setShowAssignModal(false)}
              >
                <Text style={styles.cancelModalText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  loadingText: { color: COLORS.gray, fontSize: 14 },
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
  brandText: { fontSize: 24, fontWeight: '700', color: COLORS.white, letterSpacing: 3 },
  addButton: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: COLORS.lime,
    alignItems: 'center', justifyContent: 'center',
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.navyLight,
    marginHorizontal: 16, marginTop: 12,
    borderRadius: 14, paddingVertical: 16,
    borderWidth: 1, borderColor: '#2d4a6f',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 22, fontWeight: '700', color: COLORS.white },
  statLabel: { fontSize: 11, color: COLORS.gray, marginTop: 4 },
  statDivider: { width: 1, height: 36, backgroundColor: '#2d4a6f', alignSelf: 'center' },
  regionLegend: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 16, paddingTop: 12, gap: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: 12, color: COLORS.gray },
  scrollView: { flex: 1 },
  treeContainer: { padding: 16, paddingBottom: 0 },
  roleHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingRight: 8, gap: 10,
  },
  roleConnector: { flexDirection: 'row', alignItems: 'center', width: 36 },
  connectorLine: { width: 12, height: 2, marginRight: -4 },
  roleIconCircle: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  roleName: { fontSize: 14, fontWeight: '600', color: COLORS.white },
  roleRegion: { fontSize: 11, fontWeight: '500' },
  memberCount: {
    backgroundColor: COLORS.navyLight, borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#2d4a6f',
  },
  memberCountText: { fontSize: 12, fontWeight: '600', color: COLORS.gray },
  memberCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.navyLight,
    borderRadius: 12, padding: 12, marginVertical: 3,
    borderWidth: 1, borderColor: '#2d4a6f', gap: 10,
  },
  memberAvatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  memberInitial: { fontSize: 16, fontWeight: '700' },
  memberName: { fontSize: 14, fontWeight: '600', color: COLORS.white },
  memberRole: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  memberEmail: { fontSize: 10, color: COLORS.grayDark, marginTop: 1 },
  regionChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
  },
  regionChipText: { fontSize: 10, fontWeight: '600' },
  emptyState: {
    alignItems: 'center', paddingVertical: 60, gap: 12,
  },
  emptyTitle: { fontSize: 18, fontWeight: '600', color: COLORS.white },
  emptySubtitle: { fontSize: 13, color: COLORS.grayDark, textAlign: 'center' },
  tipCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.blue + '10',
    borderWidth: 1, borderColor: COLORS.blue + '25',
    borderRadius: 10, padding: 12, marginHorizontal: 16, marginTop: 16,
  },
  tipText: { fontSize: 12, color: COLORS.blue, flex: 1 },
  // Modal styles
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.navy,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '85%',
    borderWidth: 1, borderColor: '#2d4a6f',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#2d4a6f',
  },
  modalTitle: { fontSize: 20, fontWeight: '700', color: COLORS.white },
  modalBody: { padding: 20, maxHeight: 400 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.gray, marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 12, padding: 14, fontSize: 15, color: COLORS.white,
    borderWidth: 1, borderColor: '#2d4a6f',
  },
  pickerButton: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.navyLight,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#2d4a6f',
  },
  pickerText: { fontSize: 15, color: COLORS.white },
  pickerPlaceholder: { fontSize: 15, color: COLORS.grayDark },
  pickerDropdown: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 12, marginTop: 4, overflow: 'hidden',
    borderWidth: 1, borderColor: '#2d4a6f',
  },
  pickerOption: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 14, borderBottomWidth: 1, borderBottomColor: '#2d4a6f',
  },
  pickerOptionSelected: { backgroundColor: COLORS.lime + '15' },
  pickerOptionText: { fontSize: 14, flex: 1 },
  pickerOptionLevel: { fontSize: 11, color: COLORS.grayDark },
  modalActions: { padding: 20, gap: 12 },
  assignButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.lime, paddingVertical: 16, borderRadius: 12,
  },
  assignButtonText: { fontSize: 16, fontWeight: '600', color: COLORS.navy },
  cancelModalButton: { alignItems: 'center', paddingVertical: 12 },
  cancelModalText: { fontSize: 15, color: COLORS.gray },
});
