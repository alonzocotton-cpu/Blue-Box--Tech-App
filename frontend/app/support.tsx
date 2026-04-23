import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
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
};

const CATEGORIES = [
  { id: 'login', label: 'Login Issues', icon: 'key-outline' },
  { id: 'technical', label: 'Technical Problem', icon: 'bug-outline' },
  { id: 'account', label: 'Account Help', icon: 'person-outline' },
  { id: 'feature_request', label: 'Feature Request', icon: 'bulb-outline' },
  { id: 'general', label: 'General Inquiry', icon: 'help-circle-outline' },
];

const STATUS_COLORS: Record<string, string> = {
  open: COLORS.blue,
  in_progress: COLORS.orange,
  resolved: COLORS.green,
  closed: COLORS.grayDark,
};

export default function SupportScreen() {
  const params = useLocalSearchParams<{ from?: string }>();
  const isFromLogin = params.from === 'login';

  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showFaq, setShowFaq] = useState(true);

  // New ticket form
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');

  useEffect(() => {
    loadUserInfo();
  }, []);

  const loadUserInfo = async () => {
    try {
      const techStr = await AsyncStorage.getItem('technician');
      if (techStr) {
        const tech = JSON.parse(techStr);
        setUserEmail(tech.email || '');
        setUserName(tech.full_name || tech.first_name || '');
        fetchTickets(tech.email);
      }
    } catch (e) {
      console.error('Error loading user info:', e);
    }
  };

  const fetchTickets = async (email: string) => {
    if (!email) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/support/tickets?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      if (data.tickets) setTickets(data.tickets);
    } catch (e) {
      console.error('Error fetching tickets:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitTicket = async () => {
    if (!subject.trim() || !description.trim()) {
      Alert.alert('Missing Info', 'Please fill in the subject and description.');
      return;
    }

    const ticketEmail = userEmail || 'anonymous@user.com';
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/support/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: ticketEmail,
          name: userName || 'Guest User',
          subject: subject.trim(),
          description: description.trim(),
          category,
        }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Ticket Submitted', `Your ticket #${data.ticket.ticket_number} has been created. Our support team will respond shortly.`);
        setSubject('');
        setDescription('');
        setCategory('general');
        setShowNewTicket(false);
        if (userEmail) fetchTickets(userEmail);
      } else {
        Alert.alert('Error', data.detail || 'Failed to submit ticket.');
      }
    } catch (e) {
      Alert.alert('Error', 'Unable to connect. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const FAQ_ITEMS = [
    { q: 'How do I log in?', a: 'Use your Salesforce credentials by tapping "Login with Salesforce", or create a new account with your email.' },
    { q: 'I forgot my password', a: 'Reset your password through your Salesforce portal, or contact your admin. For registered accounts, contact support.' },
    { q: 'How do I record readings?', a: 'Open a project → select equipment → use the Readings tab to enter Pre and Post service values.' },
    { q: 'How do I generate a report?', a: 'Open a project → go to Report tab → tap "Generate & Share Report". It uploads to Salesforce automatically.' },
    { q: 'The app is not loading data', a: 'Check your internet connection. Try logging out and back in. If the problem persists, submit a support ticket.' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Support</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Contact Card */}
          <View style={styles.contactCard}>
            <View style={styles.contactRow}>
              <View style={[styles.contactIcon, { backgroundColor: COLORS.lime + '20' }]}>
                <Ionicons name="mail" size={20} color={COLORS.lime} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactLabel}>Email Support</Text>
                <TouchableOpacity onPress={() => Linking.openURL('mailto:support@blueboxair.com')}>
                  <Text style={styles.contactValue}>support@blueboxair.com</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={[styles.contactRow, { marginTop: 12 }]}>
              <View style={[styles.contactIcon, { backgroundColor: COLORS.blue + '20' }]}>
                <Ionicons name="call" size={20} color={COLORS.blue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.contactLabel}>Phone Support</Text>
                <Text style={styles.contactSubLabel}>Mon–Fri, 8AM–5PM EST</Text>
              </View>
            </View>
          </View>

          {/* Submit Ticket Button */}
          <TouchableOpacity
            style={styles.submitTicketButton}
            onPress={() => setShowNewTicket(true)}
          >
            <Ionicons name="add-circle" size={22} color={COLORS.navy} />
            <Text style={styles.submitTicketText}>Submit a Support Ticket</Text>
          </TouchableOpacity>

          {/* FAQ Section */}
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => setShowFaq(!showFaq)}
          >
            <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
            <Ionicons name={showFaq ? 'chevron-up' : 'chevron-down'} size={20} color={COLORS.lime} />
          </TouchableOpacity>

          {showFaq && FAQ_ITEMS.map((faq, i) => (
            <View key={i} style={styles.faqCard}>
              <Text style={styles.faqQuestion}>{faq.q}</Text>
              <Text style={styles.faqAnswer}>{faq.a}</Text>
            </View>
          ))}

          {/* My Tickets Section (only if logged in) */}
          {userEmail ? (
            <>
              <View style={[styles.sectionHeader, { marginTop: 20 }]}>
                <Text style={styles.sectionTitle}>My Tickets</Text>
                <TouchableOpacity onPress={() => fetchTickets(userEmail)}>
                  <Ionicons name="refresh" size={20} color={COLORS.lime} />
                </TouchableOpacity>
              </View>

              {loading ? (
                <ActivityIndicator color={COLORS.lime} style={{ marginTop: 16 }} />
              ) : tickets.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="ticket-outline" size={32} color={COLORS.grayDark} />
                  <Text style={styles.emptyText}>No support tickets yet</Text>
                </View>
              ) : (
                tickets.map((ticket) => (
                  <View key={ticket._id} style={styles.ticketCard}>
                    <View style={styles.ticketHeader}>
                      <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[ticket.status] || COLORS.gray) + '20' }]}>
                        <Text style={[styles.statusText, { color: STATUS_COLORS[ticket.status] || COLORS.gray }]}>
                          {(ticket.status || 'open').replace('_', ' ').toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.ticketNumber}>{ticket.ticket_number}</Text>
                    </View>
                    <Text style={styles.ticketSubject}>{ticket.subject}</Text>
                    <Text style={styles.ticketDesc} numberOfLines={2}>{ticket.description}</Text>
                    {ticket.responses && ticket.responses.length > 0 && (
                      <View style={styles.responseIndicator}>
                        <Ionicons name="chatbubble" size={14} color={COLORS.lime} />
                        <Text style={styles.responseCount}>{ticket.responses.length} response(s)</Text>
                      </View>
                    )}
                    <Text style={styles.ticketDate}>
                      {new Date(ticket.created_at).toLocaleDateString()}
                    </Text>
                  </View>
                ))
              )}
            </>
          ) : null}

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* New Ticket Modal */}
      <Modal visible={showNewTicket} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Support Ticket</Text>
              <TouchableOpacity onPress={() => setShowNewTicket(false)}>
                <Ionicons name="close" size={24} color={COLORS.gray} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Category Selection */}
              <Text style={styles.fieldLabel}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[
                      styles.categoryChip,
                      category === cat.id && styles.categoryChipActive,
                    ]}
                    onPress={() => setCategory(cat.id)}
                  >
                    <Ionicons
                      name={cat.icon as any}
                      size={16}
                      color={category === cat.id ? COLORS.navy : COLORS.gray}
                    />
                    <Text
                      style={[
                        styles.categoryChipText,
                        category === cat.id && styles.categoryChipTextActive,
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Subject */}
              <Text style={styles.fieldLabel}>Subject</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Brief summary of your issue"
                placeholderTextColor={COLORS.grayDark}
                value={subject}
                onChangeText={setSubject}
                maxLength={100}
              />

              {/* Description */}
              <Text style={styles.fieldLabel}>Description</Text>
              <TextInput
                style={[styles.textInput, styles.textArea]}
                placeholder="Please describe your issue in detail..."
                placeholderTextColor={COLORS.grayDark}
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
                maxLength={1000}
              />

              {/* If from login, allow email input */}
              {isFromLogin && (
                <>
                  <Text style={styles.fieldLabel}>Your Email</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="your@email.com"
                    placeholderTextColor={COLORS.grayDark}
                    value={userEmail}
                    onChangeText={setUserEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </>
              )}

              {/* Submit */}
              <TouchableOpacity
                style={[styles.submitButton, submitting && { opacity: 0.7 }]}
                onPress={handleSubmitTicket}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color={COLORS.navy} />
                ) : (
                  <>
                    <Ionicons name="send" size={18} color={COLORS.navy} />
                    <Text style={styles.submitButtonText}>Submit Ticket</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e3a5f',
  },
  backButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '700', color: COLORS.white },
  content: { padding: 16 },
  contactCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 14,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  contactIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contactLabel: { fontSize: 14, fontWeight: '600', color: COLORS.white },
  contactValue: { fontSize: 13, color: COLORS.lime, marginTop: 2 },
  contactSubLabel: { fontSize: 12, color: COLORS.gray, marginTop: 2 },
  submitTicketButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.lime,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginBottom: 20,
  },
  submitTicketText: { fontSize: 15, fontWeight: '700', color: COLORS.navy },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.white },
  faqCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  faqQuestion: { fontSize: 14, fontWeight: '600', color: COLORS.white, marginBottom: 6 },
  faqAnswer: { fontSize: 13, color: COLORS.gray, lineHeight: 20 },
  emptyState: { alignItems: 'center', padding: 24, gap: 8 },
  emptyText: { fontSize: 14, color: COLORS.grayDark },
  ticketCard: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  ticketNumber: { fontSize: 11, color: COLORS.grayDark, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  ticketSubject: { fontSize: 15, fontWeight: '600', color: COLORS.white, marginBottom: 4 },
  ticketDesc: { fontSize: 13, color: COLORS.gray, marginBottom: 8 },
  responseIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  responseCount: { fontSize: 12, color: COLORS.lime },
  ticketDate: { fontSize: 11, color: COLORS.grayDark },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.navy,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '85%',
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: COLORS.white },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.gray, marginBottom: 8 },
  textInput: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.white,
    borderWidth: 1,
    borderColor: '#2d4a6f',
    marginBottom: 16,
  },
  textArea: { minHeight: 120 },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: COLORS.navyLight,
    borderWidth: 1,
    borderColor: '#2d4a6f',
    marginRight: 8,
    gap: 6,
  },
  categoryChipActive: {
    backgroundColor: COLORS.lime,
    borderColor: COLORS.lime,
  },
  categoryChipText: { fontSize: 13, color: COLORS.gray, fontWeight: '500' },
  categoryChipTextActive: { color: COLORS.navy },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.lime,
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
    marginTop: 8,
    marginBottom: 20,
  },
  submitButtonText: { fontSize: 15, fontWeight: '700', color: COLORS.navy },
});
