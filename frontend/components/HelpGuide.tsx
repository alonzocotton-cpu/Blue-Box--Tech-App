import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const COLORS = {
  navy: '#0f2744',
  navyLight: '#1a365d',
  lime: '#c5d93d',
  white: '#ffffff',
  gray: '#94a3b8',
  grayDark: '#475569',
  green: '#22c55e',
  orange: '#f59e0b',
};

export interface HelpStep {
  icon: string;
  title: string;
  description: string;
  color?: string;
}

export interface HelpGuideProps {
  screenName: string;
  steps: HelpStep[];
}

// Floating "?" help button
export const HelpButton = ({ onPress }: { onPress: () => void }) => (
  <TouchableOpacity
    style={styles.floatingButton}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Ionicons name="help-circle" size={26} color={COLORS.navy} />
  </TouchableOpacity>
);

// Help modal with steps
export const HelpModal = ({ visible, onClose, screenName, steps }: {
  visible: boolean;
  onClose: () => void;
  screenName: string;
  steps: HelpStep[];
}) => {
  const [currentStep, setCurrentStep] = useState(0);

  const handleClose = () => {
    setCurrentStep(0);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="book-outline" size={20} color={COLORS.lime} />
              <Text style={styles.modalTitle}>{screenName} Guide</Text>
            </View>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close-circle" size={28} color={COLORS.gray} />
            </TouchableOpacity>
          </View>

          {/* Step indicators */}
          <View style={styles.stepIndicators}>
            {steps.map((_, idx) => (
              <View
                key={idx}
                style={[
                  styles.stepDot,
                  idx === currentStep && styles.stepDotActive,
                  idx < currentStep && styles.stepDotDone,
                ]}
              />
            ))}
          </View>

          {/* Content */}
          <ScrollView
            style={styles.stepContent}
            showsVerticalScrollIndicator={false}
          >
            {steps[currentStep] && (
              <View style={styles.stepCard}>
                <View style={[
                  styles.stepIconCircle,
                  { backgroundColor: (steps[currentStep].color || COLORS.lime) + '20' },
                ]}>
                  <Ionicons
                    name={steps[currentStep].icon as any}
                    size={36}
                    color={steps[currentStep].color || COLORS.lime}
                  />
                </View>
                <Text style={styles.stepNumber}>Step {currentStep + 1} of {steps.length}</Text>
                <Text style={styles.stepTitle}>{steps[currentStep].title}</Text>
                <Text style={styles.stepDescription}>{steps[currentStep].description}</Text>
              </View>
            )}
          </ScrollView>

          {/* Navigation */}
          <View style={styles.navButtons}>
            {currentStep > 0 ? (
              <TouchableOpacity
                style={styles.navButtonSecondary}
                onPress={() => setCurrentStep(currentStep - 1)}
              >
                <Ionicons name="arrow-back" size={18} color={COLORS.lime} />
                <Text style={styles.navButtonSecondaryText}>Back</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ flex: 1 }} />
            )}

            {currentStep < steps.length - 1 ? (
              <TouchableOpacity
                style={styles.navButtonPrimary}
                onPress={() => setCurrentStep(currentStep + 1)}
              >
                <Text style={styles.navButtonPrimaryText}>Next</Text>
                <Ionicons name="arrow-forward" size={18} color={COLORS.navy} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.navButtonPrimary}
                onPress={handleClose}
              >
                <Text style={styles.navButtonPrimaryText}>Got It!</Text>
                <Ionicons name="checkmark-circle" size={18} color={COLORS.navy} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
};

// =================== HELP CONTENT FOR EACH SCREEN ===================

