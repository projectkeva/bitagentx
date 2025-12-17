import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  BackHandler,
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

  useEffect(() => {
    navigation.setParams({ title: agentLabel });
  }, [agentLabel, navigation]);

  useEffect(() => {
    const handleHardwareBack = () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return true;
      }
      return false;
    };

    const backListener = BackHandler.addEventListener('hardwareBackPress', handleHardwareBack);
    return () => backListener.remove();
  }, [navigation]);

  useEffect(() => {
    let cancelled = false;
    const loadMessages = async () => {
      if (!storageKey) {
        return;
      }
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (raw && !cancelled) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setMessages(parsed);
          }
        }
      } catch (error) {
        console.warn('AgentChat: failed to load chat history', error);
      }
    };
    loadMessages();
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const persistMessages = async nextMessages => {
    if (!storageKey) {
      return;
    }
    try {
      await AsyncStorage.setItem(storageKey, JSON.stringify(nextMessages));
    } catch (error) {
      console.warn('AgentChat: failed to persist chat history', error);
    }
  };

  const handleSend = async () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      return;
    }
    const next = messages.concat({
      id: `${Date.now()}`,
      text: trimmed,
      timestamp: Date.now(),
    });
    setMessages(next);
    setInputValue('');
    await persistMessages(next);
    requestAnimationFrame(() => {
      if (listRef.current && typeof listRef.current.scrollToEnd === 'function') {
        listRef.current.scrollToEnd({ animated: true });
      }
    });
  };

  const renderItem = ({ item }) => (
    <View style={styles.messageRow}>
      <View style={styles.messageBubble}>
        <Text style={styles.messageText}>{item.text}</Text>
        {Number.isFinite(item.timestamp) && (
          <Text style={styles.messageTime}>{formatTime(item.timestamp)}</Text>
        )}
      </View>
    </View>
  );

  return (
    <SafeBlueArea style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.select({ ios: 88, android: 0 })}
        enabled
      >
        <View style={styles.inner}>
          <View style={styles.header}>
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
              placeholderTextColor="rgba(255,255,255,0.6)"
              style={styles.input}
              multiline
              editable
              returnKeyType="send"
              onSubmitEditing={handleSend}
              onFocus={() => {
                requestAnimationFrame(() => {
                  if (listRef.current && typeof listRef.current.scrollToEnd === 'function') {
                    listRef.current.scrollToEnd({ animated: true });
                  }
                });
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
    flex: 1,
    backgroundColor: '#0b0f18',
  },
  container: {
    flex: 1,
    backgroundColor: '#0b0f18',
  },
  inner: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(125, 211, 252, 0.25)',
    backgroundColor: '#0f1624',
  },
  agentName: {
    fontSize: 18,
    color: '#e7fff9',
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  agentId: {
    marginTop: 4,
    color: '#9fb3c8',
    fontSize: 13,
  },
  messagesWrapper: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  messagesContent: {
    paddingBottom: 20,
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
  messageBubble: {
    maxWidth: '85%',
    backgroundColor: 'rgba(125, 211, 252, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.35)',
  },
  messageText: {
    color: '#e7fff9',
    fontSize: 15,
    lineHeight: 20,
  },
  messageTime: {
    marginTop: 6,
    fontSize: 11,
    color: '#9fb3c8',
    alignSelf: 'flex-end',
  },
  emptyState: {
    color: '#9fb3c8',
    fontSize: 14,
    textAlign: 'center',
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(125, 211, 252, 0.25)',
    backgroundColor: '#0f1624',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.35)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#e7fff9',
    fontSize: 14,
  },
  sendButton: {
    marginLeft: 10,
    backgroundColor: KevaColors.actionText,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sendButtonText: {
    color: '#0b0f18',
    fontWeight: '700',
    fontSize: 14,
  },
});
