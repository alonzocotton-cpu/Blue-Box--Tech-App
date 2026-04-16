import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  FlatList,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { API_BASE_URL } from '../utils/api';

const API_URL = API_BASE_URL;

const COLORS = {
  navy: '#0a1929',
  navyLight: '#0d2137',
  navyMid: '#132f4c',
  lime: '#a3e635',
  white: '#ffffff',
  gray: '#94a3b8',
  grayDark: '#64748b',
  inProgress: '#f59e0b',
  completed: '#22c55e',
  notCompleted: '#ef4444',
};

const STAGE_CONFIG = {
  in_progress: { label: 'In Progress', color: COLORS.inProgress, icon: 'time' as const, bg: '#f59e0b12' },
  completed: { label: 'Completed', color: COLORS.completed, icon: 'checkmark-circle' as const, bg: '#22c55e12' },
  not_completed: { label: 'Not Completed', color: COLORS.notCompleted, icon: 'close-circle' as const, bg: '#ef444412' },
};

interface KanbanProject {
  id?: string;
  _id?: string;
  name?: string;
  client_name?: string;
  client?: string;
  stage?: string;
  status?: string;
  stage_category?: string;
  owner_name?: string;
  owner_email?: string;
  line_of_business?: string;
  equipment_count?: number;
  amount?: number;
  close_date?: string;
  source?: string;
  salesforce_id?: string;
}