export const HELP_CONTENT: Record<string, { name: string; steps: HelpStep[] }> = {
  home: {
    name: 'Home Dashboard',
    steps: [
      {
        icon: 'home-outline',
        title: 'Welcome to Your Dashboard',
        description: 'Your home screen shows a summary of your active projects, equipment count, and quick-access cards. Swipe down to refresh the data at any time.',
        color: COLORS.lime,
      },
      {
        icon: 'grid-outline',
        title: 'Quick Navigation Cards',
        description: 'Tap any card to jump directly to that section:\n\n• My Projects — View all assigned projects\n• AI Assistant — Get instant help with troubleshooting\n• My Profile — Update your technician profile',
        color: COLORS.green,
      },
      {
        icon: 'star-outline',
        title: 'Coil of the Month',
        description: 'The featured "Coil of the Month" appears on your dashboard. Tap it to view details, like it, or leave a comment for your team.',
        color: COLORS.orange,
      },
      {
        icon: 'notifications-outline',
        title: 'Stay Updated',
        description: 'Check the notification bell icon in the top-right corner for important updates about your projects and team announcements.',
        color: COLORS.lime,
      },
    ],
  },

  projects: {
    name: 'Projects',
    steps: [
      {
        icon: 'folder-open-outline',
        title: 'Your Project List',
        description: 'This screen shows all projects assigned to you. Each project card displays the project name, client, status, and key stats like equipment count.',
        color: COLORS.lime,
      },
      {
        icon: 'search-outline',
        title: 'Search & Filter',
        description: 'Use the search bar at the top to quickly find a project by name or client. You can also filter projects by their current status.',
        color: COLORS.green,
      },
      {
        icon: 'hand-left-outline',
        title: 'Open a Project',
        description: 'Tap any project card to view its full details, including:\n\n• Equipment list\n• Service readings (Pre & Post)\n• Photos & service logs\n• Report generation',
        color: COLORS.orange,
      },
    ],
  },

  projectDetail: {
    name: 'Project Detail',
    steps: [
      {
        icon: 'layers-outline',
        title: 'Project Overview',
        description: 'The top section shows project info — name, client, address, and status. Below are tabs for Equipment, Readings, Photos, and Report.',
        color: COLORS.lime,
      },
      {
        icon: 'hardware-chip-outline',
        title: 'Equipment List',
        description: 'The Equipment tab lists all units at this site. Tap any equipment to view its details and record service readings.',
        color: COLORS.green,
      },
      {
        icon: 'speedometer-outline',
        title: 'Recording Readings',
        description: 'To record a reading:\n\n1. Select an equipment unit\n2. Tap "Add Reading"\n3. Choose the type (Differential Pressure, Airflow, etc.)\n4. Select Pre or Post phase\n5. Enter the value and date/time\n6. Tap Save',
        color: COLORS.orange,
      },
      {
        icon: 'swap-horizontal-outline',
        title: 'Pre vs Post Comparison',
        description: 'After recording both Pre and Post readings, the comparison table automatically shows:\n\n• Pre value → Post value → Difference\n• Green = improvement, Red = needs attention\n• All values in correct units (inWC, FPM)',
        color: COLORS.lime,
      },
      {
        icon: 'document-text-outline',
        title: 'Generate Reports',
        description: 'Go to the Report tab and tap "Generate & Share Report" to:\n\n• Calculate avg pressure drop per unit\n• Calculate avg airflow increase per unit\n• Generate a branded PDF\n• Upload to Salesforce automatically\n• Share via Gmail or other apps',
        color: COLORS.green,
      },
      {
        icon: 'camera-outline',
        title: 'Photos & Logs',
        description: 'Use the Photos tab to capture before/after images of equipment. All photos are tagged with the project and timestamp for documentation.',
        color: COLORS.orange,
      },
    ],
  },

  chat: {
    name: 'AI Assistant',
    steps: [
      {
        icon: 'chatbubble-ellipses-outline',
        title: 'Your AI Troubleshooting Assistant',
        description: 'The AI Assistant is powered by advanced AI and trained on HVAC knowledge. Ask it anything about coil management, troubleshooting, or best practices.',
        color: COLORS.lime,
      },
      {
        icon: 'create-outline',
        title: 'How to Ask Questions',
        description: 'Type your question in the message box at the bottom and tap Send. Try questions like:\n\n• "Why is airflow low after cleaning?"\n• "What is normal differential pressure?"\n• "How to check coil condition?"',
        color: COLORS.green,
      },
      {
        icon: 'bulb-outline',
        title: 'Tips for Best Results',
        description: 'Be specific with your questions. Include details like:\n\n• Equipment type (RTU, AHU)\n• Symptoms you\'re seeing\n• Current readings or values\n• What you\'ve already tried\n\nThe AI will provide step-by-step guidance.',
        color: COLORS.orange,
      },
    ],
  },

  coil: {
    name: 'Coil of the Month',
    steps: [
      {
        icon: 'trophy-outline',
        title: 'Coil of the Month Gallery',
        description: 'This section showcases notable coil cleaning results submitted by the team. Browse through featured coils and see before/after transformations.',
        color: COLORS.lime,
      },
      {
        icon: 'heart-outline',
        title: 'Like & Comment',
        description: 'Show your appreciation by tapping the heart icon to like a coil entry. Tap the comment icon to leave feedback or congratulate your teammates.',
        color: '#ef4444',
      },
      {
        icon: 'add-circle-outline',
        title: 'Submit a Coil (Admins)',
        description: 'Admin users can submit new Coil of the Month entries by tapping the "+" button. Upload a photo, add a title and description to share with the team.',
        color: COLORS.orange,
      },
    ],
  },

  team: {
    name: 'Team & Org Chart',
    steps: [
      {
        icon: 'people-outline',
        title: 'Organization Chart',
        description: 'View the Blue Box Air team hierarchy. The chart shows leadership at the top and team members organized by region and role.',
        color: COLORS.lime,
      },
      {
        icon: 'search-outline',
        title: 'Find Team Members',
        description: 'Use the search bar to find a specific team member by name. Their position, role, and contact info will be displayed.',
        color: COLORS.green,
      },
      {
        icon: 'call-outline',
        title: 'Contact Teammates',
        description: 'Tap on any team member card to see their details. You can quickly reach out to supervisors or colleagues for support.',
        color: COLORS.orange,
      },
    ],
  },

  profile: {
    name: 'My Profile',
    steps: [
      {
        icon: 'person-circle-outline',
        title: 'Your Technician Profile',
        description: 'View and manage your personal profile. This includes your name, email, phone, title, and profile photo.',
        color: COLORS.lime,
      },
      {
        icon: 'camera-outline',
        title: 'Update Profile Photo',
        description: 'Tap on your profile photo or the camera icon to upload a new photo. Choose from your gallery or take a new picture.',
        color: COLORS.green,
      },
      {
        icon: 'cloud-outline',
        title: 'Salesforce Sync Status',
        description: 'The Salesforce section shows your sync status. If linked, your profile data syncs automatically with your company Salesforce account.',
        color: COLORS.orange,
      },
      {
        icon: 'log-out-outline',
        title: 'Sign Out',
        description: 'Tap the "Sign Out" button at the bottom to log out. If Face ID is enabled, you can quickly sign back in on your next visit.',
        color: '#ef4444',
      },
    ],
  },
};

