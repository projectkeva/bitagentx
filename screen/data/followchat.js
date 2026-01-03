import React from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  FlatList,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  Clipboard,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
} from 'react-native';
import { Icon } from 'react-native-elements';
import RNFS from 'react-native-fs';
import { connect } from 'react-redux';
import { encode as b64encode, decode as b64decode } from 'base-64';
const StyleSheet = require('../../PlatformStyleSheet');
const KevaColors = require('../../common/KevaColors');
import { BlueNavigationStyle } from '../../BlueComponents';
import { buildHeadAssetUri } from '../../common/namespaceAvatar';
import { getInitials, showStatus, stringToColor, timeConverter, toastError } from '../../util';
import { FALLBACK_DATA_PER_BYTE_FEE } from '../../models/networkTransactionFees';
import { decodeBase64, getHashtagScriptHash, getNamespaceScriptHash, replyKeyValue, toScriptHash } from '../../class/keva-ops';
import ActionSheet from '../ActionSheet';
import {
  CHAT_DIR,
  buildConversationId,
  ensureChatStorage,
  findLatestConversationForPeer,
  listConversationMetadataForPeer,
  setConversationMetadata,
} from './followChatStorage';

let BlueApp = require('../../BlueApp');
let BlueElectrum = require('../../BlueElectrum');
const PAGE_SIZE = 10;
const TAG_DM_PREFIX = '#DM';
const TAG_CHAT_PREFIX = '#CHAT';
const TAG_GLOBAL_CHAT = '#chatxkeva';

