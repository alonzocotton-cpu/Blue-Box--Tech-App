import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Platform,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../utils/api';

const API_URL = API_BASE_URL;

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
  orange: '#f59e0b',
  purple: '#8b5cf6',
};

const STATUS_CONFIG: Record<string, { color: string; icon: string }> = {
  open: { color: COLORS.blue, icon: 'radio-button-on' },
  in_progress: { color: COLORS.orange, icon: 'time' },
  resolved: { color: COLORS.green, icon: 'checkmark-circle' },
  closed: { color: COLORS.grayDark, icon: 'close-circle' },
};

export default function AdminDashboard() {
  const [adminEmail, setAdminEmail] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'tickets' | 'users'>('tickets');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [responseText, setResponseText] = useState('');
  const [responding, setResponding] = useState(false);
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    loadAdmin();
  }, []);

  const loadAdmin = async () => {
    try {
      const techStr = await AsyncStorage.getItem('technician');
      if (techStr) {
        const tech = JSON.parse(techStr);
        const email = tech.email || '';
        setAdminEmail(email);

        // Verify admin access
        const checkRes = await fetch(`${API_URL}/api/admin/check?email=${encodeURIComponent(email)}`);
        const checkData = await checkRes.json();
        if (!checkData.is_admin) {
          Alert.alert('Access Denied', 'You do not have admin privileges.');
          router.back();
          return;
        }

        await fetchAll(email);
      }
    } catch (e) {
      console.error('Error loading admin:', e);
    } finally {
      setLoading(false);
    }
  };

  const fetchAll = async (email: string) => {
    await Promise.all([fetchStats(email), fetchTickets(email), fetchUsers(email)]);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAll(adminEmail);
    setRefreshing(false);
  }, [adminEmail]);

  const fetchStats = async (email: string) => {
    try {
      const res = await fetch(`${API_URL}/api/support/stats?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (data.tickets) setStats(data);
    } catch (e) {
      console.error('Error fetching stats:', e);
    }
  };

  const fetchTickets = async (email: string) => {
    try {
      const url = statusFilter
        ? `${API_URL}/api/support/tickets?email=${encodeURIComponent(email)}&status=${statusFilter}`
        : `${API_URL}/api/support/tickets?email=${encodeURIComponent(email)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.tickets) setTickets(data.tickets);
    } catch (e) {
      console.error('Error fetching tickets:', e);
    }
  };

  const fetchUsers = async (email: string) => {
    try {
      const res = await fetch(`${API_URL}/api/support/users?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (data.users) setUsers(data.users);
    } catch (e) {
      console.error('Error fetching users:', e);
    }
  };

  const handleUpdateTicketStatus = async (ticketId: string, newStatus: string) => {
    try {
      const res = await fetch(`${API_URL}/api/support/tickets/${ticketId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_email: adminEmail, status: newStatus }),
      });
      const data = await res.json();
      if (data.success) {
        setTickets(prev => prev.map(t => t._id === ticketId ? data.ticket : t));
        if (selectedTicket?._id === ticketId) setSelectedTicket(data.ticket);
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to update ticket.');
    }
  };

  const handleSendResponse = async () => {
    if (!responseText.trim() || !selectedTicket) return;
    setResponding(true);
    try {
      const techStr = await AsyncStorage.getItem('technician');
      const tech = techStr ? JSON.parse(techStr) : {};
      const res = await fetch(`${API_URL}/api/support/tickets/${selectedTicket._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_email: adminEmail,
          admin_name: tech.full_name || adminEmail,
          response: responseText.trim(),
          status: 'in_progress',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSelectedTicket(data.ticket);
        setTickets(prev => prev.map(t => t._id === data.ticket._id ? data.ticket : t));
        setResponseText('');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to send response.');
    } finally {
      setResponding(false);
    }
  };

  const handleToggleUserStatus = async (userId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`${API_URL}/api/support/users/${userId}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_email: adminEmail, is_active: !currentActive }),
      });
      const data = await res.json();
      if (data.success) {
        setUsers(prev => prev.map(u => u._id === userId ? { ...u, is_active: data.is_active } : u));
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to update user status.');
    }
  };

  useEffect(() => {
    if (adminEmail) fetchTickets(adminEmail);
  }, [statusFilter]);

  const filteredUsers = userSearch
    ? users.filter(u =>
        (u.full_name || u.email || '').toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(userSearch.toLowerCase())
      )
    : users;

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={COLORS.lime} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Admin Dashboard</Text>
          <Text style={styles.headerSub}>Support & User Management</Text>
        </View>
        <Ionicons name="shield-checkmark" size={24} color={COLORS.lime} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.lime} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Stats Cards */}
        {stats && (
          <View style={styles.statsGrid}>
            <View style={[styles.statCard, { borderLeftColor: COLORS.blue }]}>
              <Text style={styles.statNumber}>{stats.tickets?.open || 0}</Text>
              <Text style={styles.statLabel}>Open</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: COLORS.orange }]}>
              <Text style={styles.statNumber}>{stats.tickets?.in_progress || 0}</Text>
              <Text style={styles.statLabel}>In Progress</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: COLORS.green }]}>
              <Text style={styles.statNumber}>{stats.tickets?.resolved || 0}</Text>
              <Text style={styles.statLabel}>Resolved</Text>
            </View>
            <View style={[styles.statCard, { borderLeftColor: COLORS.purple }]}>
              <Text style={styles.statNumber}>{stats.users?.registered_accounts || 0}</Text>
              <Text style={styles.statLabel}>Users</Text>
            </View>
          </View>
        )}

        {/* Tab Switcher */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'tickets' && styles.tabActive]}
            onPress={() => setActiveTab('tickets')}
          >
            <Ionicons name="ticket" size={18} color={activeTab === 'tickets' ? COLORS.navy : COLORS.gray} />
            <Text style={[styles.tabText, activeTab === 'tickets' && styles.tabTextActive]}>
              Tickets ({tickets.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'users' && styles.tabActive]}
            onPress={() => setActiveTab('users')}
          >
            <Ionicons name="people" size={18} color={activeTab === 'users' ? COLORS.navy : COLORS.gray} />
            <Text style={[styles.tabText, activeTab === 'users' && styles.tabTextActive]}>
              Users ({users.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* TICKETS TAB */}
        {activeTab === 'tickets' && (
          <>
            {/* Status Filters */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {[{ id: '', label: 'All' }, { id: 'open', label: 'Open' }, { id: 'in_progress', label: 'In Progress' }, { id: 'resolved', label: 'Resolved' }, { id: 'closed', label: 'Closed' }].map(f => (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.filterChip, statusFilter === f.id && styles.filterChipActive]}
                  onPress={() => setStatusFilter(f.id)}
                >
                  <Text style={[styles.filterChipText, statusFilter === f.id && styles.filterChipTextActive]}>{f.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {tickets.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="checkmark-done-circle" size={40} color={COLORS.grayDark} />
                <Text style={styles.emptyText}>No tickets{statusFilter ? ` with status "${statusFilter}"` : ''}</Text>
              </View>
            ) : (
              tickets.map(ticket => (
                <TouchableOpacity
                  key={ticket._id}
                  style={styles.ticketCard}
                  onPress={() => setSelectedTicket(ticket)}
                  activeOpacity={0.7}
                >
                  <View style={styles.ticketTopRow}>
                    <View style={[styles.statusDot, { backgroundColor: STATUS_CONFIG[ticket.status]?.color || COLORS.gray }]} />
                    <Text style={styles.ticketSubject} numberOfLines={1}>{ticket.subject}</Text>
                  </View>
                  <Text style={styles.ticketMeta}>
                    {ticket.name || ticket.email} · {ticket.category} · {new Date(ticket.created_at).toLocaleDateString()}
                  </Text>
                  <Text style={styles.ticketPreview} numberOfLines={1}>{ticket.description}</Text>
                  {ticket.responses?.length > 0 && (
                    <View style={styles.replyBadge}>
                      <Ionicons name="chatbubble" size={12} color={COLORS.lime} />
                      <Text style={styles.replyBadgeText}>{ticket.responses.length} reply</Text>
                    </View>
                  )}
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        {/* USERS TAB */}
        {activeTab === 'users' && (
          <>
            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color={COLORS.grayDark} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search users..."
                placeholderTextColor={COLORS.grayDark}
                value={userSearch}
                onChangeText={setUserSearch}
              />
            </View>

            {filteredUsers.length === 0 ? (
              <View style={styles.emptyState}>
                <Ionicons name="people-outline" size={40} color={COLORS.grayDark} />
                <Text style={styles.emptyText}>No users found</Text>
              </View>
            ) : (
              filteredUsers.map(user => (
                <View key={user._id} style={styles.userCard}>
                  <View style={styles.userInfo}>
                    <View style={[styles.userAvatar, { backgroundColor: user.account_type === 'salesforce' ? COLORS.blue + '30' : COLORS.lime + '30' }]}>
                      <Ionicons
                        name={user.account_type === 'salesforce' ? 'cloud' : 'person'}
                        size={18}
                        color={user.account_type === 'salesforce' ? COLORS.blue : COLORS.lime}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.userName}>{user.full_name || user.email || 'Unknown'}</Text>
                      <Text style={styles.userEmail}>{user.email || 'No email'}</Text>
                      <Text style={styles.userType}>{user.account_type === 'salesforce' ? 'Salesforce' : 'Registered'}</Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.activeToggle,
                        { backgroundColor: user.is_active !== false ? COLORS.green + '20' : COLORS.red + '20' },
                      ]}
                      onPress={() => handleToggleUserStatus(user._id, user.is_active !== false)}
                    >
                      <View style={[
                        styles.toggleDot,
                        { backgroundColor: user.is_active !== false ? COLORS.green : COLORS.red },
                      ]} />
                      <Text style={[styles.toggleText, { color: user.is_active !== false ? COLORS.green : COLORS.red }]}>
                        {user.is_active !== false ? 'Active' : 'Disabled'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Ticket Detail Modal */}
      <Modal visible={!!selectedTicket} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedTicket && (
              <>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Ticket Detail</Text>
                  <TouchableOpacity onPress={() => { setSelectedTicket(null); setResponseText(''); }}>
                    <Ionicons name="close" size={24} color={COLORS.gray} />
                  </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                  <Text style={styles.detailTicketNum}>{selectedTicket.ticket_number}</Text>
                  <Text style={styles.detailSubject}>{selectedTicket.subject}</Text>

                  <View style={styles.detailMeta}>
                    <Text style={styles.detailMetaText}>From: {selectedTicket.name || selectedTicket.email}</Text>
                    <Text style={styles.detailMetaText}>Category: {selectedTicket.category}</Text>
                    <Text style={styles.detailMetaText}>Created: {new Date(selectedTicket.created_at).toLocaleString()}</Text>
                  </View>

                  <View style={styles.detailDesc}>
                    <Text style={styles.detailDescText}>{selectedTicket.description}</Text>
                  </View>

                  {/* Status Actions */}
                  <Text style={styles.detailSectionTitle}>Update Status</Text>
                  <View style={styles.statusActions}>
                    {['open', 'in_progress', 'resolved', 'closed'].map(s => (
                      <TouchableOpacity
                        key={s}
                        style={[
                          styles.statusBtn,
                          selectedTicket.status === s && { backgroundColor: (STATUS_CONFIG[s]?.color || COLORS.gray), borderColor: (STATUS_CONFIG[s]?.color || COLORS.gray) },
                        ]}
                        onPress={() => handleUpdateTicketStatus(selectedTicket._id, s)}
                      >
                        <Ionicons
                          name={STATUS_CONFIG[s]?.icon as any}
                          size={14}
                          color={selectedTicket.status === s ? COLORS.white : STATUS_CONFIG[s]?.color || COLORS.gray}
                        />
                        <Text style={[
                          styles.statusBtnText,
                          selectedTicket.status === s && { color: COLORS.white },
                          selectedTicket.status !== s && { color: STATUS_CONFIG[s]?.color || COLORS.gray },
                        ]}>
                          {s.replace('_', ' ')}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Responses */}
                  {selectedTicket.responses?.length > 0 && (
                    <>
                      <Text style={styles.detailSectionTitle}>Responses</Text>
                      {selectedTicket.responses.map((r: any, i: number) => (
                        <View key={i} style={styles.responseCard}>
                          <View style={styles.responseHeader}>
                            <Ionicons name="shield" size={14} color={COLORS.lime} />
                            <Text style={styles.responseName}>{r.admin_name}</Text>
                            <Text style={styles.responseDate}>{new Date(r.created_at).toLocaleString()}</Text>
                          </View>
                          <Text style={styles.responseMessage}>{r.message}</Text>
                        </View>
                      ))}
                    </>
                  )}

                  {/* Reply Input */}
                  <Text style={styles.detailSectionTitle}>Send Response</Text>
                  <TextInput
                    style={styles.replyInput}
                    placeholder="Type your response to the user..."
                    placeholderTextColor={COLORS.grayDark}
                    value={responseText}
                    onChangeText={setResponseText}
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                  />
                  <TouchableOpacity
                    style={[styles.replyBtn, (!responseText.trim() || responding) && { opacity: 0.5 }]}
                    onPress={handleSendResponse}
                    disabled={!responseText.trim() || responding}
                  >
                    {responding ? (
                      <ActivityIndicator color={COLORS.navy} size="small" />
                    ) : (
                      <>
                        <Ionicons name="send" size={16} color={COLORS.navy} />
                        <Text style={styles.replyBtnText}>Send Response</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e3a5f',
    gap: 12,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.white },
  headerSub: { fontSize: 12, color: COLORS.gray },
  content: { padding: 16 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 18 },
  statCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.navyLight,
    borderRadius: 12,
    padding: 14,
    borderLeftWidth: 3,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  statNumber: { fontSize: 24, fontWeight: '800', color: COLORS.white },
  statLabel: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  tabRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.navyLight,
    gap: 6,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  tabActive: { backgroundColor: COLORS.lime, borderColor: COLORS.lime },
  tabText: { fontSize: 14, fontWeight: '600', color: COLORS.gray },
  tabTextActive: { color: COLORS.navy },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.navyLight,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  filterChipActive: { backgroundColor: COLORS.lime, borderColor: COLORS.lime },
  filterChipText: { fontSize: 13, color: COLORS.gray, fontWeight: '500' },
  filterChipTextActive: { color: COLORS.navy },
  emptyState: { alignItems: 'center', padding: 32, gap: 10 },
  emptyText: { fontSize: 14, color: COLORS.grayDark },
  ticketCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  ticketTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  ticketSubject: { fontSize: 15, fontWeight: '600', color: COLORS.white, flex: 1 },
  ticketMeta: { fontSize: 12, color: COLORS.grayDark, marginBottom: 4 },
  ticketPreview: { fontSize: 13, color: COLORS.gray },
  replyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  replyBadgeText: { fontSize: 11, color: COLORS.lime },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.navyLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2d4a6f',
    gap: 10,
  },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: COLORS.white },
  userCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  userInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  userAvatar: { width: 40, height: 40, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  userName: { fontSize: 14, fontWeight: '600', color: COLORS.white },
  userEmail: { fontSize: 12, color: COLORS.gray },
  userType: { fontSize: 11, color: COLORS.grayDark, marginTop: 2 },
  activeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 5,
  },
  toggleDot: { width: 8, height: 8, borderRadius: 4 },
  toggleText: { fontSize: 11, fontWeight: '600' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: COLORS.navy,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.white },
  detailTicketNum: { fontSize: 12, color: COLORS.grayDark, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', marginBottom: 4 },
  detailSubject: { fontSize: 18, fontWeight: '700', color: COLORS.white, marginBottom: 12 },
  detailMeta: { gap: 4, marginBottom: 14 },
  detailMetaText: { fontSize: 13, color: COLORS.gray },
  detailDesc: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  detailDescText: { fontSize: 14, color: COLORS.white, lineHeight: 22 },
  detailSectionTitle: { fontSize: 14, fontWeight: '700', color: COLORS.lime, marginBottom: 10, marginTop: 4 },
  statusActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statusBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2d4a6f',
    gap: 5,
  },
  statusBtnText: { fontSize: 12, fontWeight: '600', textTransform: 'capitalize' },
  responseCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.lime,
  },
  responseHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  responseName: { fontSize: 13, fontWeight: '600', color: COLORS.white, flex: 1 },
  responseDate: { fontSize: 11, color: COLORS.grayDark },
  responseMessage: { fontSize: 13, color: COLORS.gray, lineHeight: 20 },
  replyInput: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    color: COLORS.white,
    borderWidth: 1,
    borderColor: '#2d4a6f',
    minHeight: 80,
    marginBottom: 12,
  },
  replyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.lime,
    borderRadius: 10,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 20,
  },
  replyBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.navy },
});