export default function KanbanScreen() {
  const [kanbanData, setKanbanData] = useState<Record<string, KanbanProject[]>>({
    in_progress: [],
    completed: [],
    not_completed: [],
  });
  const [counts, setCounts] = useState({ in_progress: 0, completed: 0, not_completed: 0 });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [viewAll, setViewAll] = useState(false);
  const [activeColumn, setActiveColumn] = useState<string>('in_progress');
  const [userEmail, setUserEmail] = useState('');

  useEffect(() => {
    loadKanban();
  }, [viewAll]);

  const loadKanban = async () => {
    try {
      const techData = await AsyncStorage.getItem('technician');
      const tech = techData ? JSON.parse(techData) : {};
      const email = tech.email || '';
      setUserEmail(email);

      const res = await fetch(`${API_URL}/api/projects/kanban?email=${encodeURIComponent(email)}&view_all=${viewAll}`);
      const data = await res.json();
      
      setKanbanData(data.kanban || { in_progress: [], completed: [], not_completed: [] });
      setCounts(data.counts || { in_progress: 0, completed: 0, not_completed: 0 });
      setIsAdmin(data.is_admin || false);
    } catch (error) {
      console.error('Load kanban error:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadKanban();
  }, [viewAll]);

  const navigateToProject = (project: KanbanProject) => {
    const projectId = project._id || project.id || project.salesforce_id || '';
    router.push(`/project/${projectId}`);
  };

  const renderProjectCard = ({ item }: { item: KanbanProject }) => {
    const stageConfig = STAGE_CONFIG[item.stage_category as keyof typeof STAGE_CONFIG] || STAGE_CONFIG.in_progress;
    const lob = item.line_of_business || '';
    const lobColor = lob === 'AS' ? '#3b82f6' : lob === 'SS' ? '#8b5cf6' : lob === 'DS' ? '#f97316' : COLORS.gray;
    
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigateToProject(item)}
        activeOpacity={0.7}
      >
        {/* Stage indicator bar */}
        <View style={[styles.cardStageBar, { backgroundColor: stageConfig.color }]} />
        
        <View style={styles.cardContent}>
          {/* Header row */}
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardName} numberOfLines={2}>
              {item.name || 'Untitled Project'}
            </Text>
            {lob ? (
              <View style={[styles.lobBadge, { backgroundColor: lobColor + '20', borderColor: lobColor + '40' }]}>
                <Text style={[styles.lobText, { color: lobColor }]}>{lob}</Text>
              </View>
            ) : null}
          </View>

          {/* Client */}
          <View style={styles.cardMetaRow}>
            <Ionicons name="business-outline" size={12} color={COLORS.gray} />
            <Text style={styles.cardMeta} numberOfLines={1}>
              {item.client_name || item.client || 'No client'}
            </Text>
          </View>

          {/* Stage label */}
          <View style={styles.cardMetaRow}>
            <View style={[styles.stageDot, { backgroundColor: stageConfig.color }]} />
            <Text style={[styles.cardStageName, { color: stageConfig.color }]}>
              {item.stage || item.status || stageConfig.label}
            </Text>
          </View>

          {/* Footer row */}
          <View style={styles.cardFooter}>
            {item.owner_name ? (
              <View style={styles.cardMetaRow}>
                <Ionicons name="person-outline" size={11} color={COLORS.grayDark} />
                <Text style={styles.cardOwner} numberOfLines={1}>{item.owner_name}</Text>
              </View>
            ) : null}
            {item.equipment_count && item.equipment_count > 0 ? (
              <View style={styles.cardMetaRow}>
                <Ionicons name="construct-outline" size={11} color={COLORS.grayDark} />
                <Text style={styles.cardOwner}>{item.equipment_count} equip</Text>
              </View>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.lime} />
          <Text style={styles.loadingText}>Loading board...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const total = counts.in_progress + counts.completed + counts.not_completed;
  const columns = ['in_progress', 'completed', 'not_completed'] as const;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Project Board</Text>
        <View style={styles.headerRight}>
          {isAdmin && (
            <TouchableOpacity
              style={[styles.viewAllBtn, viewAll && styles.viewAllBtnActive]}
              onPress={() => setViewAll(!viewAll)}
            >
              <Ionicons name="eye" size={16} color={viewAll ? COLORS.navy : COLORS.lime} />
              <Text style={[styles.viewAllText, viewAll && styles.viewAllTextActive]}>
                {viewAll ? 'All' : 'Mine'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: COLORS.inProgress }]}>{counts.in_progress}</Text>
          <Text style={styles.statLabel}>In Progress</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: COLORS.completed }]}>{counts.completed}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: COLORS.notCompleted }]}>{counts.not_completed}</Text>
          <Text style={styles.statLabel}>Not Done</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: COLORS.white }]}>{total}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>

      {/* Column selector tabs */}
      <View style={styles.columnTabs}>
        {columns.map(col => {
          const config = STAGE_CONFIG[col];
          const isActive = activeColumn === col;
          return (
            <TouchableOpacity
              key={col}
              style={[styles.columnTab, isActive && { borderBottomColor: config.color, borderBottomWidth: 3 }]}
              onPress={() => setActiveColumn(col)}
            >
              <Ionicons name={config.icon} size={16} color={isActive ? config.color : COLORS.grayDark} />
              <Text style={[styles.columnTabText, isActive && { color: config.color, fontWeight: '700' }]}>
                {config.label}
              </Text>
              <View style={[styles.columnTabCount, { backgroundColor: isActive ? config.color + '20' : COLORS.navyMid }]}>
                <Text style={[styles.columnTabCountText, { color: isActive ? config.color : COLORS.grayDark }]}>
                  {counts[col]}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Project cards list */}
      <FlatList
        data={kanbanData[activeColumn] || []}
        renderItem={renderProjectCard}
        keyExtractor={(item, index) => item._id || item.id || item.salesforce_id || `proj-${index}`}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.lime}
            colors={[COLORS.lime]}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons
              name={STAGE_CONFIG[activeColumn as keyof typeof STAGE_CONFIG]?.icon || 'folder-open'}
              size={44}
              color={COLORS.grayDark}
            />
            <Text style={styles.emptyTitle}>No projects</Text>
            <Text style={styles.emptySubtitle}>
              No {STAGE_CONFIG[activeColumn as keyof typeof STAGE_CONFIG]?.label.toLowerCase()} projects found
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.navy },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: COLORS.gray, fontSize: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: COLORS.navyLight,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
    gap: 12,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.navyMid,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: COLORS.white },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  viewAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 14, borderWidth: 1,
    borderColor: COLORS.lime + '50',
    backgroundColor: COLORS.navyMid,
  },
  viewAllBtnActive: { backgroundColor: COLORS.lime, borderColor: COLORS.lime },
  viewAllText: { fontSize: 12, fontWeight: '600', color: COLORS.lime },
  viewAllTextActive: { color: COLORS.navy },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.navyLight,
    marginHorizontal: 16, marginTop: 8,
    borderRadius: 12, paddingVertical: 12,
    borderWidth: 1, borderColor: '#2d4a6f',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 20, fontWeight: '800' },
  statLabel: { fontSize: 9, color: COLORS.grayDark, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  statDivider: { width: 1, height: 28, backgroundColor: '#2d4a6f', alignSelf: 'center' },
  columnTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 4,
  },
  columnTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  columnTabText: { fontSize: 11, fontWeight: '500', color: COLORS.grayDark },
  columnTabCount: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8,
    minWidth: 20, alignItems: 'center',
  },
  columnTabCountText: { fontSize: 10, fontWeight: '700' },
  listContent: { padding: 16, paddingBottom: 32 },
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.navyLight,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#2d4a6f',
    overflow: 'hidden',
  },
  cardStageBar: { width: 4, borderTopLeftRadius: 12, borderBottomLeftRadius: 12 },
  cardContent: { flex: 1, padding: 14 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardName: { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.white, lineHeight: 19, marginRight: 8 },
  lobBadge: {
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 6, borderWidth: 1,
  },
  lobText: { fontSize: 10, fontWeight: '700' },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  cardMeta: { fontSize: 12, color: COLORS.gray, flex: 1 },
  stageDot: { width: 6, height: 6, borderRadius: 3 },
  cardStageName: { fontSize: 11, fontWeight: '600' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#1a3a5c' },
  cardOwner: { fontSize: 11, color: COLORS.grayDark },
  emptyState: { alignItems: 'center', paddingTop: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.gray },
  emptySubtitle: { fontSize: 13, color: COLORS.grayDark },
});