class FollowChat extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      allMessages: [],
      messages: [],
      visibleCount: PAGE_SIZE,
      inputValue: '',
      myNamespaceId: null,
      peerNamespaceId: null,
      myAnchorTxid: null,
      peerAnchorTxid: null,
      syncing: false,
      lastSyncAt: 0,
      peerShortCode: null,
      chatOldestCursor: -1,
      loadingOlder: false,
      replyFromNamespaceId: null,
      pendingReplyFromNamespaceId: null,
      availableBoundNamespaceIds: [],
      mode: 'mutual',
      isNamespaceModalVisible: false,
      hasMoreOlder: true,
    };
    this.loadingMore = false;
    this.didInitialScroll = false;
    this.shouldScrollToEnd = false;
    this.conversationId = null;
    this.welcomeCheckedFor = null;
  }

  static navigationOptions = ({ navigation }) => {
    const params = navigation.state?.params || {};
    const displayName = params.peerDisplayName || params.displayName || 'Agent';
    const shortCode = params.peerShortCode ? `@${params.peerShortCode}` : '';
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
    this.syncTimer = setInterval(() => this.syncFromChain(), 8000);
  }

  componentWillUnmount() {
    this._isMounted = false;
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
    }
  }

  initializeChat = async () => {
    const params = this.props.navigation.state.params || {};
    const peerNamespaceId = params.peerNamespaceId || null;
    const peerShortCode = params.peerShortCode || params.shortCode || null;
    const mode = params.mode === 'send_only' ? 'send_only' : 'mutual';
    await ensureChatStorage();
    const boundEntries = peerNamespaceId ? await listConversationMetadataForPeer(peerNamespaceId) : [];
    let boundNamespaceIds = boundEntries
      .map(entry => entry.replyFromNamespaceId)
      .filter(Boolean);
    let replyFromNamespaceId =
      params.replyFromNamespaceId || (boundNamespaceIds.length === 1 ? boundNamespaceIds[0] : null);
    if (!replyFromNamespaceId && peerNamespaceId) {
      const recent = await findLatestConversationForPeer(peerNamespaceId);
      if (recent?.myNamespaceId) {
        replyFromNamespaceId = recent.myNamespaceId;
        if (!boundNamespaceIds.includes(recent.myNamespaceId)) {
          boundNamespaceIds = [recent.myNamespaceId, ...boundNamespaceIds];
        }
      }
    }
    const conversationId = replyFromNamespaceId ? buildConversationId(replyFromNamespaceId, peerNamespaceId) : null;
    const history = conversationId ? await this.readHistory(conversationId) : [];
    if (!this._isMounted) {
      return;
    }
    const filteredHistory = this.filterMessagesForMode(history, mode);
    const visibleCount = Math.min(filteredHistory.length || PAGE_SIZE, PAGE_SIZE);
    let myAnchorTxid = null;
    let peerAnchorTxid = params.peerAnchorTxid || null;
    if (replyFromNamespaceId) {
      myAnchorTxid = await this.resolveAnchorTxid(replyFromNamespaceId);
    }
    if (!peerAnchorTxid && peerNamespaceId) {
      peerAnchorTxid = await this.resolveAnchorTxid(peerNamespaceId);
    }
    this.conversationId = conversationId;
    this.setState(
      {
        allMessages: history,
        visibleCount,
        messages: filteredHistory.slice(-visibleCount),
        myNamespaceId: replyFromNamespaceId,
        peerNamespaceId,
        myAnchorTxid,
        peerAnchorTxid,
        replyFromNamespaceId,
        pendingReplyFromNamespaceId: null,
        availableBoundNamespaceIds: boundNamespaceIds,
        mode,
        peerShortCode,
        chatOldestCursor: -1,
      },
      () => {
        this.scrollToEnd(false);
        this.syncFromChain({ reset: true });
        this.maybeSendWelcomeMessage();
        if (!this.state.replyFromNamespaceId) {
          this.autoPickNamespaceForRead();
        }
      },
    );
  };

  decodeKeyValueEntry = kv => {
    if (!kv) {
      return kv;
    }
    let key = kv.key;
    let value = kv.value;

    try {
      key = kv.key ? decodeBase64(kv.key) : kv.key;
    } catch (error) {
      key = kv.key;
    }

    if (value) {
      try {
        value = b64decode(value);
      } catch (error) {
        value = kv.value;
      }
    }

    return { ...kv, key, value };
  };

  getChatFilePath = conversationId => `${CHAT_DIR}/${conversationId || 'default'}.json`;

  readHistory = async conversationId => {
    const path = this.getChatFilePath(conversationId);
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
    const path = this.getChatFilePath(this.conversationId);
    try {
      await RNFS.writeFile(path, JSON.stringify(messages), 'utf8');
    } catch (error) {
      console.warn('Failed to save chat history', error);
    }
  };

  buildMessage = (text, sender = 'user', options = {}) => {
    const idSource = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
      id: options.id || b64encode(idSource),
      text,
      sender,
      timestamp: options.timestamp || Date.now(),
      txid: options.txid || null,
      pending: Boolean(options.pending),
      failed: Boolean(options.failed),
      direction: options.direction || (sender === 'user' ? 'out' : 'in'),
    };
  };

  appendMessage = message => {
    this.shouldScrollToEnd = true;
    this.setState(
      prevState => {
        const allMessages = [...prevState.allMessages, message];
        const filteredMessages = this.filterMessagesForMode(allMessages);
        const visibleCount = Math.max(prevState.visibleCount, Math.min(PAGE_SIZE, filteredMessages.length));
        return {
          allMessages,
          visibleCount,
          messages: filteredMessages.slice(-visibleCount),
        };
      },
      () => this.persistMessages(this.state.allMessages),
    );
  };

  markMessageFailed = messageId => {
    this.setState(
      prevState => {
        const allMessages = prevState.allMessages.map(message =>
          message.id === messageId ? { ...message, failed: true, pending: false } : message,
        );
        const filteredMessages = this.filterMessagesForMode(allMessages);
        return {
          allMessages,
          messages: filteredMessages.slice(-Math.min(prevState.visibleCount, filteredMessages.length || prevState.visibleCount)),
        };
      },
      () => this.persistMessages(this.state.allMessages),
    );
  };

  setActiveNamespace = async (namespaceId, { setBound = false } = {}) => {
    const { peerNamespaceId } = this.state;
    if (!namespaceId || !peerNamespaceId) {
      return;
    }
    const conversationId = buildConversationId(namespaceId, peerNamespaceId);
    const history = await this.readHistory(conversationId);
    const filteredHistory = this.filterMessagesForMode(history);
    const visibleCount = Math.min(filteredHistory.length || PAGE_SIZE, PAGE_SIZE);
    const myAnchorTxid = await this.resolveAnchorTxid(namespaceId);
    this.conversationId = conversationId;
    this.setState(
      {
        allMessages: history,
        visibleCount,
        messages: filteredHistory.slice(-visibleCount),
        myNamespaceId: namespaceId,
        myAnchorTxid,
        chatOldestCursor: -1,
        replyFromNamespaceId: setBound ? namespaceId : this.state.replyFromNamespaceId,
      },
      () => {
        this.scrollToEnd(false);
        this.syncFromChain({ reset: true });
        this.maybeSendWelcomeMessage();
      },
    );
  };

  handleSelectNamespace = async namespaceId => {
    if (!namespaceId) {
      return;
    }
    this.closeNamespaceModal();
    const { availableBoundNamespaceIds } = this.state;
    const isBound = availableBoundNamespaceIds.includes(namespaceId);
    if (isBound) {
      this.setState(
        {
          replyFromNamespaceId: namespaceId,
          pendingReplyFromNamespaceId: null,
        },
        () => this.setActiveNamespace(namespaceId, { setBound: true }),
      );
      return;
    }
    this.setState(
      {
        pendingReplyFromNamespaceId: namespaceId,
        replyFromNamespaceId: null,
      },
      () => this.setActiveNamespace(namespaceId),
    );
  };

  resetPendingSelection = () => {
    this.conversationId = null;
    this.setState({
      pendingReplyFromNamespaceId: null,
      myNamespaceId: null,
      myAnchorTxid: null,
      allMessages: [],
      messages: [],
      visibleCount: PAGE_SIZE,
      chatOldestCursor: -1,
    });
  };

  hasMessageWithText = text => {
    const normalized = (text || '').trim();
    if (!normalized) {
      return true;
    }
    return this.state.allMessages.some(message => (message?.text || '').trim() === normalized);
  };

  fetchPeerWelcomeValue = async peerNamespaceId => {
    if (!peerNamespaceId) {
      return null;
    }

    const { namespaceList, otherNamespaceList } = this.props;
    const peerNamespace =
      namespaceList?.namespaces?.[peerNamespaceId] || otherNamespaceList?.namespaces?.[peerNamespaceId] || {};
    const scriptHash = peerNamespace.rootAddress
      ? toScriptHash(peerNamespace.rootAddress)
      : getNamespaceScriptHash(peerNamespaceId);

    try {
      await BlueElectrum.ping();
      const response = await this.withTimeout(
        BlueElectrum.blockchainKeva_getKeyValues(scriptHash, -1),
        8000,
      );
      const keyvalues = Array.isArray(response) ? response : response?.keyvalues || [];
      if (!keyvalues.length) {
        return null;
      }

      const welcomeEntry = keyvalues
        .map(this.decodeKeyValueEntry)
        .reverse()
        .find(entry => entry?.key === 'welcome' && entry.value);

      if (!welcomeEntry) {
        return null;
      }

      const parsedValue = this.parseEnvelope(welcomeEntry.value);
      const welcomeText = typeof parsedValue === 'string'
        ? parsedValue.trim()
        : String(parsedValue || '').trim();

      return welcomeText || null;
    } catch (error) {
      console.warn('FollowChat: failed to load welcome message', error);
      return null;
    }
  };

  maybeSendWelcomeMessage = async () => {
    const { peerNamespaceId } = this.state;
    const conversationId = this.conversationId;

    if (!peerNamespaceId || !conversationId || this.welcomeCheckedFor === conversationId) {
      return;
    }

    const welcomeText = await this.fetchPeerWelcomeValue(peerNamespaceId);

    if (!welcomeText || this.hasMessageWithText(welcomeText)) {
      this.welcomeCheckedFor = conversationId;
      return;
    }

    this.appendMessage(this.buildMessage(welcomeText, 'peer', { direction: 'in' }));
    this.welcomeCheckedFor = conversationId;
  };

  openNamespaceModal = () => {
    this.setState({ isNamespaceModalVisible: true });
  };

  closeNamespaceModal = () => {
    this.setState({ isNamespaceModalVisible: false });
  };

  handleSend = async () => {
    const text = this.state.inputValue.trim();
    const activeNamespaceId = this.getActiveNamespaceId();
    const canSend = this.canSendMessage();
    if (!activeNamespaceId) {
      toastError('Select a space to reply');
      return;
    }
    if (!text || !canSend) {
      return;
    }
    const userMessage = this.buildMessage(text, 'user', { pending: true, direction: 'out' });
    this.appendMessage(userMessage);
    this.setState({ inputValue: '' });
    try {
      await this.sendOnChain(text);
      const { peerNamespaceId } = this.state;
      const fromNamespaceId = activeNamespaceId;
      if (peerNamespaceId && fromNamespaceId) {
        const conversationId = buildConversationId(fromNamespaceId, peerNamespaceId);
        await setConversationMetadata(conversationId, {
          peerNamespaceId,
          replyFromNamespaceId: fromNamespaceId,
          isMutual: true,
          boundAt: Date.now(),
        });
        this.setState(prevState => ({
          replyFromNamespaceId: fromNamespaceId,
          pendingReplyFromNamespaceId: null,
          availableBoundNamespaceIds: Array.from(
            new Set([...(prevState.availableBoundNamespaceIds || []), fromNamespaceId]),
          ),
        }));
      }
      await this.syncFromChain();
    } catch (error) {
      console.warn('Failed to send follow chat message', error);
      this.markMessageFailed(userMessage.id);
      toastError(error?.message || 'Failed to send message');
    }
  };

  formatSubmitTitle = () => {
    return timeConverter(Math.floor(Date.now() / 1000));
  };

  handleMessagePress = messageText => {
    if (messageText) {
      Clipboard.setString(messageText);
    }
  };

  handleMessageLongPress = messageText => {
    if (!messageText) {
      return;
    }
    Clipboard.setString(messageText);
    showStatus('Copied to clipboard', 2000);
    if (Platform.OS === 'ios') {
      ActionSheet.showActionSheetWithOptions(
        {
          options: ['Copy', 'Submit to my namespace', 'Cancel'],
          cancelButtonIndex: 2,
        },
        buttonIndex => {
          if (buttonIndex === 0) {
            Clipboard.setString(messageText);
          }
          if (buttonIndex === 1) {
            this.submitToNamespace(messageText);
          }
        },
      );
    } else {
      ActionSheet.showActionSheetWithOptions({
        title: '',
        message: '',
        buttons: [
          {
            text: 'Cancel',
            onPress: () => {},
            style: 'cancel',
          },
          {
            text: 'Copy',
            onPress: () => Clipboard.setString(messageText),
          },
          {
            text: 'Submit to my namespace',
            onPress: () => this.submitToNamespace(messageText),
          },
        ],
      });
    }
  };

  submitToNamespace = messageText => {
    const { navigation } = this.props;
    const myNamespaceId = this.getActiveNamespaceId();
    const walletId = this.getWalletId();
    if (!navigation || typeof navigation.navigate !== 'function') {
      return;
    }
    if (!myNamespaceId || !walletId) {
      return;
    }
    navigation.navigate('AddKeyValue', {
      namespaceId: myNamespaceId,
      walletId,
      key: this.formatSubmitTitle(),
      value: messageText,
    });
  };

  handleTitlePress = () => {
    const { navigation, namespaceList, otherNamespaceList } = this.props;
    if (!navigation || typeof navigation.navigate !== 'function') {
      return;
    }
    const { peerDisplayName, peerShortCode: paramShortCode, walletId: paramWalletId } = navigation.state.params || {};
    const peerNamespaceId = (navigation.state.params || {}).peerNamespaceId || this.state.peerNamespaceId;
    const peerShortCode = paramShortCode || this.state.peerShortCode;
    const otherNamespace = peerNamespaceId ? otherNamespaceList?.namespaces?.[peerNamespaceId] : null;
    const namespace = otherNamespace || (peerNamespaceId ? namespaceList?.namespaces?.[peerNamespaceId] : null);
    navigation.navigate('KeyValues', {
      namespaceId: namespace?.id || peerNamespaceId,
      shortCode: namespace?.shortCode || peerShortCode,
      displayName: namespace?.displayName || peerDisplayName,
      txid: namespace?.txId,
      rootAddress: namespace?.rootAddress,
      walletId: namespace?.walletId || paramWalletId,
      price: namespace?.price,
      desc: namespace?.desc,
      addr: namespace?.addr,
      profile: namespace?.profile,
      isOther: true,
    });
  };

  handleUserAvatarPress = () => {
    const { navigation, namespaceList } = this.props;
    if (!navigation || typeof navigation.navigate !== 'function') {
      return;
    }
    const myNamespaceId = this.getActiveNamespaceId();
    if (!myNamespaceId) {
      return;
    }
    const namespace = namespaceList?.namespaces?.[myNamespaceId];
    if (!namespace) {
      return;
    }
    navigation.navigate('KeyValues', {
      namespaceId: namespace.id,
      shortCode: namespace.shortCode,
      displayName: namespace.displayName,
      txid: namespace.txId,
      rootAddress: namespace.rootAddress,
      walletId: namespace.walletId,
      price: namespace.price,
      desc: namespace.desc,
      addr: namespace.addr,
      profile: namespace.profile,
    });
  };

  loadMoreHistory = () => {
    if (this.loadingMore) {
      return;
    }
    const { allMessages, visibleCount } = this.state;
    const filteredMessages = this.filterMessagesForMode(allMessages);
    if (visibleCount >= filteredMessages.length) {
      return;
    }
    this.loadingMore = true;
    this.setState(
      prevState => {
        const nextCount = Math.min(filteredMessages.length, prevState.visibleCount + PAGE_SIZE);
        return {
          visibleCount: nextCount,
          messages: filteredMessages.slice(-nextCount),
        };
      },
      () => {
        this.loadingMore = false;
      },
    );
  };

  handleScroll = event => {
    const y = event.nativeEvent?.contentOffset?.y ?? 0;
    if (y <= 20) {
      const filtered = this.filterMessagesForMode(this.state.allMessages);
      if (this.state.visibleCount < filtered.length) {
        this.loadMoreHistory();
      } else {
        this.loadOlderFromChain();
      }
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
    const firstId = this.getActiveNamespaceId();
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

    const { peerShortCode } = this.props.navigation.state.params || {};
    const avatarUri = buildHeadAssetUri(peerShortCode);
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
              accessibilityLabel="Open peer profile"
              activeOpacity={0.7}
              onPress={this.handleTitlePress}
              style={styles.avatarPressable}
            >
              {this.renderAvatar('peer')}
            </TouchableOpacity>
          )}
          <View style={[styles.bubbleColumn, isUser ? styles.userBubbleColumn : styles.agentBubbleColumn]}>
            <TouchableOpacity
              accessibilityLabel="Chat message"
              activeOpacity={0.7}
              onPress={() => this.handleMessagePress(item.text)}
              onLongPress={() => this.handleMessageLongPress(item.text)}
              style={[styles.messageBubble, isUser ? styles.userBubble : styles.agentBubble]}
            >
              <Text style={[styles.messageText, isUser ? styles.userText : styles.agentText]}>{item.text}</Text>
            </TouchableOpacity>
          </View>
          {isUser && (
            <TouchableOpacity
              accessibilityLabel="Open my profile"
              activeOpacity={0.7}
              onPress={this.handleUserAvatarPress}
              style={styles.avatarPressable}
            >
              {this.renderAvatar('user')}
            </TouchableOpacity>
          )}
        </View>
      </>
    );
  };

  getWalletId = () => {
    const params = this.props.navigation.state.params || {};
    if (params.walletId) {
      return params.walletId;
    }
    const { namespaceList } = this.props;
    const myNamespaceId = this.getActiveNamespaceId();
    const namespace = myNamespaceId ? namespaceList?.namespaces?.[myNamespaceId] : null;
    return namespace?.walletId || null;
  };

  getActiveNamespaceId = () => {
    const { replyFromNamespaceId, pendingReplyFromNamespaceId } = this.state;
    return replyFromNamespaceId || pendingReplyFromNamespaceId || null;
  };

  canSendMessage = () => {
    return Boolean(this.getActiveNamespaceId() && this.state.peerNamespaceId && this.state.peerAnchorTxid && this.state.myAnchorTxid);
  };

  filterMessagesForMode = (messages, modeOverride) => {
    return messages;
  };

  buildTaggedMessage = (text, myShort, peerShort) => {
    const min = Math.min(Number(myShort), Number(peerShort));
    const max = Math.max(Number(myShort), Number(peerShort));
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new Error('short code invalid');
    }
    return `${text}\n${TAG_DM_PREFIX}${peerShort}\n${TAG_CHAT_PREFIX}${min}_${max}\n${TAG_GLOBAL_CHAT}`;
  };

  parseEnvelope = value => {
    if (!value) {
      return '';
    }
    if (typeof value !== 'string') {
      return String(value);
    }
    try {
      const parsed = JSON.parse(value);
      return parsed.text || parsed.cipher || value;
    } catch (error) {
      return value;
    }
  };

  resolveAnchorTxid = async namespaceId => {
    if (!namespaceId) {
      return null;
    }
    const { namespaceList } = this.props;
    const namespace = namespaceList?.namespaces?.[namespaceId];
    const scriptHash = namespace?.rootAddress ? toScriptHash(namespace.rootAddress) : getNamespaceScriptHash(namespaceId);
    try {
      await BlueElectrum.ping();
      const history = await BlueElectrum.blockchainKeva_getKeyValues(scriptHash, -1);
      const keyvalues = Array.isArray(history) ? history : history?.keyvalues || [];
      if (!keyvalues.length) {
        return null;
      }
      const reg = keyvalues.find(entry => entry.type === 'REG');
      if (reg?.tx_hash || reg?.txid) {
        return reg.tx_hash || reg.txid;
      }
      const last = keyvalues[keyvalues.length - 1];
      return last?.tx_hash || last?.txid || null;
    } catch (error) {
      console.warn('Failed to resolve anchor txid', error);
      return null;
    }
  };

  stripChatTags = text => {
    if (!text || typeof text !== 'string') {
      return '';
    }
    return text
      .split('\n')
      .filter(line => {
        const trimmed = line.trim();
        return !(trimmed.startsWith(TAG_DM_PREFIX) || trimmed.startsWith(TAG_CHAT_PREFIX) || trimmed.toLowerCase() === TAG_GLOBAL_CHAT);
      })
      .join('\n')
      .trim();
  };

  normalizeHashtagValue = item => {
    const rawValue = item?.value;
    if (!rawValue) {
      return '';
    }
    if (typeof rawValue !== 'string') {
      return this.stripChatTags(this.parseEnvelope(rawValue));
    }
    try {
      const decoded = b64decode(rawValue);
      return this.stripChatTags(this.parseEnvelope(decoded));
    } catch (error) {
      return this.stripChatTags(this.parseEnvelope(rawValue));
    }
  };


  getHashtagRawText = item => {
    const rawValue = item?.value;
    if (!rawValue) {
      return '';
    }
    if (typeof rawValue !== 'string') {
      return String(rawValue);
    }
    try {
      return b64decode(rawValue);
    } catch (error) {
      return rawValue;
    }
  };

  hasDmTag = (raw, shortCode) => {
    if (!raw || !shortCode) {
      return false;
    }
    const needle = `${TAG_DM_PREFIX}${shortCode}`;
    return String(raw)
      .split('\n')
      .some(line => line.trim() === needle);
  };

  inferSenderByDmTag = (raw, myShort, peerShort) => {
    const toPeer = this.hasDmTag(raw, peerShort);
    const toMe = this.hasDmTag(raw, myShort);

    if (toPeer && !toMe) {
      return 'user';
    }
    if (toMe && !toPeer) {
      return 'peer';
    }
    if (toPeer) {
      return 'user';
    }
    return 'peer';
  };


  isFromNamespace = (item, namespaceId, shortCode) => {
    if (!item) {
      return false;
    }
    const itemNamespaceId = item.namespace != null ? String(item.namespace) : null;
    const itemShortCode = item.shortCode != null ? String(item.shortCode) : null;
    const normalizedNamespaceId = namespaceId != null ? String(namespaceId) : null;
    const normalizedShortCode = shortCode != null ? String(shortCode) : null;
    return (
      (normalizedNamespaceId && itemNamespaceId === normalizedNamespaceId) ||
      (normalizedShortCode && itemShortCode === normalizedShortCode)
    );
  };

  getNamespaceShortCode = (namespaceId, fallback) => {
    if (!namespaceId) {
      return fallback || null;
    }
    const { namespaceList } = this.props;
    const namespace = namespaceList?.namespaces?.[namespaceId];
    return namespace?.shortCode || fallback || null;
  };

  withTimeout = (promise, ms = 8000) => {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
};

