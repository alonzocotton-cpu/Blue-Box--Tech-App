import React, { useState, useRef, useEffect } from 'react';
import { HelpButton, HelpModal, HELP_CONTENT } from '../../components/HelpGuide';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { API_BASE_URL } from '../../utils/api';

const API_URL = API_BASE_URL;

const COLORS = {
  navy: '#0f2744',
  navyLight: '#1a365d',
  navyMid: '#1e3a5f',
  lime: '#c5d93d',
  white: '#ffffff',
  gray: '#94a3b8',
  grayDark: '#64748b',
  purple: '#8b5cf6',
};

const LOGO_URI = 'https://customer-assets.emergentagent.com/job_ff19b27f-9c44-4d68-b174-1452a3057557/artifacts/2vycib7s_IMG_2827.jpeg';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
}

const QUICK_PROMPTS = [
  'How to read differential pressure?',
  'Coil cleaning best practices',
  'Troubleshoot low airflow',
  'Bio-Automation setup steps',
];

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: "Hello! I'm your Blue Box Air AI Assistant. I specialize in coil management and HVAC troubleshooting. How can I help you today?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [showHelp, setShowHelp] = useState(false);
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    // Generate a session ID on mount
    setSessionId(`chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  }, []);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || sending) return;

    Keyboard.dismiss();
    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text: trimmed,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const response = await fetch(`${API_URL}/api/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          session_id: sessionId,
        }),
      });

      const data = await response.json();

      if (data.session_id) {
        setSessionId(data.session_id);
      }

      const assistantMsg: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: data.response || 'Sorry, I could not process your request.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (error) {
      console.error('Chat error:', error);
      const errorMsg: ChatMessage = {
        id: `error-${Date.now()}`,
        role: 'assistant',
        text: 'Sorry, I\'m having trouble connecting right now. Please check your connection and try again.',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setSending(false);
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
  };

  const renderMessage = ({ item }: { item: ChatMessage }) => {
    const isUser = item.role === 'user';

    return (
      <View
        style={[
          styles.messageBubbleContainer,
          isUser ? styles.userBubbleContainer : styles.assistantBubbleContainer,
        ]}
      >
        {!isUser && (
          <View style={styles.avatarContainer}>
            <Image
              source={{ uri: LOGO_URI }}
              style={styles.assistantAvatar}
              resizeMode="contain"
            />
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            isUser ? styles.userBubble : styles.assistantBubble,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              isUser ? styles.userMessageText : styles.assistantMessageText,
            ]}
          >
            {item.text}
          </Text>
          <Text style={styles.messageTime}>
            {item.timestamp.toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.headerIcon, { backgroundColor: COLORS.purple + '20' }]}>
            <Ionicons name="chatbubbles" size={22} color={COLORS.purple} />
          </View>
          <View>
            <Text style={styles.headerTitle}>AI Assistant</Text>
            <Text style={styles.headerSub}>Powered by Claude AI</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.newChatBtn}
          onPress={() => {
            setMessages([
              {
                id: 'welcome',
                role: 'assistant',
                text: "Hello! I'm your Blue Box Air AI Assistant. I specialize in coil management and HVAC troubleshooting. How can I help you today?",
                timestamp: new Date(),
              },
            ]);
            setSessionId(`chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
          }}
        >
          <Ionicons name="add-circle-outline" size={22} color={COLORS.lime} />
          <Text style={styles.newChatText}>New Chat</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.chatContainer}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {/* Messages */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messagesList}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() =>
            flatListRef.current?.scrollToEnd({ animated: true })
          }
          onLayout={() =>
            flatListRef.current?.scrollToEnd({ animated: false })
          }
          ListFooterComponent={
            sending ? (
              <View style={[styles.messageBubbleContainer, styles.assistantBubbleContainer]}>
                <View style={styles.avatarContainer}>
                  <Image
                    source={{ uri: LOGO_URI }}
                    style={styles.assistantAvatar}
                    resizeMode="contain"
                  />
                </View>
                <View style={[styles.messageBubble, styles.assistantBubble, styles.typingBubble]}>
                  <ActivityIndicator size="small" color={COLORS.purple} />
                  <Text style={styles.typingText}>Thinking...</Text>
                </View>
              </View>
            ) : null
          }
        />

        {/* Quick Prompts */}
        {messages.length <= 1 && (
          <View style={styles.quickPromptsContainer}>
            <Text style={styles.quickPromptsTitle}>Try asking:</Text>
            <View style={styles.quickPromptsList}>
              {QUICK_PROMPTS.map((prompt, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.quickPromptBtn}
                  onPress={() => handleQuickPrompt(prompt)}
                >
                  <Text style={styles.quickPromptText}>{prompt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Input Area */}
        <View style={styles.inputArea}>
          <View style={styles.inputWrapper}>
            <TextInput
              style={styles.textInput}
              value={input}
              onChangeText={setInput}
              placeholder="Ask about coils, HVAC, troubleshooting..."
              placeholderTextColor={COLORS.grayDark}
              multiline
              maxLength={1000}
              editable={!sending}
              onSubmitEditing={sendMessage}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!input.trim() || sending) && styles.sendBtnDisabled,
              ]}
              onPress={sendMessage}
              disabled={!input.trim() || sending}
            >
              <Ionicons
                name="send"
                size={20}
                color={input.trim() && !sending ? COLORS.navy : COLORS.grayDark}
              />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
      <HelpButton onPress={() => setShowHelp(true)} />
      <HelpModal visible={showHelp} onClose={() => setShowHelp(false)} screenName={HELP_CONTENT.chat.name} steps={HELP_CONTENT.chat.steps} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.navy,
  },
  header: {
    backgroundColor: COLORS.navyLight,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2d4a6f',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.white,
  },
  headerSub: {
    fontSize: 12,
    color: COLORS.grayDark,
    marginTop: 1,
  },
  newChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: COLORS.lime + '15',
  },
  newChatText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.lime,
  },
  chatContainer: {
    flex: 1,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  messageBubbleContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  userBubbleContainer: {
    justifyContent: 'flex-end',
  },
  assistantBubbleContainer: {
    justifyContent: 'flex-start',
  },
  avatarContainer: {
    marginRight: 10,
    marginBottom: 4,
  },
  assistantAvatar: {
    width: 32,
    height: 32,
    borderRadius: 10,
  },
  messageBubble: {
    maxWidth: '78%',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  userBubble: {
    backgroundColor: COLORS.lime,
    borderBottomRightRadius: 6,
    marginLeft: 'auto',
  },
  assistantBubble: {
    backgroundColor: COLORS.navyLight,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 14,
  },
  typingText: {
    fontSize: 14,
    color: COLORS.grayDark,
    fontStyle: 'italic',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 22,
  },
  userMessageText: {
    color: COLORS.navy,
  },
  assistantMessageText: {
    color: COLORS.white,
  },
  messageTime: {
    fontSize: 10,
    color: COLORS.grayDark,
    marginTop: 6,
    textAlign: 'right',
  },
  quickPromptsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  quickPromptsTitle: {
    fontSize: 13,
    color: COLORS.grayDark,
    marginBottom: 10,
    fontWeight: '500',
  },
  quickPromptsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickPromptBtn: {
    backgroundColor: COLORS.navyLight,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#2d4a6f',
  },
  quickPromptText: {
    fontSize: 13,
    color: COLORS.lime,
    fontWeight: '500',
  },
  inputArea: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#2d4a6f',
    backgroundColor: COLORS.navyLight,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: COLORS.navy,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#2d4a6f',
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 48,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: COLORS.white,
    maxHeight: 100,
    paddingVertical: 8,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: COLORS.navyMid,
  },
});
