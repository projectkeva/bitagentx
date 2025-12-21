import React from 'react';
import {
  View,
  Text,
  TextInput,
  Image,
  FlatList,
  SafeAreaView,
  TouchableOpacity,
  Clipboard,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Icon } from 'react-native-elements';
import RNFS from 'react-native-fs';
import { connect } from 'react-redux';
import { encode as b64encode, decode as b64decode } from 'base-64';
import RNPickerSelect from 'react-native-picker-select';
const StyleSheet = require('../../PlatformStyleSheet');
const KevaColors = require('../../common/KevaColors');
import { BlueNavigationStyle } from '../../BlueComponents';
import { buildHeadAssetUri } from '../../common/namespaceAvatar';
import { getInitials, stringToColor, timeConverter, toastError } from '../../util';
import { FALLBACK_DATA_PER_BYTE_FEE } from '../../models/networkTransactionFees';
import { getNamespaceScriptHash, replyKeyValue, toScriptHash } from '../../class/keva-ops';
import ActionSheet from '../ActionSheet';
import {
  CHAT_DIR,
  buildConversationId,
  ensureChatStorage,
  listConversationMetadataForPeer,
  setConversationMetadata,
} from './followChatStorage';

let BlueApp = require('../../BlueApp');
let BlueElectrum = require('../../BlueElectrum');
const PAGE_SIZE = 10;

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
      myInboxCursor: -1,
      peerInboxCursor: -1,
      replyFromNamespaceId: null,
      pendingReplyFromNamespaceId: null,
      availableBoundNamespaceIds: [],
      mode: 'mutual',
    };
    this.loadingMore = false;
    this.didInitialScroll = false;
    this.shouldScrollToEnd = false;
    this.conversationId = null;
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
    const mode = params.mode === 'send_only' ? 'send_only' : 'mutual';
    const boundEntries = peerNamespaceId ? await listConversationMetadataForPeer(peerNamespaceId) : [];
    const boundNamespaceIds = boundEntries
      .map(entry => entry.replyFromNamespaceId)
      .filter(Boolean);
    const replyFromNamespaceId =
      params.replyFromNamespaceId || (boundNamespaceIds.length === 1 ? boundNamespaceIds[0] : null);
    const conversationId = replyFromNamespaceId ? buildConversationId(replyFromNamespaceId, peerNamespaceId) : null;
    await ensureChatStorage();
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
      },
      () => {
        this.scrollToEnd(false);
        this.syncFromChain({ reset: true });
      },
    );
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
        myInboxCursor: -1,
        peerInboxCursor: -1,
        replyFromNamespaceId: setBound ? namespaceId : this.state.replyFromNamespaceId,
      },
      () => {
        this.scrollToEnd(false);
        this.syncFromChain({ reset: true });
      },
    );
  };

  handleSelectNamespace = async namespaceId => {
    if (!namespaceId) {
      return;
    }
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
      myInboxCursor: -1,
      peerInboxCursor: -1,
    });
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
      const { pendingReplyFromNamespaceId, replyFromNamespaceId, peerNamespaceId, availableBoundNamespaceIds } = this.state;
      if (!replyFromNamespaceId && pendingReplyFromNamespaceId && peerNamespaceId) {
        const conversationId = buildConversationId(pendingReplyFromNamespaceId, peerNamespaceId);
        await setConversationMetadata(conversationId, {
          peerNamespaceId,
          replyFromNamespaceId: pendingReplyFromNamespaceId,
          isMutual: true,
          boundAt: Date.now(),
        });
        this.setState({
          replyFromNamespaceId: pendingReplyFromNamespaceId,
          pendingReplyFromNamespaceId: null,
          availableBoundNamespaceIds: Array.from(new Set([...availableBoundNamespaceIds, pendingReplyFromNamespaceId])),
        });
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
    const { navigation, namespaceList } = this.props;
    if (!navigation || typeof navigation.navigate !== 'function') {
      return;
    }
    const { peerNamespaceId, peerDisplayName, peerShortCode, walletId } = navigation.state.params || {};
    const namespace = peerNamespaceId ? namespaceList?.namespaces?.[peerNamespaceId] : null;
    navigation.navigate('KeyValues', {
      namespaceId: namespace?.id || peerNamespaceId,
      shortCode: namespace?.shortCode || peerShortCode,
      displayName: namespace?.displayName || peerDisplayName,
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
            <View style={styles.avatarPressable}>{this.renderAvatar('peer')}</View>
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
            <View style={styles.avatarPressable}>{this.renderAvatar('user')}</View>
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
    const mode = modeOverride || this.state.mode;
    if (mode !== 'send_only') {
      return messages;
    }
    return messages.filter(message => message.direction !== 'in' && message.sender !== 'peer');
  };

  buildEnvelope = text => {
    return text;
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

  normalizeReactionValue = reaction => {
    const rawValue = reaction?.value;
    if (!rawValue) {
      return '';
    }
    if (typeof rawValue !== 'string') {
      return this.parseEnvelope(rawValue);
    }
    try {
      const decoded = b64decode(rawValue);
      return this.parseEnvelope(decoded);
    } catch (error) {
      return this.parseEnvelope(rawValue);
    }
  };

  reactionMatchesSender = (reaction, namespaceId, shortCode) => {
    if (!reaction) {
      return false;
    }
    const sender = reaction.sender || {};
    const senderShortCode = sender.shortCode || sender.short_code || reaction.shortCode || reaction.short_code;
    const senderNamespaceId = sender.namespaceId || sender.namespace_id || reaction.namespaceId || reaction.namespace_id;
    return (namespaceId && senderNamespaceId === namespaceId) || (shortCode && senderShortCode === shortCode);
  };

  syncFromChain = async ({ reset = false } = {}) => {
    const {
      myNamespaceId,
      peerNamespaceId,
      myAnchorTxid,
      peerAnchorTxid,
      myInboxCursor,
      peerInboxCursor,
      allMessages,
      syncing,
      mode,
    } = this.state;
    if (syncing) {
      return;
    }
    if (!myNamespaceId || !peerNamespaceId || !myAnchorTxid || !peerAnchorTxid) {
      return;
    }
    this.setState({ syncing: true });
    try {
      await BlueElectrum.ping();
      await BlueElectrum.waitTillConnected();
      const peerResponse = await BlueElectrum.blockchainKeva_getKeyValueReactions(peerAnchorTxid, reset ? -1 : peerInboxCursor);
      const myResponse = mode === 'send_only'
        ? null
        : await BlueElectrum.blockchainKeva_getKeyValueReactions(myAnchorTxid, reset ? -1 : myInboxCursor);
      const peerReactions = Array.isArray(peerResponse) ? peerResponse : peerResponse?.reactions || peerResponse?.replies || [];
      const myReactions = Array.isArray(myResponse) ? myResponse : myResponse?.reactions || myResponse?.replies || [];

      const myNamespace = this.props.namespaceList?.namespaces?.[myNamespaceId] || {};
      const peerNamespace = this.props.namespaceList?.namespaces?.[peerNamespaceId] || {};
      const myShortCode = myNamespace.shortCode;
      const peerShortCode = peerNamespace.shortCode;

      const outgoing = peerReactions.filter(reaction => this.reactionMatchesSender(reaction, myNamespaceId, myShortCode));
      const incoming = mode === 'send_only'
        ? []
        : myReactions.filter(reaction => this.reactionMatchesSender(reaction, peerNamespaceId, peerShortCode));

      const chainMessages = [];
      outgoing.forEach(reaction => {
        const txid = reaction.tx_hash || reaction.txid;
        const text = this.normalizeReactionValue(reaction);
        if (!text) {
          return;
        }
        chainMessages.push(
          this.buildMessage(text, 'user', {
            id: `${txid}:${reaction.vout || reaction.tx_pos || reaction.n || 0}`,
            timestamp: (reaction.time || reaction.timestamp || Date.now() / 1000) * 1000,
            txid,
            pending: false,
            direction: 'out',
          }),
        );
      });
      incoming.forEach(reaction => {
        const txid = reaction.tx_hash || reaction.txid;
        const text = this.normalizeReactionValue(reaction);
        if (!text) {
          return;
        }
        chainMessages.push(
          this.buildMessage(text, 'peer', {
            id: `${txid}:${reaction.vout || reaction.tx_pos || reaction.n || 0}`,
            timestamp: (reaction.time || reaction.timestamp || Date.now() / 1000) * 1000,
            txid,
            pending: false,
            direction: 'in',
          }),
        );
      });

      const existingTxids = new Set(allMessages.filter(message => message.txid).map(message => message.txid));
      const merged = [...allMessages];
      chainMessages.forEach(message => {
        if (message.txid && existingTxids.has(message.txid)) {
          return;
        }
        if (message.direction === 'out') {
          const pendingIndex = merged.findIndex(
            existing =>
              existing.pending &&
              existing.direction === 'out' &&
              existing.text === message.text,
          );
          if (pendingIndex >= 0) {
            merged[pendingIndex] = {
              ...merged[pendingIndex],
              ...message,
              pending: false,
              failed: false,
            };
            return;
          }
        }
        merged.push(message);
      });

      merged.sort((a, b) => a.timestamp - b.timestamp);
      const filteredMessages = this.filterMessagesForMode(merged);
      const nextVisibleCount = Math.max(this.state.visibleCount, Math.min(PAGE_SIZE, filteredMessages.length));
      this.setState(
        {
          allMessages: merged,
          visibleCount: nextVisibleCount,
          messages: filteredMessages.slice(-nextVisibleCount),
          lastSyncAt: Date.now(),
          myInboxCursor: myResponse?.min_tx_num ?? myInboxCursor,
          peerInboxCursor: peerResponse?.min_tx_num ?? peerInboxCursor,
        },
        () => this.persistMessages(this.state.allMessages),
      );
    } catch (error) {
      console.warn('Failed to sync follow chat', error);
    } finally {
      if (this._isMounted) {
        this.setState({ syncing: false });
      }
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
    const value = this.buildEnvelope(text);
    await BlueElectrum.ping();
    const { tx } = await replyKeyValue(wallet, FALLBACK_DATA_PER_BYTE_FEE, myNamespaceId, value, peerAnchorTxid);
    await BlueElectrum.waitTillConnected();
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
            {mode === 'send_only' && (
              <View style={styles.oneWayBanner}>
                <Text style={styles.oneWayText}>One-way delivery</Text>
              </View>
            )}
            {needsBinding && (
              <View style={styles.bindContainer}>
                <Text style={styles.bindTitle}>Select a space to reply</Text>
                <RNPickerSelect
                  value={activeNamespaceId}
                  placeholder={{ label: 'Select a space', value: null }}
                  useNativeAndroidPickerStyle={false}
                  style={{
                    inputAndroid: styles.bindPicker,
                    inputIOS: styles.bindPicker,
                    placeholder: styles.bindPlaceholder,
                    iconContainer: styles.bindPickerIcon,
                  }}
                  onValueChange={this.handleSelectNamespace}
                  items={namespaceOptions}
                  Icon={() => <Icon name="chevron-down" type="feather" color="#9aa4b2" size={18} />}
                />
                {pendingReplyFromNamespaceId && (
                  <TouchableOpacity style={styles.bindChangeButton} onPress={this.resetPendingSelection}>
                    <Text style={styles.bindChangeText}>Change</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
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
  oneWayBanner: {
    alignSelf: 'flex-start',
    marginBottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1f2a44',
    backgroundColor: '#0f172a',
  },
  oneWayText: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '600',
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
  bindPicker: {
    fontSize: 15,
    color: '#e2e8f0',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#0b1224',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1f2a44',
  },
  bindPlaceholder: {
    color: '#6f7587',
  },
  bindPickerIcon: {
    top: 12,
    right: 12,
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