// guest 状态：未绑定 reply space 时，自动从“我的空间”里挑一个能读到对方消息的
autoPickNamespaceForRead = async () => {
  const { namespaceList } = this.props;
  const peerNamespaceId = this.state.peerNamespaceId || this.props.navigation.state?.params?.peerNamespaceId;
  const peerShortCode = this.state.peerShortCode || this.props.navigation.state?.params?.peerShortCode;

  if (!peerNamespaceId || !peerShortCode) return;

  const candidates = (namespaceList?.order || [])
    .map(id => ({ id, shortCode: namespaceList?.namespaces?.[id]?.shortCode }))
    .filter(x => x.shortCode && /^\d+$/.test(String(x.shortCode)))
    .slice(0, 12);

  if (!candidates.length) return;

  try {
    await BlueElectrum.ping();
    await this.withTimeout(BlueElectrum.waitTillConnected(), 8000);
  } catch (e) {
    return;
  }

  for (const c of candidates) {
    const tag = this.getChatTag(c.shortCode, peerShortCode);
    if (!tag) continue;

    try {
      const resp = await this.withTimeout(
        BlueElectrum.blockchainKeva_getHashtag(getHashtagScriptHash(tag), -1),
        8000,
      );
      const items = Array.isArray(resp) ? resp : resp?.hashtags || [];

      // 判断是否存在“发给候选 shortCode”的消息（即对方发给我）
      const hasPeer = items.some(it => {
        const raw = this.parseEnvelope(this.getHashtagRawText(it));
        return this.hasDmTag(raw, c.shortCode);
      });

      if (hasPeer) {
        const myAnchorTxid = await this.resolveAnchorTxid(c.id);
        if (!this._isMounted) return;

        this.setState(
          {
            pendingReplyFromNamespaceId: c.id,
            myNamespaceId: c.id,
            myAnchorTxid,
            chatOldestCursor: -1,
            hasMoreOlder: true,
          },
          () => this.syncFromChain({ reset: true }),
        );
        return;
      }
    } catch (e) {
      // ignore and try next candidate
    }
  }

  const fallback = candidates[0];
  const myAnchorTxid = await this.resolveAnchorTxid(fallback.id);
  if (!this._isMounted) return;

  this.setState(
    {
      pendingReplyFromNamespaceId: fallback.id,
      myNamespaceId: fallback.id,
      myAnchorTxid,
      chatOldestCursor: -1,
      hasMoreOlder: true,
    },
    () => this.syncFromChain({ reset: true }),
  );
};


  getChatTag = (myShort, peerShort) => {
    if (!myShort || !peerShort) {
      return null;
    }
    const min = Math.min(Number(myShort), Number(peerShort));
    const max = Math.max(Number(myShort), Number(peerShort));
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return null;
    }
    return `${TAG_CHAT_PREFIX}${min}_${max}`;
  };
  syncFromChain = async ({ reset = false } = {}) => {
    if (this.state.syncing) return;

    const activeNamespaceId = this.getActiveNamespaceId() || this.state.myNamespaceId;
    const peerNamespaceId = this.state.peerNamespaceId;
    if (!activeNamespaceId || !peerNamespaceId) return;

    const { namespaceList } = this.props;
    const myShortCode = this.getNamespaceShortCode(
      activeNamespaceId,
      namespaceList?.namespaces?.[activeNamespaceId]?.shortCode,
    );
    const peerShortCode =
      this.state.peerShortCode ||
      this.props.navigation.state?.params?.peerShortCode ||
      null;

    const chatTag = this.getChatTag(myShortCode, peerShortCode);
    if (!chatTag) return;

    this.setState({ syncing: true });

    try {
      await BlueElectrum.ping();
      await this.withTimeout(BlueElectrum.waitTillConnected(), 8000);

      const response = await this.withTimeout(
        BlueElectrum.blockchainKeva_getHashtag(getHashtagScriptHash(chatTag), -1),
        8000,
      );

      const hashtagItems = Array.isArray(response) ? response : response?.hashtags || [];
      const chainMessages = [];

      for (const item of hashtagItems) {
        const txid = item.tx_hash || item.txid || item.tx;
        const rawEnvelope = this.parseEnvelope(this.getHashtagRawText(item));
        if (!rawEnvelope) continue;

        // 只接受包含本会话 #DM 标签的消息
        const hasDmToPeer = this.hasDmTag(rawEnvelope, peerShortCode);
        const hasDmToMe = this.hasDmTag(rawEnvelope, myShortCode);
        if (!hasDmToPeer && !hasDmToMe) continue;

        const text = this.stripChatTags(String(rawEnvelope));
        if (!text) continue;

        const sender = this.inferSenderByDmTag(rawEnvelope, myShortCode, peerShortCode);
        const isMine = sender === 'user';

        chainMessages.push(
          this.buildMessage(text, sender, {
            id: `${txid}:${item.vout || item.tx_pos || item.n || 0}`,
            timestamp: (item.time || item.timestamp || Date.now() / 1000) * 1000,
            txid,
            pending: false,
            direction: isMine ? 'out' : 'in',
          }),
        );
      }

      // merge + 去重（按 message.id）
      const existingIds = new Set(this.state.allMessages.map(m => m.id));
      const merged = [...this.state.allMessages];

      for (const msg of chainMessages) {
        if (existingIds.has(msg.id)) continue;

        // 用链上消息替换本地 pending
        if (msg.direction === 'out') {
          const pendingIndex = merged.findIndex(
            m => m.pending && m.direction === 'out' && m.text === msg.text,
          );
          if (pendingIndex >= 0) {
            merged[pendingIndex] = { ...merged[pendingIndex], ...msg, pending: false, failed: false };
            continue;
          }
        }

        merged.push(msg);
      }

      merged.sort((a, b) => a.timestamp - b.timestamp);

      const filteredMessages = this.filterMessagesForMode(merged);
      const nextVisibleCount = Math.max(
        this.state.visibleCount,
        Math.min(PAGE_SIZE, filteredMessages.length),
      );

      const nextOldest =
        typeof response?.min_tx_num === 'number' ? response.min_tx_num : this.state.chatOldestCursor;

      this.setState(
        {
          allMessages: merged,
          visibleCount: nextVisibleCount,
          messages: filteredMessages.slice(-nextVisibleCount),
          lastSyncAt: Date.now(),
          chatOldestCursor:
            this.state.chatOldestCursor === -1
              ? nextOldest
              : Math.min(this.state.chatOldestCursor, nextOldest),
          hasMoreOlder: true,
        },
        () => this.persistMessages(this.state.allMessages),
      );
    } catch (e) {
      console.warn('Failed to sync follow chat', e);
    } finally {
      if (this._isMounted) this.setState({ syncing: false });
    }
  };

