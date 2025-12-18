import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-community/async-storage';
import { BlueNavigationStyle, SafeBlueArea } from '../../BlueComponents';
import KevaColors from '../../common/KevaColors';
const utils = require('../../util');

const DEFAULT_AGENT_MESSAGE = 'Initiating the super agent network…';
const KEYWORD_RESPONSES = {
  help: 'reading help docs',
  'd-card': 'D-CARD Read OK',
};

function formatTime(timestamp) {
  if (!Number.isFinite(timestamp)) {
    return '';
  }
  const date = new Date(Number(timestamp));
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export default function AgentChat({ navigation }) {
  const namespaceId = navigation.getParam('namespaceId');
  const displayName = navigation.getParam('displayName') || 'Agent';
  const shortCode = navigation.getParam('shortCode');
  const agentLabel = shortCode ? `${displayName} @${shortCode}` : displayName;
  const storageKey = useMemo(() => (namespaceId ? `agent_chat_${namespaceId}` : null), [namespaceId]);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const listRef = useRef(null);

  const persistMessages = useCallback(
    async nextMessages => {
      if (!storageKey) {
        return;
      }
      try {
        await AsyncStorage.setItem(storageKey, JSON.stringify(nextMessages));
      } catch (error) {
        console.warn('AgentChat: failed to persist chat history', error);
      }
    },
    [storageKey],
  );

  const createMessage = useCallback((text, sender, explicitTimestamp) => {
    const timestamp = Number.isFinite(explicitTimestamp) ? explicitTimestamp : Date.now();
    return {
      id: `${sender}_${timestamp}_${Math.random().toString(36).slice(2, 8)}`,
      text,
      timestamp,
      sender,
    };
  }, []);

  const scrollToBottom = useCallback(() => {
    if (listRef.current && typeof listRef.current.scrollToEnd === 'function') {
      listRef.current.scrollToEnd({ animated: true });
    }
  }, []);

  const ensureSeededHistory = useCallback(
    existing => {
      if (existing.some(item => item?.text === DEFAULT_AGENT_MESSAGE)) {
        return existing;
      }
      const earliestTimestamp = existing.reduce((min, item) => {
        if (Number.isFinite(item?.timestamp) && item.timestamp < min) {
          return item.timestamp;
        }
        return min;
      }, Infinity);
      const seedTimestamp = Number.isFinite(earliestTimestamp) ? earliestTimestamp - 1 : Date.now();
      const seededMessage = createMessage(DEFAULT_AGENT_MESSAGE, 'agent', seedTimestamp);
      return [seededMessage, ...existing];
    },
    [createMessage],
  );

  const appendMessages = useCallback(
    newEntries => {
      const incoming = Array.isArray(newEntries) ? newEntries : [newEntries];
      setMessages(prev => {
        const updated = prev.concat(incoming);
        persistMessages(updated);
        return updated;
      });
      requestAnimationFrame(scrollToBottom);
    },
    [persistMessages, scrollToBottom],
  );

  useEffect(() => {
    navigation.setParams({ title: agentLabel });
  }, [agentLabel, navigation]);

  useEffect(() => {
    const handleBackPress = () => {
      if (!navigation?.isFocused || !navigation.isFocused()) {
        return false;
      }
      if (navigation && typeof navigation.canGoBack === 'function' && navigation.canGoBack()) {
        navigation.goBack(null);
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', handleBackPress);
    return () => subscription.remove();
  }, [navigation]);

  useEffect(() => {
    let cancelled = false;
    const loadMessages = async () => {
      if (!storageKey) {
        return;
      }
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            const seeded = ensureSeededHistory(parsed);
            if (cancelled) {
              return;
            }
            setMessages(seeded);
            await persistMessages(seeded);
            return;
          }
        }
        if (cancelled) {
          return;
        }
        const seededMessages = [createMessage(DEFAULT_AGENT_MESSAGE, 'agent')];
        setMessages(seededMessages);
        await persistMessages(seededMessages);
      } catch (error) {
        console.warn('AgentChat: failed to load chat history', error);
      }
    };
    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [createMessage, ensureSeededHistory, persistMessages, storageKey]);

  const detectKeywordResponse = useCallback(text => {
    const normalized = text.trim().toLowerCase();
    const matched = Object.entries(KEYWORD_RESPONSES).find(([keyword]) => normalized.includes(keyword));
    return matched ? matched[1] : null;
  }, []);

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      return;
    }
    const timestamp = Date.now();
    const nextMessages = [createMessage(trimmed, 'user', timestamp)];
    const keywordResponse = detectKeywordResponse(trimmed);
    if (keywordResponse) {
      nextMessages.push(createMessage(keywordResponse, 'agent', timestamp + 1));
    }
    appendMessages(nextMessages);
    setInputValue('');
  };

  const renderItem = ({ item }) => (
    <View style={[styles.messageRow, item.sender === 'agent' ? styles.agentRow : styles.userRow]}>
      <View style={[styles.messageBubble, item.sender === 'agent' ? styles.agentBubble : styles.userBubble]}>
        <Text style={styles.messageText}>{item.text}</Text>
        {Number.isFinite(item.timestamp) && (
          <Text style={styles.messageTime}>{formatTime(item.timestamp)}</Text>
        )}
      </View>
    </View>
  );

  useEffect(() => {
    requestAnimationFrame(scrollToBottom);
  }, [messages.length, scrollToBottom]);

  return (
    <SafeBlueArea style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: 'padding', android: undefined })}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
        style={styles.container}
      >
        <View style={styles.container}>
          <View style={styles.headerCard}>
            <View>
              <Text style={styles.agentName}>{displayName}</Text>
              <Text style={styles.agentId}>{shortCode ? `@${shortCode}` : namespaceId}</Text>
            </View>
          </View>

          <View style={styles.messagesWrapper}>
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={item => item.id}
              renderItem={renderItem}
              ListEmptyComponent={<Text style={styles.emptyState}>Start a conversation with this agent.</Text>}
              contentContainerStyle={messages.length === 0 ? styles.emptyContent : styles.messagesContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.select({ ios: 'interactive', android: 'on-drag' })}
              onScrollBeginDrag={Keyboard.dismiss}
            />
          </View>

          <View style={styles.inputBar}>
            <TextInput
              value={inputValue}
              onChangeText={setInputValue}
              placeholder="Type a message"
              placeholderTextColor={KevaColors.lightText}
              style={styles.input}
              multiline
              editable
              returnKeyType="send"
              onSubmitEditing={handleSend}
              onFocus={() => {
                requestAnimationFrame(scrollToBottom);
              }}
            />
            <TouchableOpacity style={styles.sendButton} onPress={handleSend} activeOpacity={0.8}>
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeBlueArea>
  );
}

