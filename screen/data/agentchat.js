import React from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  FlatList,
  SafeAreaView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Icon } from 'react-native-elements';
import RNFS from 'react-native-fs';
import { connect } from 'react-redux';
const StyleSheet = require('../../PlatformStyleSheet');
const KevaColors = require('../../common/KevaColors');
import { BlueNavigationStyle } from '../../BlueComponents';
import { buildHeadAssetUri } from '../../common/namespaceAvatar';
import { getInitials, stringToColor, timeConverter } from '../../util';

const CHAT_DIR = `${RNFS.DocumentDirectoryPath}/agent_chats`;
const INTRO_MESSAGES = [
  'Booting the Super Agent Network…',
  'Loading the on-device LLM… (not deployed yet)',
  'Local mode is on. Keep talking—tap the avatar to one-tap commit on-chain.',
];
const PAGE_SIZE = 10;

class AgentChat extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      allMessages: [],
      messages: [],
      visibleCount: PAGE_SIZE,
      inputValue: '',
    };
    this.loadingMore = false;
    this.didInitialScroll = false;
    this.shouldScrollToEnd = false;
  }

  static navigationOptions = ({ navigation }) => {
    const params = navigation.state?.params || {};
    const displayName = params.displayName || 'Agent';
    const shortCode = params.shortCode ? `@${params.shortCode}` : '';
    const title = shortCode ? `${displayName}${shortCode}` : displayName;

    return {
      ...BlueNavigationStyle(),
      title: '',
      headerStyle: {
        backgroundColor: '#ffffff',
        borderBottomColor: '#e3e5ea',
      },
      headerTintColor: '#000000',
      headerTitle: () => (
        <TouchableOpacity
          accessibilityLabel="Open space"
          onPress={() => navigation.state?.params?.onTitlePress?.()}
          style={styles.headerTitleButton}
        >
          <Text style={styles.headerTitle}>{title}</Text>
        </TouchableOpacity>
      ),
      headerRight: () => (
        <TouchableOpacity
          accessibilityLabel="Open chat settings"
          style={styles.headerAction}
          onPress={() => navigation.state?.params?.onOpenSettings?.()}
        >
          <Icon name="more-horizontal" type="feather" color="#000000" size={20} />
        </TouchableOpacity>
      ),
    };
  };

  componentDidMount() {
    this._isMounted = true;
    this.props.navigation?.setParams?.({ onTitlePress: this.handleTitlePress });
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
    const visibleCount = Math.min(history.length || PAGE_SIZE, PAGE_SIZE);
    this.setState(
      {
        allMessages: history,
        visibleCount,
        messages: history.slice(-visibleCount),
      },
      () => {
        this.ensureIntroMessage();
        this.scrollToEnd(false);
      },
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
    this.shouldScrollToEnd = true;
    this.setState(
      prevState => {
        const allMessages = [...prevState.allMessages, message];
        const visibleCount = Math.max(prevState.visibleCount, Math.min(PAGE_SIZE, allMessages.length));
        return {
          allMessages,
          visibleCount,
          messages: allMessages.slice(-visibleCount),
        };
      },
      () => this.persistMessages(this.state.allMessages),
    );
  };

  appendMessages = messages => {
    this.shouldScrollToEnd = true;
    this.setState(
      prevState => {
        const allMessages = [...prevState.allMessages, ...messages];
        const visibleCount = Math.max(prevState.visibleCount, Math.min(PAGE_SIZE, allMessages.length));
        return {
          allMessages,
          visibleCount,
          messages: allMessages.slice(-visibleCount),
        };
      },
      () => this.persistMessages(this.state.allMessages),
    );
  };

  ensureIntroMessage = () => {
    const { allMessages } = this.state;
    const lastIndex = allMessages.length - INTRO_MESSAGES.length;
    const hasIntroSequence =
      lastIndex >= 0 &&
      INTRO_MESSAGES.every((text, idx) => {
        const message = allMessages[lastIndex + idx];
        return message?.text === text && message?.sender === 'agent';
      });

    if (hasIntroSequence) {
      return;
    }

    const introMessages = INTRO_MESSAGES.map(text => this.buildMessage(text, 'agent'));
    this.appendMessages(introMessages);
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

  formatSubmitTitle = () => {
    return timeConverter(Math.floor(Date.now() / 1000));
  };

  handleAvatarPress = messageText => {
    const { navigation } = this.props;
    const { namespaceId, walletId } = navigation.state.params || {};
    if (!navigation || typeof navigation.navigate !== 'function') {
      return;
    }
    navigation.navigate('AddKeyValue', {
      namespaceId,
      walletId,
      key: this.formatSubmitTitle(),
      value: messageText,
    });
  };

  handleTitlePress = () => {
    const { navigation, namespaceList } = this.props;
    if (!navigation || typeof navigation.navigate !== 'function') {
      return;
    }
    const { namespaceId, displayName, shortCode, walletId } = navigation.state.params || {};
    const namespace = namespaceId ? namespaceList?.namespaces?.[namespaceId] : null;
    navigation.navigate('KeyValues', {
      namespaceId: namespace?.id || namespaceId,
      shortCode: namespace?.shortCode || shortCode,
      displayName: namespace?.displayName || displayName,
      txid: namespace?.txId,
      rootAddress: namespace?.rootAddress,
      walletId: namespace?.walletId || walletId,
      price: namespace?.price,
      desc: namespace?.desc,
      addr: namespace?.addr,
      profile: namespace?.profile,
    });
  };

  loadMoreHistory = () => {
    if (this.loadingMore) {
      return;
    }
    const { allMessages, visibleCount } = this.state;
    if (visibleCount >= allMessages.length) {
      return;
    }
    this.loadingMore = true;
    this.setState(
      prevState => {
        const nextCount = Math.min(prevState.allMessages.length, prevState.visibleCount + PAGE_SIZE);
        return {
          visibleCount: nextCount,
          messages: prevState.allMessages.slice(-nextCount),
        };
      },
      () => {
        this.loadingMore = false;
      },
    );
  };

  handleScroll = event => {
    const { contentOffset } = event.nativeEvent;
    if (contentOffset?.y <= 20) {
      this.loadMoreHistory();
    }
  };

  scrollToEnd = animated => {
    if (this.listRef) {
      this.listRef.scrollToEnd({ animated });
    }
  };

  handleContentSizeChange = () => {
    if (this.shouldScrollToEnd) {
      this.scrollToEnd(true);
      this.shouldScrollToEnd = false;
    }
  };

  shouldShowTimestamp = index => {
    const { messages } = this.state;
    const current = messages[index];
    if (!current) {
      return false;
    }
    if (index === 0) {
      return true;
    }
    const prev = messages[index - 1];
    return current.timestamp - prev.timestamp > 30 * 60 * 1000;
  };

  formatTimestamp = timestamp => {
    const date = new Date(timestamp);
    const now = new Date();

    const pad = num => (num < 10 ? `0${num}` : `${num}`);
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;

    const isSameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    const yesterday = new Date();
    yesterday.setDate(now.getDate() - 1);
    const isYesterday =
      date.getFullYear() === yesterday.getFullYear() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getDate() === yesterday.getDate();

    if (isSameDay) {
      return time;
    }
    if (isYesterday) {
      return `Yesterday ${time}`;
    }
    return `${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${time}`;
  };

  getUserAvatar = () => {
    const { namespaceList } = this.props;
    const firstId = namespaceList?.order?.[0];
    const namespace = firstId ? namespaceList?.namespaces?.[firstId] : null;
    if (!namespace) {
      return null;
    }
    const avatarUri = buildHeadAssetUri(namespace.shortCode);
    if (avatarUri) {
      return { type: 'image', uri: avatarUri };
    }
    const displayName = namespace.displayName || ' ';
    return {
      type: 'fallback',
      initials: getInitials(displayName),
      color: stringToColor(displayName),
    };
  };

  renderAvatar = sender => {
    const isUser = sender === 'user';
    if (isUser) {
      const userAvatar = this.getUserAvatar();
      if (userAvatar?.type === 'image') {
        return (
          <View style={[styles.avatarWrapper, styles.userAvatarWrapper]}>
            <Image source={{ uri: userAvatar.uri }} style={styles.avatarImage} resizeMode="cover" />
          </View>
        );
      }
      if (userAvatar?.type === 'fallback') {
        return (
          <View
            style={[
              styles.avatarWrapper,
              styles.userAvatarWrapper,
              styles.userAvatarFallback,
              { backgroundColor: userAvatar.color },
            ]}
          >
            <Text style={styles.userAvatarText}>{userAvatar.initials}</Text>
          </View>
        );
      }
      return (
        <View style={[styles.avatarWrapper, styles.userAvatarWrapper, styles.userAvatarBlank]} />
      );
    }

    const { shortCode } = this.props.navigation.state.params || {};
    const avatarUri = buildHeadAssetUri(shortCode);
    const source = avatarUri ? { uri: avatarUri } : require('../../img/bluebeast.png');
    return (
      <View style={[styles.avatarWrapper, styles.agentAvatarWrapper]}>
        <Image source={source} style={styles.avatarImage} resizeMode="cover" />
      </View>
    );
  };

  renderMessage = ({ item, index }) => {
    const isUser = item.sender === 'user';
    return (
      <>
        {this.shouldShowTimestamp(index) && (
          <View style={styles.timestampContainer}>
            <Text style={styles.timestampText}>{this.formatTimestamp(item.timestamp)}</Text>
          </View>
        )}
        <View style={[styles.messageRow, isUser ? styles.userRow : styles.agentRow]}>
          {!isUser && (
            <TouchableOpacity
              accessibilityLabel="Open submit form"
              activeOpacity={0.7}
              onPress={() => this.handleAvatarPress(item.text)}
              style={styles.avatarPressable}
            >
              {this.renderAvatar('agent')}
            </TouchableOpacity>
          )}
          <View style={[styles.bubbleColumn, isUser ? styles.userBubbleColumn : styles.agentBubbleColumn]}>
            <View style={[styles.messageBubble, isUser ? styles.userBubble : styles.agentBubble]}>
              <Text style={[styles.messageText, isUser ? styles.userText : styles.agentText]}>{item.text}</Text>
            </View>
          </View>
          {isUser && (
            <TouchableOpacity
              accessibilityLabel="Open submit form"
              activeOpacity={0.7}
              onPress={() => this.handleAvatarPress(item.text)}
              style={styles.avatarPressable}
            >
              {this.renderAvatar('user')}
            </TouchableOpacity>
          )}
        </View>
      </>
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
              maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
              onContentSizeChange={this.handleContentSizeChange}
              onLayout={() => {
                if (!this.didInitialScroll) {
                  this.scrollToEnd(false);
                  this.didInitialScroll = true;
                }
              }}
              onScroll={this.handleScroll}
              scrollEventThrottle={16}
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

const mapStateToProps = state => ({
  namespaceList: state.namespaceList,
});

export default connect(mapStateToProps)(AgentChat);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0d15',
  },
  headerTitle: {
    color: '#000000',
    fontSize: 18,
    fontWeight: '700',
  },
  headerTitleButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  headerAction: {
    paddingHorizontal: 16,
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
    alignItems: 'flex-end',
  },
  userRow: {
    justifyContent: 'flex-end',
  },
  agentRow: {
    justifyContent: 'flex-start',
  },
  bubbleColumn: {
    maxWidth: '76%',
  },
  userBubbleColumn: {
    marginRight: 12,
  },
  agentBubbleColumn: {
    marginLeft: 12,
  },
  messageBubble: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
  },
  userBubble: {
    backgroundColor: '#1fcd51',
    borderBottomRightRadius: 2,
  },
  agentBubble: {
    backgroundColor: '#101726',
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
  timestampContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  timestampText: {
    color: '#6f7587',
    fontSize: 13,
  },
  avatarWrapper: {
    width: 38,
    height: 38,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#1a2336',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarPressable: {
    borderRadius: 12,
  },
  agentAvatarWrapper: {
    borderWidth: 1,
    borderColor: '#24304a',
  },
  userAvatarWrapper: {
    borderWidth: 1,
    borderColor: '#1fcd51',
  },
  userAvatarBlank: {
    backgroundColor: '#000000',
  },
  userAvatarFallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  userAvatarText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
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
