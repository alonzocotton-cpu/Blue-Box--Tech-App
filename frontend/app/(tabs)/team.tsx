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

import AsyncStorage from '@react-native-async-storage/async-storage';

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
  const [expandedRoles, setExpandedRoles] = useState<Record<string, boolean>>({});
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
  const [sfUsers, setSfUsers] = useState<any[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [technicianEmail, setTechnicianEmail] = useState('');
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editRoleName, setEditRoleName] = useState('');
  const [editRegion, setEditRegion] = useState('');
  const [showEditRolePicker, setShowEditRolePicker] = useState(false);
  const [showEditRegionPicker, setShowEditRegionPicker] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    checkAdminAndLoad();
  }, []);

  const checkAdminAndLoad = async () => {
    try {
      const techStr = await AsyncStorage.getItem('technician');
      if (techStr) {
        const tech = JSON.parse(techStr);
        const email = tech.email || '';
        setTechnicianEmail(email);
        
        // Check admin status
        const adminRes = await fetch(`${API_URL}/api/admin/check?email=${encodeURIComponent(email)}`);
        const adminData = await adminRes.json();
        setIsAdmin(adminData.is_admin || false);
      }
    } catch (error) {
      console.error('Admin check error:', error);
    }
    loadHierarchy();
  };

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

  const searchSfUsers = async (query: string) => {
    setUserSearch(query);
    if (query.length < 2) {
      setSfUsers([]);
      return;
    }
    setLoadingUsers(true);
    try {
      const res = await fetch(`${API_URL}/api/salesforce/users?active_only=true&search=${encodeURIComponent(query)}`);
      const data = await res.json();
      setSfUsers(data.users || []);
      setShowUserPicker(true);
    } catch (error) {
      console.error('Search users error:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const selectUser = (user: any) => {
    setAssignForm({
      ...assignForm,
      member_name: user.full_name || user.name || '',
      email: user.email || '',
      phone: user.phone || user.mobile_phone || '',
    });
    setShowUserPicker(false);
    setUserSearch(user.full_name || user.name || '');
  };

  const toggleRole = (key: string) => {
    setExpandedRoles(prev => ({ ...prev, [key]: !prev[key] }));
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
        body: JSON.stringify({ ...assignForm, requester_email: technicianEmail }),
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
    if (!isAdmin) return;
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
              params.append('requester_email', technicianEmail);
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

  const openEditRole = (member: TeamMember) => {
    if (!isAdmin) return;
    setEditingMember(member);
    setEditRoleName(member.role_name);
    setEditRegion(member.region || '');
    setShowEditModal(true);
  };

  const updateMemberRole = async () => {
    if (!editingMember || !editRoleName) return;
    
    setUpdating(true);
    try {
      const response = await fetch(`${API_URL}/api/roles/assign/${encodeURIComponent(editingMember.member_name)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requester_email: technicianEmail,
          old_role_name: editingMember.role_name,
          old_region: editingMember.region || '',
          new_role_name: editRoleName,
          new_region: editRegion || null,
        }),
      });
      const data = await response.json();
      if (data.success) {
        Alert.alert('Updated', `${editingMember.member_name} is now ${editRoleName}`);
        setShowEditModal(false);
        setEditingMember(null);
        loadHierarchy();
      } else {
        Alert.alert('Error', data.detail || 'Failed to update role');
      }
    } catch (error) {
      Alert.alert('Error', 'Could not update role');
    } finally {
      setUpdating(false);
    }
  };

  const renderMember = (member: TeamMember, indent: number = 0) => (
    <TouchableOpacity
      key={`${member.member_name}-${member.role_name}-${member.region}`}
      style={[styles.memberCard, { marginLeft: indent }]}
      onPress={() => isAdmin ? openEditRole(member) : null}
      onLongPress={() => isAdmin ? removeMember(member) : null}
      activeOpacity={isAdmin ? 0.7 : 1}
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
      {isAdmin && (
        <Ionicons name="create-outline" size={16} color={COLORS.grayDark} style={{ marginRight: 8 }} />
      )}
      {member.region && (
        <View style={[styles.regionChip, { backgroundColor: (REGION_COLORS[member.region] || COLORS.blue) + '20' }]}>
          <Text style={[styles.regionChipText, { color: REGION_COLORS[member.region] || COLORS.blue }]}>
            {member.region}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );

  // Count total members in a node and all its children
  const countAllMembers = (node: HierarchyNode): number => {
    let count = node.members.length;
    node.children.forEach(child => { count += countAllMembers(child); });
    return count;
  };

  const renderHierarchyNode = (node: HierarchyNode, depth: number = 0) => {
    const indent = depth * 12;
    const isRegionalOM = node.level === 2 && node.region;
    const regionColor = isRegionalOM ? (REGION_COLORS[node.region || ''] || COLORS.blue) : node.color;
    const nodeKey = `${node.name}-${node.region || ''}`;
    const isExpandable = isRegionalOM || node.children.length > 0;
    const isExpanded = expandedRoles[nodeKey] || false;
    const totalInBranch = countAllMembers(node);

    // In collapsed regions, skip roles with no members and no member-bearing children
    if (depth > 1 && totalInBranch === 0) {
      return null;
    }

    return (
      <View key={`${node.name}-${node.region}-${depth}`} style={{ marginLeft: indent }}>
        {/* Role Header */}
        <TouchableOpacity
          style={styles.roleHeader}
          onPress={() => isExpandable && toggleRole(nodeKey)}
          activeOpacity={isExpandable ? 0.7 : 1}
        >
          <View style={[styles.roleIconCircle, { backgroundColor: regionColor + '20', borderColor: regionColor + '40' }]}>
            <Ionicons name={(node.icon || 'person') as any} size={14} color={regionColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.roleName}>{node.name}</Text>
            {node.region && (
              <Text style={[styles.roleRegion, { color: regionColor }]}>{node.region}</Text>
            )}
          </View>
          {totalInBranch > 0 && (
            <View style={[styles.memberCount, { backgroundColor: regionColor + '15' }]}>
              <Text style={[styles.memberCountText, { color: regionColor }]}>{totalInBranch}</Text>
            </View>
          )}
          {isExpandable && (
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={COLORS.grayDark}
              style={{ marginLeft: 6 }}
            />
          )}
        </TouchableOpacity>

        {/* Members - show directly if node has members */}
        {node.members.map(m => renderMember(m, 36))}

        {/* Children - only show when expanded */}
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
        {isAdmin && (
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAssignModal(true)}
          >
            <Ionicons name="person-add" size={20} color={COLORS.navy} />
          </TouchableOpacity>
        )}
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
          <Text style={styles.tipText}>
            {isAdmin 
              ? 'Tap a member to edit role. Long-press to remove.' 
              : 'View only. Only administrators can manage team assignments.'}
          </Text>
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
              {/* Search Salesforce User */}
              <Text style={styles.fieldLabel}>Team Member (Search Salesforce Users) *</Text>
              <TextInput
                style={styles.input}
                value={userSearch}
                onChangeText={searchSfUsers}
                placeholder="Type 2+ letters to search active users..."
                placeholderTextColor={COLORS.grayDark}
              />
              {loadingUsers && (
                <ActivityIndicator size="small" color={COLORS.lime} style={{ marginTop: 8 }} />
              )}
              {showUserPicker && sfUsers.length > 0 && (
                <ScrollView style={styles.pickerDropdown} nestedScrollEnabled>
                  {sfUsers.slice(0, 15).map((user: any, idx: number) => (
                    <TouchableOpacity
                      key={idx}
                      style={styles.pickerOption}
                      onPress={() => selectUser(user)}
                    >
                      <View style={[styles.memberAvatar, { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.lime + '20' }]}>
                        <Text style={[styles.memberInitial, { fontSize: 12, color: COLORS.lime }]}>
                          {(user.full_name || '?').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pickerOptionText}>{user.full_name}</Text>
                        <Text style={{ fontSize: 10, color: COLORS.grayDark }}>
                          {[user.title, user.role, user.email].filter(Boolean).join(' · ')}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
              {showUserPicker && sfUsers.length === 0 && userSearch.length >= 2 && !loadingUsers && (
                <Text style={{ color: COLORS.grayDark, fontSize: 12, marginTop: 8 }}>No active users found for "{userSearch}"</Text>
              )}
              {assignForm.member_name ? (
                <View style={[styles.memberCard, { marginTop: 8, marginLeft: 0 }]}>
                  <View style={[styles.memberAvatar, { backgroundColor: COLORS.lime + '25' }]}>
                    <Text style={[styles.memberInitial, { color: COLORS.lime }]}>
                      {assignForm.member_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{assignForm.member_name}</Text>
                    {assignForm.email ? <Text style={styles.memberEmail}>{assignForm.email}</Text> : null}
                  </View>
                  <TouchableOpacity onPress={() => { setAssignForm({...assignForm, member_name: '', email: '', phone: ''}); setUserSearch(''); }}>
                    <Ionicons name="close-circle" size={20} color={COLORS.red} />
                  </TouchableOpacity>
                </View>
              ) : null}

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

      {/* Edit Role Modal */}
      <Modal visible={showEditModal} animationType="slide" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Role</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color={COLORS.white} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {editingMember && (
                <View style={[styles.memberCard, { marginLeft: 0, marginBottom: 16 }]}>
                  <View style={[styles.memberAvatar, { backgroundColor: COLORS.lime + '25' }]}>
                    <Text style={[styles.memberInitial, { color: COLORS.lime }]}>
                      {editingMember.member_name.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{editingMember.member_name}</Text>
                    <Text style={[styles.memberRole, { color: COLORS.grayDark }]}>
                      Current: {editingMember.role_name}{editingMember.region ? ` (${editingMember.region})` : ''}
                    </Text>
                  </View>
                </View>
              )}

              {/* New Role Picker */}
              <Text style={styles.fieldLabel}>New Role *</Text>
              <TouchableOpacity
                style={styles.pickerButton}
                onPress={() => setShowEditRolePicker(!showEditRolePicker)}
              >
                <Text style={editRoleName ? styles.pickerText : styles.pickerPlaceholder}>
                  {editRoleName || 'Select a role'}
                </Text>
                <Ionicons name="chevron-down" size={20} color={COLORS.grayDark} />
              </TouchableOpacity>
              {showEditRolePicker && (
                <View style={styles.pickerDropdown}>
                  {roles.filter((r, i, arr) => arr.findIndex(x => x.name === r.name) === i).map((role, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.pickerOption, editRoleName === role.name && styles.pickerOptionSelected]}
                      onPress={() => {
                        setEditRoleName(role.name);
                        setShowEditRolePicker(false);
                      }}
                    >
                      <Ionicons name={(role.icon || 'person') as any} size={16} color={role.color} />
                      <Text style={[styles.pickerOptionText, { color: editRoleName === role.name ? COLORS.lime : COLORS.white }]}>
                        {role.name}
                      </Text>
                      <Text style={styles.pickerOptionLevel}>Level {role.level}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Region Picker for level 2+ */}
              {editRoleName && roles.find(r => r.name === editRoleName && (r.level >= 2)) && (
                <>
                  <Text style={styles.fieldLabel}>Region *</Text>
                  <TouchableOpacity
                    style={styles.pickerButton}
                    onPress={() => setShowEditRegionPicker(!showEditRegionPicker)}
                  >
                    <Text style={editRegion ? styles.pickerText : styles.pickerPlaceholder}>
                      {editRegion || 'Select a region'}
                    </Text>
                    <Ionicons name="chevron-down" size={20} color={COLORS.grayDark} />
                  </TouchableOpacity>
                  {showEditRegionPicker && (
                    <View style={styles.pickerDropdown}>
                      {regions.map(region => (
                        <TouchableOpacity
                          key={region}
                          style={[styles.pickerOption, editRegion === region && styles.pickerOptionSelected]}
                          onPress={() => {
                            setEditRegion(region);
                            setShowEditRegionPicker(false);
                          }}
                        >
                          <View style={[styles.legendDot, { backgroundColor: REGION_COLORS[region] }]} />
                          <Text style={[styles.pickerOptionText, { color: editRegion === region ? COLORS.lime : COLORS.white }]}>
                            {region}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </>
              )}
            </ScrollView>

            {/* Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.assignButton}
                onPress={updateMemberRole}
                disabled={updating}
              >
                {updating ? (
                  <ActivityIndicator size="small" color={COLORS.navy} />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color={COLORS.navy} />
                    <Text style={styles.assignButtonText}>Update Role</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.cancelModalButton, { backgroundColor: COLORS.red + '20', marginTop: 8 }]}
                onPress={() => {
                  if (editingMember) removeMember(editingMember);
                  setShowEditModal(false);
                }}
              >
                <Ionicons name="trash-outline" size={16} color={COLORS.red} />
                <Text style={[styles.cancelModalText, { color: COLORS.red, marginLeft: 6 }]}>Remove from Team</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelModalButton}
                onPress={() => setShowEditModal(false)}
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brandText: { fontSize: 20, fontWeight: '700', color: COLORS.white, letterSpacing: 2 },
  addButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.lime,
    alignItems: 'center', justifyContent: 'center',
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.navyLight,
    marginHorizontal: 16, marginTop: 8,
    borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: '#2d4a6f',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 20, fontWeight: '700', color: COLORS.white },
  statLabel: { fontSize: 10, color: COLORS.gray, marginTop: 2 },
  statDivider: { width: 1, height: 28, backgroundColor: '#2d4a6f', alignSelf: 'center' },
  regionLegend: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 16, paddingTop: 8, gap: 10,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: COLORS.gray },
  scrollView: { flex: 1 },
  treeContainer: { padding: 12, paddingBottom: 0 },
  roleHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 4, gap: 8,
  },
  roleIconCircle: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  roleName: { fontSize: 13, fontWeight: '600', color: COLORS.white },
  roleRegion: { fontSize: 10, fontWeight: '500' },
  memberCount: {
    borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 1, borderColor: '#2d4a6f',
  },
  memberCountText: { fontSize: 11, fontWeight: '600' },
  memberCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.navyLight,
    borderRadius: 10, padding: 10, marginVertical: 2,
    borderWidth: 1, borderColor: '#2d4a6f', gap: 8,
  },
  memberAvatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  memberInitial: { fontSize: 14, fontWeight: '700' },
  memberName: { fontSize: 13, fontWeight: '600', color: COLORS.white },
  memberRole: { fontSize: 10, fontWeight: '500', marginTop: 1 },
  memberEmail: { fontSize: 9, color: COLORS.grayDark, marginTop: 1 },
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