AgentChat.navigationOptions = ({ navigation }) => ({
  ...BlueNavigationStyle(navigation, false),
  title: navigation.getParam('title', 'Agent Chat'),
});

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: KevaColors.background,
  },
  container: {
    flex: 1,
    backgroundColor: KevaColors.background,
  },
  headerCard: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: KevaColors.cellBorder,
    backgroundColor: '#fff',
  },
  agentName: {
    fontSize: 17,
    color: KevaColors.darkText,
    fontWeight: '700',
  },
  agentId: {
    marginTop: 4,
    color: KevaColors.lightText,
    fontSize: 13,
  },
  messagesWrapper: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
  },
  messagesContent: {
    paddingBottom: 30,
  },
  emptyContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageRow: {
    marginBottom: 12,
    alignItems: 'flex-end',
  },
  agentRow: {
    alignItems: 'flex-start',
  },
  userRow: {
    alignItems: 'flex-end',
  },
  messageBubble: {
    maxWidth: '85%',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: utils.THIN_BORDER,
    borderColor: KevaColors.cellBorder,
  },
  agentBubble: {
    backgroundColor: '#f6f8fb',
  },
  userBubble: {
    backgroundColor: '#f0f4ff',
  },
  messageText: {
    color: KevaColors.darkText,
    fontSize: 14,
    lineHeight: 19,
  },
  messageTime: {
    marginTop: 6,
    fontSize: 11,
    color: KevaColors.lightText,
    alignSelf: 'flex-end',
  },
  emptyState: {
    color: KevaColors.lightText,
    fontSize: 14,
    textAlign: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: KevaColors.cellBorder,
    backgroundColor: '#fff',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 8,
    borderWidth: utils.THIN_BORDER,
    borderColor: KevaColors.cellBorder,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: KevaColors.darkText,
    fontSize: 14,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
  },
  sendButton: {
    marginLeft: 10,
    backgroundColor: KevaColors.actionText,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  sendButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