const styles = StyleSheet.create({
  floatingButton: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 90 : 75,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.lime,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 6,
      },
      android: {
        elevation: 8,
      },
      default: {
        boxShadow: '0px 4px 6px rgba(0,0,0,0.3)',
      },
    }),
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: COLORS.navy,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '80%',
    borderTopWidth: 2,
    borderTopColor: COLORS.lime + '40',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: '700',
  },
  stepIndicators: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 16,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.grayDark,
  },
  stepDotActive: {
    width: 24,
    backgroundColor: COLORS.lime,
  },
  stepDotDone: {
    backgroundColor: COLORS.lime + '60',
  },
  stepContent: {
    maxHeight: 350,
    marginBottom: 16,
  },
  stepCard: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  stepIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  stepNumber: {
    color: COLORS.grayDark,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 6,
  },
  stepTitle: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
  },
  stepDescription: {
    color: COLORS.gray,
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  navButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  navButtonPrimary: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.lime,
    borderRadius: 12,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  navButtonPrimaryText: {
    color: COLORS.navy,
    fontWeight: '700',
    fontSize: 15,
  },
  navButtonSecondary: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.navyLight,
    borderRadius: 12,
    paddingVertical: 14,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.lime + '30',
  },
  navButtonSecondaryText: {
    color: COLORS.lime,
    fontWeight: '600',
    fontSize: 15,
  },
});
