import React from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  SafeAreaView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import RNFS from 'react-native-fs';
const StyleSheet = require('../../PlatformStyleSheet');
const KevaColors = require('../../common/KevaColors');
import { BlueNavigationStyle } from '../../BlueComponents';

const CHAT_DIR = `${RNFS.DocumentDirectoryPath}/agent_chats`;
const INTRO_MESSAGE = 'Initiating the super agent network…';

class AgentChat extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      allMessages: [],
      messages: [],
      inputValue: '',
    };
  }

  static navigationOptions = ({ navigation }) => {
    const params = navigation.state?.params || {};
    const displayName = params.displayName || 'Agent';
    const shortCode = params.shortCode ? `@${params.shortCode}` : '';

    return {
      ...BlueNavigationStyle(),
      title: '',
      headerTitle: () => (
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>{displayName}</Text>
          {!!shortCode && <Text style={styles.headerSubtitle}>{shortCode}</Text>}
        </View>
      ),
    };
  };

  componentDidMount() {
    this._isMounted = true;
    this.initializeChat();
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  initializeChat = async () => {
    const { namespaceId } = this.props.navigation.state.params || {};
    await this.ensureStorage();
    const history = await this.readHistory(namespaceId);
    if (!this._isMounted) {
      return;
    }
    this.setState(
      {
        allMessages: history,
        messages: history.slice(-10),
      },
      () => this.ensureIntroMessage(),
    );
  };

  ensureStorage = async () => {
    try {
      const exists = await RNFS.exists(CHAT_DIR);
      if (!exists) {
        await RNFS.mkdir(CHAT_DIR);
      }
    } catch (error) {
      console.warn('Failed to prepare chat storage', error);
    }
  };

  getChatFilePath = namespaceId => `${CHAT_DIR}/${namespaceId || 'default'}.json`;

  readHistory = async namespaceId => {
    const path = this.getChatFilePath(namespaceId);
    try {
      const fileExists = await RNFS.exists(path);
      if (!fileExists) {
        await RNFS.writeFile(path, '[]', 'utf8');
        return [];
      }
      const content = await RNFS.readFile(path, 'utf8');
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch (error) {
      console.warn('Failed to read chat history', error);
    }
    return [];
  };

  persistMessages = async messages => {
    const { namespaceId } = this.props.navigation.state.params || {};
    const path = this.getChatFilePath(namespaceId);
    try {
      await RNFS.writeFile(path, JSON.stringify(messages), 'utf8');
    } catch (error) {
      console.warn('Failed to save chat history', error);
    }
  };

  buildMessage = (text, sender = 'user') => ({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    text,
    sender,
    timestamp: Date.now(),
  });

  appendMessage = message => {
    this.setState(
      prevState => {
        const allMessages = [...prevState.allMessages, message];
        return {
          allMessages,
          messages: allMessages.slice(-10),
        };
      },
      () => this.persistMessages(this.state.allMessages),
    );
  };

  ensureIntroMessage = () => {
    const lastMessage = this.state.allMessages[this.state.allMessages.length - 1];
    if (lastMessage && lastMessage.text === INTRO_MESSAGE && lastMessage.sender === 'agent') {
      return;
    }
    const intro = this.buildMessage(INTRO_MESSAGE, 'agent');
    this.appendMessage(intro);
  };

  handleSend = () => {
    const text = this.state.inputValue.trim();
    if (!text) {
      return;
    }
    const userMessage = this.buildMessage(text, 'user');
    this.appendMessage(userMessage);
    this.setState({ inputValue: '' });
    this.handleTriggers(text);
  };

  handleTriggers = text => {
    const normalized = text.trim().toUpperCase();
    if (normalized.includes('D-CARD')) {
      this.replyFromAgent('Reading D-CARD ok');
    }
  };

  replyFromAgent = text => {
    const reply = this.buildMessage(text, 'agent');
    this.appendMessage(reply);
  };

  renderMessage = ({ item }) => {
    const isUser = item.sender === 'user';
    return (
      <View style={[styles.messageRow, isUser ? styles.userRow : styles.agentRow]}>
        <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.agentBubble]}>
          <Text style={[styles.messageText, isUser ? styles.userText : styles.agentText]}>{item.text}</Text>
        </View>
      </View>
    );
  };

  render() {
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <View style={styles.chatContainer}>
            <FlatList
              ref={ref => {
                this.listRef = ref;
              }}
              data={this.state.messages}
              keyExtractor={item => item.id}
              renderItem={this.renderMessage}
              contentContainerStyle={this.state.messages.length === 0 ? styles.emptyContainer : styles.listContent}
              ListEmptyComponent={() => (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>Start a conversation with this agent.</Text>
                </View>
              )}
              onContentSizeChange={() => this.listRef && this.listRef.scrollToEnd({ animated: true })}
              onLayout={() => this.listRef && this.listRef.scrollToEnd({ animated: false })}
              keyboardShouldPersistTaps="handled"
            />
          </View>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={this.state.inputValue}
              placeholder="Type a message"
              placeholderTextColor="#6f7587"
              onChangeText={text => this.setState({ inputValue: text })}
              onSubmitEditing={this.handleSend}
              returnKeyType="send"
            />
            <TouchableOpacity style={styles.sendButton} onPress={this.handleSend}>
              <Text style={styles.sendButtonText}>Send</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }
}

export default AgentChat;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b1224',
  },
  headerTitleContainer: {
    flexDirection: 'column',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  headerSubtitle: {
    color: '#9ca4b3',
    fontSize: 12,
    marginTop: 2,
  },
  chatContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  listContent: {
    paddingBottom: 12,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  agentRow: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '78%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
  },
  userBubble: {
    backgroundColor: KevaColors.actionText,
    borderBottomRightRadius: 2,
  },
  agentBubble: {
    backgroundColor: '#11182d',
    borderBottomLeftRadius: 2,
    borderWidth: 1,
    borderColor: '#1f2a44',
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userText: {
    color: '#ffffff',
  },
  agentText: {
    color: '#d2d7e0',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyText: {
    color: '#6f7587',
    fontSize: 14,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1f2a44',
    backgroundColor: '#0b1224',
  },
  input: {
    flex: 1,
    height: 44,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#24304a',
    borderRadius: 12,
    color: '#ffffff',
    backgroundColor: '#0f162b',
  },
  sendButton: {
    marginLeft: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: KevaColors.actionText,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
