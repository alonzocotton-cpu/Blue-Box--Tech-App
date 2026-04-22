import React, { useState, useEffect, useCallback } from 'react';
import { HelpButton, HelpModal, HELP_CONTENT } from '../../components/HelpGuide';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Image,
  ActivityIndicator,
  Alert,
  Platform,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { Video, ResizeMode } from 'expo-av';
import { API_BASE_URL } from '../../utils/api';

const API_URL = API_BASE_URL;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  navy: '#0f2744',
  navyLight: '#1a365d',
  navyMid: '#1e3a5f',
  lime: '#c5d93d',
  white: '#ffffff',
  gray: '#94a3b8',
  grayDark: '#64748b',
  red: '#ef4444',
  cardBg: '#162d4a',
};

interface CoilEntry {
  _id: string;
  title: string;
  description: string;
  media: string;
  media_type: string;
  unit_name: string;
  created_by: string;
  created_by_name: string;
  created_at: string;
  month: string;
  year: number;
  loves: string[];
  love_count: number;
  comments: Array<{
    id: string;
    email: string;
    name: string;
    text: string;
    created_at: string;
  }>;
}

export default function CoilOfTheMonth() {
  const [entries, setEntries] = useState<CoilEntry[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [loading, setLoading] = useState(true);
  const [technician, setTechnician] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<CoilEntry | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Create form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newMedia, setNewMedia] = useState('');
  const [newMediaType, setNewMediaType] = useState<'photo' | 'video'>('photo');
  const [newUnitName, setNewUnitName] = useState('');
  const [creating, setCreating] = useState(false);
  const [wordCount, setWordCount] = useState(0);

  // Comment state
  const [commentText, setCommentText] = useState('');
  const [commenting, setCommenting] = useState(false);
  const [commentWordCount, setCommentWordCount] = useState(0);

  const loadData = useCallback(async () => {
    try {
      const techData = await AsyncStorage.getItem('technician');
      if (techData) {
        const tech = JSON.parse(techData);
        setTechnician(tech);
        // Check admin status
        try {
          const res = await fetch(`${API_URL}/api/admin/check?email=${encodeURIComponent(tech.email || '')}`);
          const data = await res.json();
          setIsAdmin(data.is_admin === true);
        } catch { setIsAdmin(false); }
      }
      const res = await fetch(`${API_URL}/api/coil-of-month`);
      const data = await res.json();
      if (Array.isArray(data)) setEntries(data);
    } catch (e) {
      console.log('Failed to load coil data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const pickMedia = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: true,
      quality: 0.7,
      base64: true,
      videoMaxDuration: 30,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      const isVideo = asset.type === 'video';
      setNewMediaType(isVideo ? 'video' : 'photo');
      if (asset.base64) {
        const prefix = isVideo ? 'data:video/mp4;base64,' : 'data:image/jpeg;base64,';
        setNewMedia(prefix + asset.base64);
      } else if (asset.uri) {
        setNewMedia(asset.uri);
      }
    }
  };

  const handleDescriptionChange = (text: string) => {
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length <= 150) {
      setNewDescription(text);
      setWordCount(words.length);
    }
  };

  const handleCommentChange = (text: string) => {
    const words = text.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length <= 25) {
      setCommentText(text);
      setCommentWordCount(words.length);
    }
  };

  const handleCreate = async () => {
    if (!newMedia) { Alert.alert('Required', 'Please select a photo or video'); return; }
    if (!newDescription.trim()) { Alert.alert('Required', 'Please add a description'); return; }

    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/api/coil-of-month`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: technician?.email || '',
          title: newTitle.trim() || `Coil of the Month - ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`,
          description: newDescription.trim(),
          media: newMedia,
          media_type: newMediaType,
          unit_name: newUnitName.trim(),
          created_by_name: technician?.first_name ? `${technician.first_name} ${technician.last_name || ''}`.trim() : technician?.full_name || 'Admin',
        }),
      });
      const data = await res.json();
      if (data.success) {
        Alert.alert('Posted!', 'Coil of the Month has been published.');
        setShowCreateModal(false);
        resetCreateForm();
        loadData();
      } else {
        Alert.alert('Error', data.detail || 'Failed to create post');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to create post. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const resetCreateForm = () => {
    setNewTitle('');
    setNewDescription('');
    setNewMedia('');
    setNewMediaType('photo');
    setNewUnitName('');
    setWordCount(0);
  };

  const handleLove = async (entryId: string) => {
    try {
      const res = await fetch(`${API_URL}/api/coil-of-month/${entryId}/love`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: technician?.email || '' }),
      });
      const data = await res.json();
      if (data.success) {
        setEntries(prev => prev.map(e =>
          e._id === entryId ? {
            ...e,
            love_count: data.love_count,
            loves: data.loved
              ? [...(e.loves || []), technician?.email || '']
              : (e.loves || []).filter((l: string) => l !== (technician?.email || '')),
          } : e
        ));
        if (selectedEntry?._id === entryId) {
          setSelectedEntry(prev => prev ? {
            ...prev,
            love_count: data.love_count,
            loves: data.loved
              ? [...(prev.loves || []), technician?.email || '']
              : (prev.loves || []).filter((l: string) => l !== (technician?.email || '')),
          } : null);
        }
      }
    } catch (e) {
      console.log('Love error:', e);
    }
  };

  const handleComment = async () => {
    if (!commentText.trim() || !selectedEntry) return;
    setCommenting(true);
    try {
      const res = await fetch(`${API_URL}/api/coil-of-month/${selectedEntry._id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: technician?.email || '',
          name: technician?.first_name ? `${technician.first_name} ${technician.last_name || ''}`.trim() : technician?.full_name || 'User',
          text: commentText.trim(),
        }),
      });
      const data = await res.json();
      if (data.success && data.comment) {
        const newComment = data.comment;
        setSelectedEntry(prev => prev ? {
          ...prev,
          comments: [...(prev.comments || []), newComment],
        } : null);
        setEntries(prev => prev.map(e =>
          e._id === selectedEntry._id ? {
            ...e,
            comments: [...(e.comments || []), newComment],
          } : e
        ));
        setCommentText('');
        setCommentWordCount(0);
      } else {
        Alert.alert('Error', data.detail || 'Failed to post comment');
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to post comment');
    } finally {
      setCommenting(false);
    }
  };

  const openDetail = (entry: CoilEntry) => {
    setSelectedEntry(entry);
    setShowDetailModal(true);
    setCommentText('');
    setCommentWordCount(0);
  };

  const isLoved = (entry: CoilEntry) => {
    return (entry.loves || []).includes(technician?.email || '');
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return dateStr; }
  };

  const renderMediaThumbnail = (entry: CoilEntry, size: number) => {
    if (entry.media_type === 'video') {
      return (
        <View style={{ width: size, height: size, backgroundColor: COLORS.navyMid, justifyContent: 'center', alignItems: 'center', borderRadius: 12 }}>
          <Ionicons name="play-circle" size={40} color={COLORS.lime} />
          <Text style={{ color: COLORS.gray, fontSize: 10, marginTop: 4 }}>Video</Text>
        </View>
      );
    }
    return (
      <Image source={{ uri: entry.media }} style={{ width: size, height: size, borderRadius: 12 }} resizeMode="cover" />
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.lime} />
        </View>
      </SafeAreaView>
    );
  }

  const currentEntry = entries.length > 0 ? entries[0] : null;
  const pastEntries = entries.length > 1 ? entries.slice(1) : [];

  return (
    <SafeAreaView style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerRow}>
          <Ionicons name="trophy" size={24} color={COLORS.lime} />
          <Text style={s.headerTitle}>Coil of the Month</Text>
        </View>
        {isAdmin && (
          <TouchableOpacity style={s.addBtn} onPress={() => setShowCreateModal(true)}>
            <Ionicons name="add-circle" size={22} color={COLORS.lime} />
            <Text style={s.addBtnText}>New Post</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        {/* Featured / Current Entry */}
        {currentEntry ? (
          <TouchableOpacity style={s.featuredCard} activeOpacity={0.85} onPress={() => openDetail(currentEntry)}>
            <View style={s.featuredBadge}>
              <Ionicons name="star" size={12} color={COLORS.navy} />
              <Text style={s.featuredBadgeText}>FEATURED</Text>
            </View>
            {currentEntry.media_type === 'video' ? (
              <View style={s.featuredMediaWrap}>
                <View style={s.videoPlaceholder}>
                  <Ionicons name="play-circle" size={60} color={COLORS.lime} />
                </View>
              </View>
            ) : (
              <Image source={{ uri: currentEntry.media }} style={s.featuredImage} resizeMode="cover" />
            )}
            <View style={s.featuredOverlay}>
              <Text style={s.featuredTitle}>{currentEntry.title}</Text>
              {currentEntry.unit_name ? (
                <View style={s.unitBadge}>
                  <Ionicons name="cube-outline" size={12} color={COLORS.lime} />
                  <Text style={s.unitBadgeText}>{currentEntry.unit_name}</Text>
                </View>
              ) : null}
              <Text style={s.featuredDesc} numberOfLines={3}>{currentEntry.description}</Text>
              <View style={s.featuredFooter}>
                <View style={s.engagementRow}>
                  <TouchableOpacity
                    style={s.loveBtn}
                    onPress={(e) => { e.stopPropagation(); handleLove(currentEntry._id); }}
                  >
                    <Ionicons
                      name={isLoved(currentEntry) ? 'heart' : 'heart-outline'}
                      size={22}
                      color={isLoved(currentEntry) ? COLORS.red : COLORS.white}
                    />
                    <Text style={s.loveCount}>{currentEntry.love_count || 0}</Text>
                  </TouchableOpacity>
                  <View style={s.commentCount}>
                    <Ionicons name="chatbubble-outline" size={18} color={COLORS.white} />
                    <Text style={s.commentCountText}>{(currentEntry.comments || []).length}</Text>
                  </View>
                </View>
                <Text style={s.featuredDate}>
                  By {currentEntry.created_by_name} · {formatDate(currentEntry.created_at)}
                </Text>
              </View>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={s.emptyState}>
            <Ionicons name="images-outline" size={64} color={COLORS.grayDark} />
            <Text style={s.emptyTitle}>No Coil of the Month Yet</Text>
            <Text style={s.emptyText}>
              {isAdmin ? 'Tap "New Post" to feature the first coil!' : 'Check back soon for featured coil content.'}
            </Text>
          </View>
        )}

        {/* Thumbnail Gallery of Past Entries */}
        {pastEntries.length > 0 && (
          <View style={s.gallerySection}>
            <Text style={s.sectionTitle}>Past Features</Text>
            <View style={s.galleryGrid}>
              {pastEntries.map((entry) => (
                <TouchableOpacity
                  key={entry._id}
                  style={s.galleryItem}
                  activeOpacity={0.8}
                  onPress={() => openDetail(entry)}
                >
                  {entry.media_type === 'video' ? (
                    <View style={s.galleryThumb}>
                      <Ionicons name="play-circle" size={30} color={COLORS.lime} />
                    </View>
                  ) : (
                    <Image source={{ uri: entry.media }} style={s.galleryThumb} resizeMode="cover" />
                  )}
                  <View style={s.galleryInfo}>
                    {entry.unit_name ? (
                      <View style={s.galleryUnitBadge}>
                        <Ionicons name="cube-outline" size={10} color={COLORS.lime} />
                        <Text style={s.galleryUnitText}>{entry.unit_name}</Text>
                      </View>
                    ) : null}
                    <Text style={s.galleryTitle} numberOfLines={1}>{entry.title}</Text>
                    <View style={s.galleryStats}>
                      <Ionicons name="heart" size={12} color={COLORS.red} />
                      <Text style={s.galleryStatText}>{entry.love_count || 0}</Text>
                      <Ionicons name="chatbubble" size={12} color={COLORS.grayDark} style={{ marginLeft: 8 }} />
                      <Text style={s.galleryStatText}>{(entry.comments || []).length}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* ===== DETAIL MODAL ===== */}
      <Modal visible={showDetailModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setShowDetailModal(false)}>
              <Ionicons name="close" size={28} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={s.modalHeaderTitle} numberOfLines={1}>
              {selectedEntry?.title || 'Coil of the Month'}
            </Text>
            <View style={{ width: 28 }} />
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              {selectedEntry && (
                <>
                  {/* Media */}
                  {selectedEntry.media_type === 'video' ? (
                    <Video
                      source={{ uri: selectedEntry.media }}
                      style={s.detailMedia}
                      resizeMode={ResizeMode.CONTAIN}
                      useNativeControls
                      shouldPlay={false}
                    />
                  ) : (
                    <Image source={{ uri: selectedEntry.media }} style={s.detailMedia} resizeMode="contain" />
                  )}

                  <View style={s.detailContent}>
                    {/* Unit badge */}
                    {selectedEntry.unit_name ? (
                      <View style={s.detailUnitBadge}>
                        <Ionicons name="cube-outline" size={14} color={COLORS.lime} />
                        <Text style={s.detailUnitText}>Unit: {selectedEntry.unit_name}</Text>
                      </View>
                    ) : null}

                    {/* Title & Description */}
                    <Text style={s.detailTitle}>{selectedEntry.title}</Text>
                    <Text style={s.detailDesc}>{selectedEntry.description}</Text>
                    <Text style={s.detailMeta}>
                      Posted by {selectedEntry.created_by_name} · {formatDate(selectedEntry.created_at)}
                    </Text>

                    {/* Love Button */}
                    <View style={s.detailEngagement}>
                      <TouchableOpacity
                        style={[s.detailLoveBtn, isLoved(selectedEntry) && s.detailLoveBtnActive]}
                        onPress={() => handleLove(selectedEntry._id)}
                      >
                        <Ionicons
                          name={isLoved(selectedEntry) ? 'heart' : 'heart-outline'}
                          size={20}
                          color={isLoved(selectedEntry) ? COLORS.red : COLORS.white}
                        />
                        <Text style={s.detailLoveText}>
                          {isLoved(selectedEntry) ? 'Loved' : 'Love'} · {selectedEntry.love_count || 0}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Comments Section */}
                    <View style={s.commentsSection}>
                      <Text style={s.commentsTitle}>
                        Comments ({(selectedEntry.comments || []).length})
                      </Text>

                      {(selectedEntry.comments || []).map((c, idx) => (
                        <View key={c.id || idx} style={s.commentItem}>
                          <View style={s.commentAvatar}>
                            <Text style={s.commentAvatarText}>
                              {(c.name || 'U').charAt(0).toUpperCase()}
                            </Text>
                          </View>
                          <View style={s.commentBody}>
                            <Text style={s.commentName}>{c.name}</Text>
                            <Text style={s.commentTextContent}>{c.text}</Text>
                            <Text style={s.commentDate}>{formatDate(c.created_at)}</Text>
                          </View>
                        </View>
                      ))}

                      {(selectedEntry.comments || []).length === 0 && (
                        <Text style={s.noComments}>No comments yet. Be the first!</Text>
                      )}
                    </View>
                  </View>
                </>
              )}
            </ScrollView>

            {/* Comment Input */}
            <View style={s.commentInputWrap}>
              <View style={s.commentInputRow}>
                <TextInput
                  style={s.commentInput}
                  placeholder="Add a comment (25 words max)..."
                  placeholderTextColor={COLORS.grayDark}
                  value={commentText}
                  onChangeText={handleCommentChange}
                  maxLength={200}
                />
                <TouchableOpacity
                  style={[s.commentSendBtn, (!commentText.trim() || commenting) && { opacity: 0.4 }]}
                  onPress={handleComment}
                  disabled={!commentText.trim() || commenting}
                >
                  {commenting ? (
                    <ActivityIndicator size="small" color={COLORS.navy} />
                  ) : (
                    <Ionicons name="send" size={18} color={COLORS.navy} />
                  )}
                </TouchableOpacity>
              </View>
              <Text style={s.commentWordLimit}>{commentWordCount}/25 words</Text>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      {/* ===== CREATE MODAL (ADMIN) ===== */}
      <Modal visible={showCreateModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={s.modalContainer}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => { setShowCreateModal(false); resetCreateForm(); }}>
              <Ionicons name="close" size={28} color={COLORS.white} />
            </TouchableOpacity>
            <Text style={s.modalHeaderTitle}>New Coil of the Month</Text>
            <View style={{ width: 28 }} />
          </View>

          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ flex: 1 }}
          >
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
              {/* Media Upload */}
              <Text style={s.formLabel}>Photo or Video *</Text>
              <TouchableOpacity style={s.mediaPicker} onPress={pickMedia}>
                {newMedia ? (
                  newMediaType === 'video' ? (
                    <View style={s.mediaPickerPreview}>
                      <Ionicons name="videocam" size={40} color={COLORS.lime} />
                      <Text style={s.mediaPickerText}>Video selected</Text>
                      <TouchableOpacity onPress={() => setNewMedia('')} style={s.removeMedia}>
                        <Ionicons name="close-circle" size={24} color={COLORS.red} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={s.mediaPickerPreview}>
                      <Image source={{ uri: newMedia }} style={s.mediaPreviewImg} resizeMode="cover" />
                      <TouchableOpacity onPress={() => setNewMedia('')} style={s.removeMedia}>
                        <Ionicons name="close-circle" size={24} color={COLORS.red} />
                      </TouchableOpacity>
                    </View>
                  )
                ) : (
                  <View style={s.mediaPickerEmpty}>
                    <Ionicons name="cloud-upload-outline" size={40} color={COLORS.lime} />
                    <Text style={s.mediaPickerText}>Tap to upload from gallery</Text>
                    <Text style={s.mediaPickerSub}>Photos or videos up to 30s</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Title */}
              <Text style={s.formLabel}>Title (optional)</Text>
              <TextInput
                style={s.formInput}
                placeholder="e.g. June 2026 - Amazing Coil Transformation"
                placeholderTextColor={COLORS.grayDark}
                value={newTitle}
                onChangeText={setNewTitle}
                maxLength={100}
              />

              {/* Unit Name */}
              <Text style={s.formLabel}>Associated Unit</Text>
              <TextInput
                style={s.formInput}
                placeholder="e.g. RTU-001, AHU-03"
                placeholderTextColor={COLORS.grayDark}
                value={newUnitName}
                onChangeText={setNewUnitName}
                maxLength={50}
              />

              {/* Description */}
              <Text style={s.formLabel}>Description * (150 words max)</Text>
              <TextInput
                style={[s.formInput, s.formTextArea]}
                placeholder="Describe this coil service, the before/after, and what made it special..."
                placeholderTextColor={COLORS.grayDark}
                value={newDescription}
                onChangeText={handleDescriptionChange}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
              <Text style={[s.wordCounter, wordCount > 140 && { color: COLORS.red }]}>
                {wordCount}/150 words
              </Text>

              {/* Submit */}
              <TouchableOpacity
                style={[s.publishBtn, (creating || !newMedia || !newDescription.trim()) && { opacity: 0.5 }]}
                onPress={handleCreate}
                disabled={creating || !newMedia || !newDescription.trim()}
              >
                {creating ? (
                  <ActivityIndicator size="small" color={COLORS.navy} />
                ) : (
                  <>
                    <Ionicons name="rocket" size={20} color={COLORS.navy} />
                    <Text style={s.publishBtnText}>Publish to All Users</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
      <HelpButton onPress={() => setShowHelp(true)} />
      <HelpModal visible={showHelp} onClose={() => setShowHelp(false)} screenName={HELP_CONTENT.coil.name} steps={HELP_CONTENT.coil.steps} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    backgroundColor: COLORS.navyLight,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: COLORS.white },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.lime + '20', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  addBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.lime },

  // Featured Card
  featuredCard: {
    margin: 16,
    borderRadius: 16,
    backgroundColor: COLORS.cardBg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.lime + '30',
  },
  featuredBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.lime,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  featuredBadgeText: { fontSize: 10, fontWeight: '800', color: COLORS.navy, letterSpacing: 1 },
  featuredImage: { width: '100%', height: 220 },
  featuredMediaWrap: { width: '100%', height: 220 },
  videoPlaceholder: { flex: 1, backgroundColor: COLORS.navyMid, justifyContent: 'center', alignItems: 'center' },
  featuredOverlay: { padding: 16 },
  featuredTitle: { fontSize: 18, fontWeight: '700', color: COLORS.white, marginBottom: 4 },
  unitBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: COLORS.lime + '15', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, alignSelf: 'flex-start', marginBottom: 8 },
  unitBadgeText: { fontSize: 11, fontWeight: '600', color: COLORS.lime },
  featuredDesc: { fontSize: 14, color: COLORS.gray, lineHeight: 20, marginBottom: 12 },
  featuredFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  engagementRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  loveBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  loveCount: { fontSize: 14, fontWeight: '600', color: COLORS.white },
  commentCount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  commentCountText: { fontSize: 14, color: COLORS.white },
  featuredDate: { fontSize: 11, color: COLORS.grayDark },

  // Empty State
  emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.white, marginTop: 16 },
  emptyText: { fontSize: 14, color: COLORS.grayDark, textAlign: 'center', marginTop: 8, lineHeight: 20 },

  // Gallery
  gallerySection: { paddingHorizontal: 16, marginTop: 8 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.white, marginBottom: 12 },
  galleryGrid: { gap: 12 },
  galleryItem: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  galleryThumb: {
    width: 90,
    height: 90,
    backgroundColor: COLORS.navyMid,
    justifyContent: 'center',
    alignItems: 'center',
  },
  galleryInfo: { flex: 1, padding: 12, justifyContent: 'center' },
  galleryUnitBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.lime + '15', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: 'flex-start', marginBottom: 4 },
  galleryUnitText: { fontSize: 10, fontWeight: '600', color: COLORS.lime },
  galleryTitle: { fontSize: 14, fontWeight: '600', color: COLORS.white, marginBottom: 4 },
  galleryStats: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  galleryStatText: { fontSize: 12, color: COLORS.grayDark },

  // Modal
  modalContainer: { flex: 1, backgroundColor: COLORS.navy },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.navyLight,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
  },
  modalHeaderTitle: { fontSize: 17, fontWeight: '700', color: COLORS.white, flex: 1, textAlign: 'center' },

  // Detail
  detailMedia: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 0.65, backgroundColor: COLORS.navyMid },
  detailContent: { padding: 20 },
  detailUnitBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.lime + '15', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10, alignSelf: 'flex-start', marginBottom: 12 },
  detailUnitText: { fontSize: 12, fontWeight: '600', color: COLORS.lime },
  detailTitle: { fontSize: 22, fontWeight: '700', color: COLORS.white, marginBottom: 10 },
  detailDesc: { fontSize: 15, color: COLORS.gray, lineHeight: 22, marginBottom: 12 },
  detailMeta: { fontSize: 12, color: COLORS.grayDark, marginBottom: 16 },
  detailEngagement: { marginBottom: 20 },
  detailLoveBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.navyMid, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#2d4a6f' },
  detailLoveBtnActive: { borderColor: COLORS.red + '50', backgroundColor: COLORS.red + '10' },
  detailLoveText: { fontSize: 14, fontWeight: '600', color: COLORS.white },

  // Comments
  commentsSection: { borderTopWidth: 1, borderTopColor: '#2d4a6f', paddingTop: 16 },
  commentsTitle: { fontSize: 16, fontWeight: '700', color: COLORS.white, marginBottom: 12 },
  commentItem: { flexDirection: 'row', marginBottom: 16, gap: 10 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: COLORS.lime + '20', justifyContent: 'center', alignItems: 'center' },
  commentAvatarText: { fontSize: 14, fontWeight: '700', color: COLORS.lime },
  commentBody: { flex: 1 },
  commentName: { fontSize: 13, fontWeight: '600', color: COLORS.white },
  commentTextContent: { fontSize: 13, color: COLORS.gray, marginTop: 2, lineHeight: 18 },
  commentDate: { fontSize: 11, color: COLORS.grayDark, marginTop: 4 },
  noComments: { fontSize: 13, color: COLORS.grayDark, textAlign: 'center', paddingVertical: 20 },

  commentInputWrap: { padding: 12, borderTopWidth: 1, borderTopColor: '#2d4a6f', backgroundColor: COLORS.navyLight },
  commentInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  commentInput: { flex: 1, backgroundColor: COLORS.navyMid, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: COLORS.white, fontSize: 14 },
  commentSendBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.lime, justifyContent: 'center', alignItems: 'center' },
  commentWordLimit: { fontSize: 11, color: COLORS.grayDark, marginTop: 4, marginLeft: 4 },

  // Create Form
  formLabel: { fontSize: 14, fontWeight: '600', color: COLORS.white, marginBottom: 8, marginTop: 16 },
  formInput: { backgroundColor: COLORS.navyMid, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, color: COLORS.white, fontSize: 14, borderWidth: 1, borderColor: '#2d4a6f' },
  formTextArea: { minHeight: 120, paddingTop: 12 },
  wordCounter: { fontSize: 11, color: COLORS.grayDark, textAlign: 'right', marginTop: 4 },
  mediaPicker: { borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: COLORS.lime + '30', borderStyle: 'dashed' },
  mediaPickerEmpty: { paddingVertical: 40, alignItems: 'center', gap: 8 },
  mediaPickerText: { fontSize: 14, fontWeight: '500', color: COLORS.lime },
  mediaPickerSub: { fontSize: 12, color: COLORS.grayDark },
  mediaPickerPreview: { height: 200, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.navyMid },
  mediaPreviewImg: { width: '100%', height: '100%' },
  removeMedia: { position: 'absolute', top: 8, right: 8 },
  publishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.lime,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 24,
  },
  publishBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.navy },
});