loadOlderFromChain = async () => {
  if (this.state.loadingOlder || this.state.syncing) return;
  if (!this.state.hasMoreOlder) return;

  const activeNamespaceId = this.getActiveNamespaceId() || this.state.myNamespaceId;
  const peerNamespaceId = this.state.peerNamespaceId;
  const cursor = this.state.chatOldestCursor;

  if (!activeNamespaceId || !peerNamespaceId) return;
  if (cursor === -1) return;

  const { namespaceList } = this.props;
  const myShortCode = this.getNamespaceShortCode(
    activeNamespaceId,
    namespaceList?.namespaces?.[activeNamespaceId]?.shortCode,
  );
  const peerShortCode =
    this.state.peerShortCode ||
    this.props.navigation.state?.params?.peerShortCode ||
    null;

  const chatTag = this.getChatTag(myShortCode, peerShortCode);
  if (!chatTag) return;

  this.setState({ loadingOlder: true });

  try {
    await BlueElectrum.ping();
    await this.withTimeout(BlueElectrum.waitTillConnected(), 8000);

    const response = await this.withTimeout(
      BlueElectrum.blockchainKeva_getHashtag(getHashtagScriptHash(chatTag), cursor),
      8000,
    );

    const hashtagItems = Array.isArray(response) ? response : response?.hashtags || [];
    if (!hashtagItems.length) {
      this.setState({ hasMoreOlder: false });
      return;
    }

    const nextCursor = typeof response?.min_tx_num === 'number' ? response.min_tx_num : cursor;
    if (nextCursor === cursor) {
      this.setState({ hasMoreOlder: false });
      return;
    }

    const chainMessages = [];
    for (const item of hashtagItems) {
      const txid = item.tx_hash || item.txid || item.tx;
      const rawEnvelope = this.parseEnvelope(this.getHashtagRawText(item));
      if (!rawEnvelope) continue;

      const hasDmToPeer = this.hasDmTag(rawEnvelope, peerShortCode);
      const hasDmToMe = this.hasDmTag(rawEnvelope, myShortCode);
      if (!hasDmToPeer && !hasDmToMe) continue;

      const text = this.stripChatTags(String(rawEnvelope));
      if (!text) continue;

      const sender = this.inferSenderByDmTag(rawEnvelope, myShortCode, peerShortCode);
      const isMine = sender === 'user';

      chainMessages.push(
        this.buildMessage(text, sender, {
          id: `${txid}:${item.vout || item.tx_pos || item.n || 0}`,
          timestamp: (item.time || item.timestamp || Date.now() / 1000) * 1000,
          txid,
          pending: false,
          direction: isMine ? 'out' : 'in',
        }),
      );
    }

    this.setState(
      prev => {
        const existingIds = new Set(prev.allMessages.map(m => m.id));
        const merged = [...prev.allMessages];

        for (const msg of chainMessages) {
          if (existingIds.has(msg.id)) continue;
          merged.push(msg);
        }

        merged.sort((a, b) => a.timestamp - b.timestamp);
        const filtered = this.filterMessagesForMode(merged);
        const nextVisibleCount = Math.max(prev.visibleCount, Math.min(PAGE_SIZE, filtered.length));

        return {
          allMessages: merged,
          visibleCount: nextVisibleCount,
          messages: filtered.slice(-nextVisibleCount),
          chatOldestCursor: nextCursor,
        };
      },
      () => this.persistMessages(this.state.allMessages),
    );
  } catch (e) {
    console.warn('Failed to load older follow chat messages', e);
  } finally {
    if (this._isMounted) this.setState({ loadingOlder: false });
  }
};


  sendOnChain = async text => {
    const { peerAnchorTxid } = this.state;
    const myNamespaceId = this.getActiveNamespaceId();
    const walletId = this.getWalletId();
    if (!myNamespaceId) {
      throw new Error('namespace not set');
    }
    if (!peerAnchorTxid) {
      throw new Error('peer inbox not ready');
    }
    if (!walletId) {
      throw new Error('wallet not found');
    }
    const wallets = BlueApp.getWallets();
    const wallet = wallets.find(item => item.getID() === walletId);
    if (!wallet) {
      throw new Error('wallet not found');
    }
    const { namespaceList } = this.props;
    const myNamespace = namespaceList?.namespaces?.[myNamespaceId] || {};
    const peerNamespace = namespaceList?.namespaces?.[this.state.peerNamespaceId] || {};
    const myShortCode = myNamespace.shortCode;
    const peerShortCode = peerNamespace.shortCode || this.props.navigation.state?.params?.peerShortCode;
    if (!myShortCode || !peerShortCode) {
      throw new Error('short code missing');
    }
    const value = this.buildTaggedMessage(text, myShortCode, peerShortCode);
    await BlueElectrum.ping();
    const { tx } = await replyKeyValue(wallet, FALLBACK_DATA_PER_BYTE_FEE, myNamespaceId, value, peerAnchorTxid);
    await this.withTimeout(BlueElectrum.waitTillConnected(), 8000);
    const broadcastResult = await BlueElectrum.broadcast(tx);
    if (broadcastResult && broadcastResult.code) {
      throw new Error(broadcastResult.message || 'Broadcast failed');
    }
    return broadcastResult;
  };

  render() {
    const { peerNamespaceId, peerAnchorTxid, replyFromNamespaceId, pendingReplyFromNamespaceId, mode } = this.state;
    const { namespaceList } = this.props;
    const canSend = this.canSendMessage();
    const activeNamespaceId = this.getActiveNamespaceId();
    const needsBinding = !replyFromNamespaceId;
    const namespaceOptions = (namespaceList?.order || [])
      .map(namespaceId => {
        const namespace = namespaceList?.namespaces?.[namespaceId];
        if (!namespace) {
          return null;
        }
        const shortCode = namespace.shortCode ? `@${namespace.shortCode}` : '';
        return {
          label: `${namespace.displayName || namespaceId} ${shortCode}`.trim(),
          value: namespaceId,
        };
      })
      .filter(Boolean);
    const selectedNamespaceLabel = namespaceOptions.find(option => option.value === activeNamespaceId)?.label || null;
    let emptyText = 'Start a conversation with this peer.';
    if (!peerNamespaceId) {
      emptyText = 'Select a peer to start a conversation.';
    } else if (!peerAnchorTxid) {
      emptyText = 'peer inbox not ready';
    }
    return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <View style={styles.chatContainer}>
            {needsBinding && (
              <View style={styles.bindContainer}>
                <Text style={styles.bindTitle}>Select a space to reply</Text>
                <TouchableOpacity
                  style={styles.bindPickerButton}
                  onPress={this.openNamespaceModal}
                  accessibilityLabel="Select a space"
                  activeOpacity={0.8}
                >
                  <Text style={selectedNamespaceLabel ? styles.bindPickerText : styles.bindPlaceholder}>
                    {selectedNamespaceLabel || 'Select a space'}
                  </Text>
                  <Icon name="chevron-down" type="feather" color="#9aa4b2" size={18} />
                </TouchableOpacity>
                {pendingReplyFromNamespaceId && (
                  <TouchableOpacity style={styles.bindChangeButton} onPress={this.resetPendingSelection}>
                    <Text style={styles.bindChangeText}>Change</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            <Modal
              animationType="fade"
              transparent
              visible={this.state.isNamespaceModalVisible}
              onRequestClose={this.closeNamespaceModal}
            >
              <TouchableOpacity
                style={styles.bindModalOverlay}
                activeOpacity={1}
                onPress={this.closeNamespaceModal}
              >
                <TouchableOpacity
                  activeOpacity={1}
                  style={styles.bindModalContent}
                  onPress={() => {}}
                >
                  <View style={styles.bindModalHeader}>
                    <Text style={styles.bindModalTitle}>Select a space</Text>
                    <TouchableOpacity onPress={this.closeNamespaceModal}>
                      <Text style={styles.bindModalDone}>Done</Text>
                    </TouchableOpacity>
                  </View>
                  <FlatList
                    data={namespaceOptions}
                    keyExtractor={item => item.value}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.bindModalItem}
                        onPress={() => this.handleSelectNamespace(item.value)}
                      >
                        <Text style={styles.bindModalItemText}>{item.label}</Text>
                      </TouchableOpacity>
                    )}
                    ItemSeparatorComponent={() => <View style={styles.bindModalSeparator} />}
                    contentContainerStyle={styles.bindModalList}
                    ListEmptyComponent={() => (
                      <View style={styles.bindModalEmpty}>
                        <Text style={styles.bindModalEmptyText}>No spaces available</Text>
                      </View>
                    )}
                  />
                </TouchableOpacity>
              </TouchableOpacity>
            </Modal>
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
                  <Text style={styles.emptyText}>{emptyText}</Text>
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
              refreshControl={
  <RefreshControl
    refreshing={this.state.syncing}
    onRefresh={() => this.syncFromChain({ reset: true })}
  />
}

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
              editable={Boolean(activeNamespaceId)}
            />
            <TouchableOpacity style={[styles.sendButton, !canSend && styles.sendButtonDisabled]} onPress={this.handleSend} disabled={!canSend}>
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
  otherNamespaceList: state.otherNamespaceList,
});

export default connect(mapStateToProps)(FollowChat);

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
  bindContainer: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1f2a44',
  },
  bindTitle: {
    color: '#d2d7e0',
    fontSize: 14,
    marginBottom: 10,
    fontWeight: '600',
  },
  bindPlaceholder: {
    color: '#6f7587',
  },
  bindPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#0b1224',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1f2a44',
  },
  bindPickerText: {
    color: '#e2e8f0',
    fontSize: 15,
  },
  bindModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(4, 7, 16, 0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  bindModalContent: {
    backgroundColor: '#0b1224',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2a44',
    maxHeight: '70%',
  },
  bindModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1f2a44',
  },
  bindModalTitle: {
    color: '#d2d7e0',
    fontSize: 16,
    fontWeight: '600',
  },
  bindModalDone: {
    color: '#7dd3fc',
    fontSize: 16,
    fontWeight: '600',
  },
  bindModalList: {
    paddingVertical: 4,
  },
  bindModalItem: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  bindModalItemText: {
    color: '#e2e8f0',
    fontSize: 15,
  },
  bindModalSeparator: {
    height: 1,
    backgroundColor: '#1f2a44',
  },
  bindModalEmpty: {
    paddingHorizontal: 16,
    paddingVertical: 20,
    alignItems: 'center',
  },
  bindModalEmptyText: {
    color: '#6f7587',
    fontSize: 14,
  },
  bindChangeButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  bindChangeText: {
    color: '#7dd3fc',
    fontWeight: '600',
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
  sendButtonDisabled: {
    backgroundColor: '#55607a',
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
