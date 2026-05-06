import React from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  View,
  TextInput,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  Dimensions,
  Platform,
  PixelRatio,
  Text,
  RefreshControl,
  Clipboard,
  LayoutAnimation,
  Keyboard,
  Image,
  InteractionManager,
  Alert,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/Ionicons';
import MCIcon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  BlueNavigationStyle,
  BlueLoading,
  BlueBigCheckmark,
  BlueBigWait,
} from '../../BlueComponents';
import Modal from 'react-native-modal';
import ActionSheet from 'react-native-actionsheet';
import SortableListView from 'react-native-sortable-list'
import RNPickerSelect from 'react-native-picker-select';
import { TabView, TabBar } from 'react-native-tab-view';
import { connect } from 'react-redux'
import { decode as b64decode } from 'base-64';
import {
  setNamespaceList, setOtherNamespaceList,
  setNamespaceOrder, setOtherNamespaceOrder,
  deleteOtherNamespace, setKeyValueList,
  setAllReactions,
} from '../../actions'
import { HDSegwitP2SHWallet,  } from '../../class';
import { FALLBACK_DATA_PER_BYTE_FEE } from '../../models/networkTransactionFees';
import Biometric from '../../class/biometrics';
import { requestServerNamespace, getCachedServerNamespaceResult } from '../../class/namespace-api';
import { Button } from 'react-native-elements';
import { buildHeadAssetUriCandidates } from '../../common/namespaceAvatar';
import ImagePicker from 'react-native-image-crop-picker';
import RNFS from 'react-native-fs';
import AsyncStorage from '@react-native-community/async-storage';
import { readStoryJsonFile, getAlphaStatePath } from './story_alpha';
import {
  exportStoryRecordToFile,
  importStoryRecordFromFile,
  isStoryRecordImportCancel,
} from './story_record_io';
const { calculateLevelFromShortcode } = require('../../common/shortcodeLevel');
const createHash = require('create-hash');
const SATOSHI_STATUS_KEY = 'satoshi_agent_status_v1';
const setSatoshiStatus = status => AsyncStorage.setItem(SATOSHI_STATUS_KEY, status).catch(() => {});

let BlueApp = require('../../BlueApp');
let loc = require('../../loc');
let BlueElectrum = require('../../BlueElectrum');
const StyleSheet = require('../../PlatformStyleSheet');
const KevaButton = require('../../common/KevaButton');
const KevaColors = require('../../common/KevaColors');
import {
  THIN_BORDER, SCREEN_WIDTH, ModalHandle, toastError,
  stringToColor, getInitials,
} from '../../util';
import Toast from 'react-native-root-toast';
import StepModal from "../../common/StepModalWizard";

import {
  createKevaNamespace, findMyNamespaces,
  findOtherNamespace, getNamespaceInfo,
  getHashtagScriptHash,
  waitPromise, populateReactions,
} from '../../class/keva-ops';
import {
  buildConversationId,
  listConversationMetadataForPeer,
  removeConversationMetadataForPeer,
  setConversationMetadata,
} from './followChatStorage';
import {
  getCachedNamespaceUiLang,
  getNamespaceText,
  resolveNamespaceUiLanguage,
} from './namespace_i18n';

const COPY_ICON = (<Icon name="ios-copy" size={22} color={KevaColors.extraLightText}
                         style={{ paddingVertical: 5, paddingHorizontal: 5, position: 'relative', left: -3 }}
                  />)

const LOCAL_NAMESPACE_AVATAR_DIR = `${RNFS.DocumentDirectoryPath}/namespace_avatars`;
const getNamespaceAvatarPath = namespaceId => `${LOCAL_NAMESPACE_AVATAR_DIR}/${encodeURIComponent(String(namespaceId || 'unknown'))}.jpg`;

let _g_cleanLockedFund;
let _g_checkLockedFund;

const sha256Bytes = message => Buffer.from(createHash('sha256').update(message).digest());

const attrSeedBytes = (id, attrName) => {
  const seed0 = sha256Bytes(`${id}projectkeva`);
  const attrBytes = Buffer.from(`:${attrName}`);
  return Buffer.from(createHash('sha256').update(Buffer.concat([seed0, attrBytes])).digest());
};

const attrIntInRange = (seedBytes, min, max) => {
  const hi = seedBytes.readUInt32BE(0);
  const lo = seedBytes.readUInt32BE(4);
  const v = (hi ^ lo) >>> 0;
  const span = max - min + 1;
  return min + (v % span);
};

const computeAlphaValue = id => {
  try {
    const seedBytes = attrSeedBytes(id, 'alpha');
    return attrIntInRange(seedBytes, -99, 99);
  } catch (err) {
    console.warn(err);
    return null;
  }
};

const blendChannel = (from, to, ratio) => {
  const t = Math.max(0, Math.min(1, ratio));
  return Math.round(from + (to - from) * t);
};

const buildAlphaColorComponents = alphaValue => {
  const normalized = normalizeAlphaValue(alphaValue);
  if (normalized === null || normalized === 0) return { r: 255, g: 255, b: 255 };
  const intensity = Math.abs(normalized) / 99;
  const white = { r: 255, g: 255, b: 255 };
  const target = normalized < 0 ? { r: 12, g: 176, b: 96 } : { r: 24, g: 128, b: 255 };
  return {
    r: blendChannel(white.r, target.r, intensity),
    g: blendChannel(white.g, target.g, intensity),
    b: blendChannel(white.b, target.b, intensity),
  };
};

const toRgbaString = ({ r, g, b }, alpha = 1) => `rgba(${r}, ${g}, ${b}, ${alpha})`;

const getAlphaGlowDetails = alphaValue => {
  const components = buildAlphaColorComponents(alphaValue);
  return {
    glowColor: toRgbaString(components, 0.95),
    glowSoftColor: toRgbaString(components, 0.22),
  };
};

const CHAT_DIR = `${RNFS.DocumentDirectoryPath}/agent_chats`;
const alphaFileValueCache = new Map();

const normalizeAlphaValue = value => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n > 99) return 99;
  if (n < -99) return -99;
  return Math.round(n);
};

const getCachedAlphaValue = shortCode => {
  if (!shortCode) return null;
  return alphaFileValueCache.has(shortCode) ? alphaFileValueCache.get(shortCode) : null;
};

const primeNamespaceAlphaValue = async shortCode => {
  if (!shortCode) return null;
  if (alphaFileValueCache.has(shortCode)) {
    return alphaFileValueCache.get(shortCode);
  }
  try {
    const alphaState = await readStoryJsonFile(getAlphaStatePath(`${CHAT_DIR}/${encodeURIComponent(String(shortCode || ''))}/story`));
    const normalized = normalizeAlphaValue(alphaState?.currentAlpha);
    alphaFileValueCache.set(shortCode, normalized);
    return normalized;
  } catch (error) {
    const fallbackAlpha = computeAlphaValue(shortCode);
    alphaFileValueCache.set(shortCode, fallbackAlpha);
    return fallbackAlpha;
  }
};

const resolveNamespaceAlphaValue = shortCode => {
  const normalizedShortCode = normalizeShortCode(shortCode);
  if (!normalizedShortCode) return null;
  const cached = getCachedAlphaValue(normalizedShortCode);
  if (cached !== null) {
    return cached;
  }
  return computeAlphaValue(normalizedShortCode);
};

const clearNamespaceAlphaCache = () => {
  alphaFileValueCache.clear();
};

const avatarUriCache = new Map();

const selectAvatarCandidateUri = (candidateUris = [], failedUris = [], generatedUri = null) => {
  if (generatedUri) return null;
  for (const candidate of candidateUris) {
    if (!candidate) continue;
    if (failedUris && failedUris.includes(candidate)) continue;
    return candidate;
  }
  return null;
};

const GUEST_SECTION_KEY = 'guest_inbox_section';
const GUEST_ORDER_STORAGE_KEY = 'guest_inbox_order_index';
const TAG_DM_PREFIX = '#DM';
const TAG_CHAT_PREFIX = '#CHAT';
const TAG_GLOBAL_CHAT = '#chatxkeva';
const ACTION_PAGES = [
  ['Profile', 'Role', 'Chat', 'Story'],
  ['Message', 'Task', 'Room', 'DNA'],
  ['Wallet', 'Market', 'Asset', 'Game'],
  ['Profile', 'Link', 'Log', 'Task'],
];

const normalizeShortCode = shortCode => {
  if (shortCode === null || typeof shortCode === 'undefined') {
    return '';
  }
  return String(shortCode).replace(/\s+/g, '').trim();
};


class Namespace extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      selectedImage: null,
      avatarCandidateUris: [],
      avatarCandidateRequestId: 0,
      avatarFailedUris: [],
      generatedAvatarUri: null,
      localAvatarUri: null,
      actionPageIndex: 0,
      resolvedAlphaValue: null,
      namespaceUiLang: getCachedNamespaceUiLang(props.data),
    };

    this._avatarRequestId = 0;
    this._avatarHandle = null;
    this._isMounted = false;
    this._avatarShortCode = null;

    this._active = new Animated.Value(0);
    this._style = {
      ...Platform.select({
        ios: {
          transform: [{ rotate: '0deg' }],
          shadowRadius: 2,
        },

        android: {
          transform: [{ rotate: '0deg' }],
          elevation: 2,
        },
      }),
      opacity: 1,
    };
  }

  componentDidMount() {
    this._isMounted = true;
    this.prepareGeneratedAvatar(this.props.data);
    this.loadLocalAvatar(this.props.data);
    this.loadResolvedAlphaValue(this.props.data);
    this.loadNamespaceUiLanguage(this.props.data);
    this._focusListener = this.props.navigation?.addListener?.('willFocus', () => this.loadNamespaceUiLanguage(this.props.data, true));
  }

  componentDidUpdate(prevProps) {
    const prevData = prevProps.data || {};
    const currentData = this.props.data || {};
    if (prevData.shortCode !== currentData.shortCode || prevData.id !== currentData.id) {
      this.prepareGeneratedAvatar(currentData);
    }
    if (
      prevData.shortCode !== currentData.shortCode ||
      prevData.id !== currentData.id
    ) {
      this.loadResolvedAlphaValue(currentData);
      this.loadNamespaceUiLanguage(currentData, true);
    }
    if (prevProps.avatarRefreshKey !== this.props.avatarRefreshKey) {
      this.loadLocalAvatar(currentData);
    }
  }

  loadNamespaceUiLanguage = async (namespace = this.props.data, force = false) => {
    const lang = await resolveNamespaceUiLanguage(namespace, force);
    if (this._isMounted && lang && lang !== this.state.namespaceUiLang) {
      this.setState({ namespaceUiLang: lang });
    }
  }

  componentWillUnmount() {
    this._isMounted = false;
    if (this._avatarHandle && typeof this._avatarHandle.cancel === 'function') {
      this._avatarHandle.cancel();
    }
    this._avatarHandle = null;
    if (this._focusListener && this._focusListener.remove) {
      this._focusListener.remove();
    }
    this._focusListener = null;
  }

  onInfo = () => {
    let namespace = this.props.data;
    this.props.onInfo(namespace, this.props.isOther);
  }

  getNamespaceStorageId = (namespace = this.props.data) => {
    const shortCode = namespace && namespace.shortCode;
    return shortCode ? String(shortCode) : '';
  }

  ensureLocalAvatarDir = async () => {
    const exists = await RNFS.exists(LOCAL_NAMESPACE_AVATAR_DIR);
    if (!exists) {
      await RNFS.mkdir(LOCAL_NAMESPACE_AVATAR_DIR);
    }
  }

  loadResolvedAlphaValue = async (namespace = this.props.data) => {
    const shortCode = normalizeShortCode(namespace && namespace.shortCode);
    if (!shortCode) {
      if (this._isMounted) {
        this.setState({ resolvedAlphaValue: null });
      }
      return;
    }
    const alphaValue = await primeNamespaceAlphaValue(shortCode);
    if (this._isMounted && normalizeShortCode(this.props?.data?.shortCode) === shortCode) {
      this.setState({ resolvedAlphaValue: alphaValue });
    }
  }

  loadLocalAvatar = async (namespace = this.props.data) => {
    try {
      const storageId = this.getNamespaceStorageId(namespace);
      if (!storageId) {
        if (this._isMounted) this.setState({ localAvatarUri: null });
        return;
      }
      await this.ensureLocalAvatarDir();
      const path = getNamespaceAvatarPath(storageId);
      const exists = await RNFS.exists(path);
      if (this._isMounted) {
        this.setState({ localAvatarUri: exists ? `file://${path}` : null });
      }
    } catch (error) {
      console.warn('Failed to load local namespace avatar', error);
    }
  }

  pickLocalAvatar = async (namespace = this.props.data) => {
    try {
      const storageId = this.getNamespaceStorageId(namespace);
      if (!storageId) {
        toastError('Shortcode required before setting local avatar');
        return;
      }
      const picked = await ImagePicker.openPicker({
        mediaType: 'photo',
        cropping: true,
        compressImageQuality: 0.9,
        forceJpg: true,
      });
      const sourcePath = picked && picked.path;
      if (!sourcePath) return;
      await this.ensureLocalAvatarDir();
      const targetPath = getNamespaceAvatarPath(storageId);
      if (await RNFS.exists(targetPath)) {
        await RNFS.unlink(targetPath).catch(() => {});
      }
      await RNFS.copyFile(sourcePath, targetPath);
      if (this._isMounted) {
        this.setState({ localAvatarUri: `file://${targetPath}` });
      }
      Toast.show('Local avatar updated', {
        position: Toast.positions.TOP,
        backgroundColor: '#53DD6C',
      });
    } catch (error) {
      if (error && (String(error.code || '').includes('E_PICKER_CANCELLED') || String(error.message || '').toLowerCase().includes('cancel'))) {
        return;
      }
      console.warn('Failed to pick local avatar', error);
      toastError('Failed to set local avatar');
    }
  }

  removeLocalAvatar = async (namespace = this.props.data) => {
    try {
      const storageId = this.getNamespaceStorageId(namespace);
      if (!storageId) return;
      const path = getNamespaceAvatarPath(storageId);
      if (await RNFS.exists(path)) {
        await RNFS.unlink(path);
      }
      if (this._isMounted) {
        this.setState({ localAvatarUri: null });
      }
      Toast.show('Local avatar removed', {
        position: Toast.positions.TOP,
        backgroundColor: '#53DD6C',
      });
    } catch (error) {
      console.warn('Failed to remove local avatar', error);
      toastError('Failed to remove local avatar');
    }
  }

  onAvatarPress = () => {
    if (this.props.isOther) {
      this.onKey();
      return;
    }
    this.onInfo();
  }

  onSoldorOffer = () => {
    const {refresh} = this.props;
    setTimeout(async () => {
      if (refresh) {
        await refresh();
      } else {
        await _g_cleanLockedFund();
        await _g_checkLockedFund();
      }
    }, 2000);
  }

  onKey = () => {
    let namespace = this.props.data;
    let isOther = this.props.isOther;
    this.props.navigation.push('KeyValues', {
      namespaceId: namespace.id || namespace.namespaceId,
      shortCode: namespace.shortCode,
      displayName: namespace.displayName,
      txid: namespace.txId,
      rootAddress: namespace.rootAddress,
      walletId: namespace.walletId,
      isOther,
      price: namespace.price, desc: namespace.desc, addr: namespace.addr,
      profile: namespace.profile,
      onSoldorOffer: this.onSoldorOffer,
    });
  }

  onTransfer = (namespace) => {
    this.props.navigation.push('TransferNamespace', {
      namespaceId: namespace.id,
      walletId: namespace.walletId,
    });
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (this.props.active !== nextProps.active) {
      this._active.setValue(Number(nextProps.active));
    }
    const prevShortCode = normalizeShortCode(this.props?.data?.shortCode);
    const nextShortCode = normalizeShortCode(nextProps?.data?.shortCode);
    if (prevShortCode !== nextShortCode) {
      this.setState({ resolvedAlphaValue: null });
      this.loadResolvedAlphaValue(nextProps.data);
    }
  }

  onWait = () => {
    const {data, onWait, refresh} = this.props;
    onWait(data.id, data.displayName, refresh);
  }

  cycleActionPage = () => {
    this.setState(prevState => ({
      actionPageIndex: (prevState.actionPageIndex + 1) % ACTION_PAGES.length,
    }));
  }

  onPressAction = label => {
    switch (label) {
      case 'Profile':
        return this.onAvatarPress?.();
      case 'Message':
        return this.onMessage?.();
      case 'Chat':
        return this.onChat?.({ autoCommand: '/linkstart' });
      case 'Story':
        return this.onStory?.();
      case 'Role':
        return this.onRole?.();
      default:
        return;
    }
  }

  getAvatar = name => {
    return {titleAvatar: getInitials(name), colorAvatar: stringToColor(name)}
  }

  prepareGeneratedAvatar = namespace => {
    if (this._avatarHandle && typeof this._avatarHandle.cancel === 'function') {
      this._avatarHandle.cancel();
    }

    const shortCode = namespace && namespace.shortCode;
    this._avatarShortCode = shortCode || null;
    if (!shortCode) {
      if (this._isMounted) {
        this.setState({
          avatarCandidateUris: [],
          avatarCandidateRequestId: 0,
          avatarFailedUris: [],
          generatedAvatarUri: null,
        });
      }
      this._avatarHandle = null;
      return;
    }

    const requestId = ++this._avatarRequestId;

    const scheduleTask = () => {
      this._avatarHandle = null;
      const candidateUris = buildHeadAssetUriCandidates(shortCode);
      if (!this._isMounted || requestId !== this._avatarRequestId) {
        return;
      }
      if (!candidateUris || candidateUris.length === 0) {
        this.setState({
          avatarCandidateUris: [],
          avatarCandidateRequestId: 0,
          avatarFailedUris: [],
          generatedAvatarUri: null,
        });
        return;
      }
      this.setState(prevState => {
        const cachedUri = avatarUriCache.get(shortCode);
        const cachedIsValid = cachedUri && candidateUris.includes(cachedUri);
        const prevCandidateUris = prevState.avatarCandidateUris || [];
        const sameCandidates =
          prevCandidateUris.length === candidateUris.length &&
          prevCandidateUris.every((uri, idx) => uri === candidateUris[idx]);
        const retainedGeneratedUri = sameCandidates
          ? prevState.generatedAvatarUri || (cachedIsValid ? cachedUri : null)
          : cachedIsValid ? cachedUri : null;
        return {
          avatarCandidateUris: candidateUris,
          avatarCandidateRequestId: requestId,
          avatarFailedUris: sameCandidates ? prevState.avatarFailedUris || [] : [],
          generatedAvatarUri: retainedGeneratedUri,
        };
      });
    };

    const handle = InteractionManager.runAfterInteractions(() => {
      scheduleTask();
    });

    if (handle && typeof handle.cancel === 'function') {
      this._avatarHandle = handle;
    } else {
      scheduleTask();
    }
  }

  onAvatarLoadSuccess = (uri, requestId) => {
    if (!this._isMounted || requestId !== this._avatarRequestId) {
      return;
    }
    if (this._avatarShortCode) {
      avatarUriCache.set(this._avatarShortCode, uri);
    }
    this.setState({
      generatedAvatarUri: uri,
      avatarFailedUris: [],
    });
  }

  onAvatarLoadError = (uri, requestId) => {
    if (!this._isMounted || requestId !== this._avatarRequestId) {
      return;
    }
    if (this._avatarShortCode && avatarUriCache.get(this._avatarShortCode) === uri) {
      avatarUriCache.delete(this._avatarShortCode);
    }
    this.setState(prevState => {
      const prevFailed = prevState.avatarFailedUris || [];
      if (prevFailed.includes(uri) && prevState.generatedAvatarUri === null) {
        return null;
      }
      return {
        generatedAvatarUri: null,
        avatarFailedUris: prevFailed.concat(uri),
      };
    });
  }

  onStory = () => {
    const { data, navigation, isOther } = this.props;
    if (isOther) {
      return;
    }
    if (!navigation || typeof navigation.push !== 'function') {
      return;
    }
    if (!this.props.canChat) {
      return;
    }
    const namespaceId = data.id || data.namespaceId;
    const debugPath = `${RNFS.DocumentDirectoryPath}/agent_chats/_params_debug.log`;
    RNFS.mkdir(`${RNFS.DocumentDirectoryPath}/agent_chats`).catch(() => {});
    RNFS.appendFile(debugPath, `${new Date().toISOString()} namespaces onStory data=${JSON.stringify({ namespaceId, shortCode: data.shortCode, displayName: data.displayName, walletId: data.walletId, txid: data.txId, rootAddress: data.rootAddress, price: data.price, desc: data.desc, addr: data.addr, profile: data.profile })}\n`, 'utf8').catch(() => {});
    navigation.push('AgentStory', {
      namespaceId,
      shortCode: data.shortCode,
      displayName: data.displayName,
      walletId: data.walletId,
      txid: data.txId,
      rootAddress: data.rootAddress,
      price: data.price,
      desc: data.desc,
      addr: data.addr,
      profile: data.profile,
      suppressAutoLinkStart: true,
      autoCommand: '/d new',
      autoCommandSource: 'link-story',
      startStoryOnMount: true,
    });
  }


  onRole = () => {
    const { data, navigation, isOther } = this.props;
    if (isOther) return;
    if (!navigation || typeof navigation.push !== 'function') return;
    if (!this.props.canChat) return;

    const namespaceId = data.id || data.namespaceId;
    const debugPath = `${RNFS.DocumentDirectoryPath}/agent_chats/_params_debug.log`;
    RNFS.mkdir(`${RNFS.DocumentDirectoryPath}/agent_chats`).catch(() => {});
    RNFS.appendFile(debugPath, `${new Date().toISOString()} namespaces onRole data=${JSON.stringify({ namespaceId, shortCode: data.shortCode, displayName: data.displayName, walletId: data.walletId, txid: data.txId, rootAddress: data.rootAddress, price: data.price, desc: data.desc, addr: data.addr, profile: data.profile, autoCommand: '/role', roleEntrySource: 'namespace-button' })}\n`, 'utf8').catch(() => {});

    navigation.push('AgentRole', {
      namespaceId,
      shortCode: data.shortCode,
      displayName: data.displayName,
      walletId: data.walletId,
      txid: data.txId,
      rootAddress: data.rootAddress,
      price: data.price,
      desc: data.desc,
      addr: data.addr,
      profile: data.profile,
      autoCommand: '/role',
      roleEntrySource: 'namespace-button',
      suppressAutoLinkStart: true,
    });
  }

  onMessage = () => {
    const { data, navigation, isOther } = this.props;
    if (isOther) {
      return;
    }
    if (!navigation || typeof navigation.push !== 'function') {
      return;
    }
    const namespaceId = data.id || data.namespaceId;
    navigation.push('GuestChat', {
      mode: 'guest',
      targetNamespaceId: namespaceId,
    });
  }

  onChat = (options = {}) => {
    const { data, navigation, isMutual, isOther } = this.props;
    if (!navigation || typeof navigation.push !== 'function') {
      return;
    }
    if (!this.props.canChat) {
      return;
    }
    const namespaceId = data.id || data.namespaceId;
    const { autoCommand, suppressAutoLinkStart } = options;

    if (!isOther) {
      navigation.push('AgentRole', {
        namespaceId,
        shortCode: data.shortCode,
        displayName: data.displayName,
        walletId: data.walletId,
        txid: data.txId,
        rootAddress: data.rootAddress,
        price: data.price,
        desc: data.desc,
        addr: data.addr,
        profile: data.profile,
        autoCommand: '/role chat',
        roleEntrySource: 'namespace-chat-button',
        pureChatMode: true,
        headerModeTitle: 'Chat',
        suppressAutoLinkStart: true,
      });
      return;
    }

    const mode = isMutual === false ? 'send_only' : 'mutual';
    listConversationMetadataForPeer(namespaceId)
      .then(entries => {
        const boundNamespaceIds = entries.map(entry => entry.replyFromNamespaceId).filter(Boolean);
        const replyFromNamespaceId = boundNamespaceIds.length === 1 ? boundNamespaceIds[0] : null;
        navigation.push('FollowChat', {
          peerNamespaceId: namespaceId,
          peerShortCode: data.shortCode,
          peerDisplayName: data.displayName,
          replyFromNamespaceId,
          mode,
        });
      })
      .catch(error => {
        console.warn('Failed to load follow chat metadata', error);
        navigation.push('FollowChat', {
          peerNamespaceId: namespaceId,
          peerShortCode: data.shortCode,
          peerDisplayName: data.displayName,
          mode,
        });
      });
  }

  render() {
    const namespace = this.props.data;
    const {canDelete, onDelete} = this.props;
    const {titleAvatar, colorAvatar} = this.getAvatar(namespace.displayName);
    const isForSale = !!namespace.price;
    const displayNameText = namespace.displayName;
    const shortCodeLabelText = namespace.shortCode ? `@${namespace.shortCode}` : '';
    const shortCodeLevel = calculateLevelFromShortcode(namespace.shortCode, {
      currentBlockHeight: this.props.latestBlockHeight,
    });
    const alphaValue = namespace.shortCode
      ? (this.state.resolvedAlphaValue !== null ? this.state.resolvedAlphaValue : resolveNamespaceAlphaValue(namespace.shortCode))
      : null;
    const alphaLabelText = Number.isFinite(alphaValue)
      ? `[ α${alphaValue > 0 ? `+${alphaValue}` : alphaValue} ]`
      : '';
    const levelLabelText = Number.isFinite(shortCodeLevel)
      ? `[ Lv.${shortCodeLevel} ]${alphaLabelText ? ` ${alphaLabelText}` : ''}`
      : null;
    const isMyCard = !this.props.isOther;
    const canChat = this.props.canChat;
    const {
      avatarCandidateUris,
      avatarCandidateRequestId,
      avatarFailedUris,
      generatedAvatarUri,
      localAvatarUri,
    } = this.state;

    const avatarCandidateUri = selectAvatarCandidateUri(avatarCandidateUris, avatarFailedUris, generatedAvatarUri);
    const shouldProbeAvatar = !localAvatarUri && !!(avatarCandidateUri && avatarCandidateRequestId === this._avatarRequestId);
    const avatarSource = localAvatarUri ? { uri: localAvatarUri } : (generatedAvatarUri ? { uri: generatedAvatarUri } : undefined);

    const namespaceText = key => getNamespaceText(key, this.state.namespaceUiLang);

    const { glowColor: alphaGlowColor, glowSoftColor: alphaGlowSoftColor } = getAlphaGlowDetails(alphaValue);
    const alphaGlowStyle = alphaGlowColor ? {
      shadowColor: alphaGlowColor,
      shadowOpacity: 0.95,
      shadowRadius: 15,
      shadowOffset: { width: 0, height: 0 },
      elevation: 10,
    } : null;
    const alphaNeonHaloStyle = alphaGlowColor ? {
      borderColor: alphaGlowColor,
      backgroundColor: alphaGlowSoftColor,
      shadowColor: alphaGlowColor,
      shadowOpacity: 0.75,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 0 },
      elevation: 8,
    } : null;

    const avatarContent = avatarSource ? (
      <View style={styles.generatedAvatarContainer}>
        <Image source={avatarSource} style={styles.generatedAvatarImage} />
      </View>
    ) : (
      <View style={[styles.fallbackAvatar, { backgroundColor: colorAvatar }]}>
        <Text style={styles.fallbackAvatarLabel}>{titleAvatar}</Text>
      </View>
    );
    const renderActionButton = ({ label, text, disabled, onPress }) => {
      const displayText = text || namespaceText(label);
      if (disabled) {
        return (
          <View key={label} style={[styles.spaceActionButton, styles.spaceActionButtonDisabled]}>
            <Text style={[styles.spaceActionText, styles.spaceActionTextDisabled]}>{displayText}</Text>
          </View>
        );
      }

      return (
        <TouchableOpacity key={label} style={styles.spaceActionButton} onPress={onPress}>
          <Text style={styles.spaceActionText}>{displayText}</Text>
        </TouchableOpacity>
      );
    };
    return (
      <View style={styles.cardContainer}>
        <View style={styles.neonCard}>
          <View style={styles.cardInner}>
            <View style={styles.headerRow}>
              <TouchableOpacity style={[styles.avatarWrapper, styles.neonAvatarWrapper, alphaGlowStyle]} onPress={this.onAvatarPress}>
                {alphaNeonHaloStyle ? <View pointerEvents="none" style={[styles.avatarNeonHalo, alphaNeonHaloStyle]} /> : null}
                {shouldProbeAvatar && (
                  <Image
                    source={{ uri: avatarCandidateUri }}
                    style={styles.avatarProbe}
                    onLoad={() => this.onAvatarLoadSuccess(avatarCandidateUri, avatarCandidateRequestId)}
                    onError={() => this.onAvatarLoadError(avatarCandidateUri, avatarCandidateRequestId)}
                  />
                )}
                {avatarContent}
              </TouchableOpacity>
              <View style={styles.titleArea}>
                <TouchableOpacity style={styles.titleBlock} onPress={this.onKey} activeOpacity={0.7}>
                  <Text
                    style={[styles.cardTitleText, isForSale && styles.saleTitle]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {displayNameText}
                  </Text>
                  <View style={styles.levelRow}>
                    {shortCodeLabelText ? (
                      <Text style={styles.shortCodeLevelLabel}>{shortCodeLabelText}</Text>
                    ) : null}
                    {levelLabelText && (
                      <Text style={styles.levelLabel}>{levelLabelText}</Text>
                    )}
                  </View>
                </TouchableOpacity>
                <View style={styles.actionContainer}>
                  {
                    !namespace.shortCode &&
                    <TouchableOpacity onPress={this.onWait}>
                      <Icon name="ios-hourglass" size={20} style={[styles.actionIcon, styles.warnAction]} />
                    </TouchableOpacity>
                  }
                  { canDelete &&
                  <TouchableOpacity onPress={() => onDelete(namespace.id || namespace.namespaceId)}>
                    <Icon name="ios-remove-circle-outline" size={20} style={styles.actionIcon} />
                  </TouchableOpacity>
                  }
                </View>
              </View>
              <TouchableOpacity onPress={this.onKey}>
                <View style={styles.arrowWrapper}>
                  <Icon name="ios-arrow-forward" size={24} color={KevaColors.actionText} style={styles.arrowIcon} />
                </View>
              </TouchableOpacity>
            </View>
            <View style={styles.accentLine} />
            {isMyCard ? (
              <View style={styles.spaceActionGrid}>
                <View style={styles.spaceActionRowMulti}>
                  {ACTION_PAGES[this.state.actionPageIndex].map(label => {
                    const isChatAction = label === 'Chat' || label === 'Story' || label === 'Role';
                    const hasAction = label === 'Message' || label === 'Profile' || isChatAction;
                    const disabled = !hasAction || (isChatAction && !canChat);
                    const onPress = disabled ? undefined : () => this.onPressAction(label);
                    return renderActionButton({ label, disabled, onPress });
                  })}
                  {renderActionButton({
                    label: 'More',
                    disabled: false,
                    onPress: this.cycleActionPage,
                  })}
                </View>
              </View>
            ) : (
              <View style={styles.spaceActionRow}>
                {canChat ? (
                  <TouchableOpacity style={styles.spaceActionButton} onPress={this.onChat}>
                    <Text style={styles.spaceActionText}>{namespaceText('Message')}</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[styles.spaceActionButton, styles.spaceActionButtonDisabled]}>
                    <Text style={[styles.spaceActionText, styles.spaceActionTextDisabled]}>{namespaceText('Message')}</Text>
                  </View>
                )}
                <View style={[styles.spaceActionButton, styles.spaceActionButtonDisabled]}>
                  <Text style={[styles.spaceActionText, styles.spaceActionTextDisabled]}>{namespaceText('Link')}</Text>
                </View>
              </View>
            )}
          </View>
        </View>
      </View>
    )
  }

}

const GuestInbox = ({ navigation }) => {
  const handleOpenGuestChat = () => {
    navigation.push('GuestChat', { mode: 'guest' });
  };


  const guestSeed = 'guest_messages_card';
  const avatarColor = stringToColor(guestSeed);

  return (
    <View style={[styles.cardContainer]}>
      <TouchableOpacity activeOpacity={0.9} onPress={handleOpenGuestChat}>
        <View style={styles.neonCard}>
          <View style={styles.cardInner}>
            <View style={styles.headerRow}>
              <View style={[styles.avatarWrapper, styles.neonAvatarWrapper]}>
                <View style={[styles.fallbackAvatar, styles.guestFallbackAvatar]}>
                  <Text style={styles.guestFallbackAvatarLabel}>GM</Text>
                </View>
              </View>
              <View style={styles.titleArea}>
                <View style={styles.titleBlock}>
                  <Text
                    style={styles.cardTitleText}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    Guset Messages
                  </Text>
                  <View style={styles.levelRow}>
                    <Text style={styles.levelLabel}>{' '}</Text>
                  </View>
                </View>
                <View style={styles.actionContainer} />
              </View>
              <TouchableOpacity onPress={handleOpenGuestChat}>
                <View style={styles.arrowWrapper}>
                  <Icon name="ios-arrow-forward" size={24} color={KevaColors.actionText} style={styles.arrowIcon} />
                </View>
              </TouchableOpacity>
            </View>
            <View style={styles.accentLine} />
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
};


class MyNamespaces extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      loaded: false, changes: false, nsName: '',
      namespaceId: null, saving: false,
      isLoading: true, isModalVisible: false,
      showNSCreationModal: false,
      walletId: null,
      currentPage: 0,
      isRefreshing: false,
      createTransactionErr: null,
      inputMode: false,
      lockedFund: {},
      latestBlockHeight: undefined,
      applyServerNamespaceLoading: false,
      applyServerNamespaceAddress: null,
      applyServerNamespaceResult: null,
    };
  }

  onChangeOrder = async (order) => {
    const { dispatch } = this.props;
    dispatch(setNamespaceOrder(order));
  }

  NSCreationFinish = () => {
    return this.setState({showNSCreationModal: false});
  }

  NSCreationCancel = () => {
    return this.setState({showNSCreationModal: false});
  }

  NSCreationNext = () => {
    return this.setState({
      currentPage: this.state.currentPage + 1
    });
  }

  getNSCreationModal = () => {
    if (!this.state.showNSCreationModal) {
      return null;
    }

    const wallets = BlueApp.getWallets();
    const walletList = wallets.map((w, i) => {
      return { label: w.getLabel(), value: w.getID() }
    })

    const wallet = wallets.find(w => w.getID() == this.state.walletId);

    let selectWalletPage = (
      <View style={styles.modalNS}>
        <Text style={[styles.modalText, {textAlign: 'center', marginBottom: 20, color: KevaColors.darkText}]}>{"Choose a Wallet"}</Text>
        <RNPickerSelect
          value={this.state.walletId}
          placeholder={{}}
          useNativeAndroidPickerStyle={false}
          style={{
            inputAndroid: styles.inputAndroid,
            inputIOS: styles.inputIOS,
          }}
          onValueChange={(walletId, i) => this.setState({walletId: walletId})}
          items={walletList}
          Icon={() => <Icon name="ios-arrow-down" size={24} color={KevaColors.actionText} style={{ padding: 12 }} />}
        />
        <Text style={[styles.modalFee, {textAlign: 'center', marginTop: 10}]}>{wallet.getBalance()/100000000 + ' KVA'}</Text>
        <KevaButton
          type='secondary'
          style={{margin:10, marginTop: 40}}
          caption={'Next'}
          onPress={async () => {
            try {
              const wallet = wallets.find(w => w.getID() == this.state.walletId);
              if (!wallet) {
                throw new Error('Wallet not found.');
              }
              // Make sure it is not single address wallet.
              if (wallet.type != HDSegwitP2SHWallet.type) {
                return alert(loc.namespaces.multiaddress_wallet);
              }
              this.setState({ showNSCreationModal: true, currentPage: 1 });
              await BlueElectrum.ping();
              const { tx, namespaceId, fee } = await createKevaNamespace(wallet, FALLBACK_DATA_PER_BYTE_FEE, this.state.nsName);
              let feeKVA = fee / 100000000;
              this.setState({ showNSCreationModal: true, currentPage: 2, fee: feeKVA });
              this.namespaceTx = tx;
              this.newNamespaceId = namespaceId;
            } catch (err) {
              this.setState({createTransactionErr: loc.namespaces.namespace_creation_err + ' [' + err.message + ']'});
            }
          }}
        />
      </View>
    );

    let createNSPage = (
      <View style={styles.modalNS}>
        {
          this.state.createTransactionErr ?
            <>
              <Text style={[styles.modalText, {color: KevaColors.errColor, fontWeight: 'bold'}]}>{"Error"}</Text>
              <Text style={styles.modalErr}>{this.state.createTransactionErr}</Text>
              <KevaButton
                type='secondary'
                style={{margin:10, marginTop: 30}}
                caption={'Cancel'}
                onPress={async () => {
                  this.setState({showNSCreationModal: false, createTransactionErr: null});
                }}
              />
            </>
          :
            <>
              <Text style={[styles.modalText, {alignSelf: 'center', color: KevaColors.darkText}]}>{loc.namespaces.creating_tx}</Text>
              <Text style={styles.waitText}>{loc.namespaces.please_wait}</Text>
              <BlueLoading style={{paddingTop: 30}}/>
            </>
        }
      </View>
    );

    let confirmPage = (
      <View style={styles.modalNS}>
        <Text style={styles.modalText}>{"Transaction fee:  "}
          <Text style={styles.modalFee}>{this.state.fee + ' KVA'}</Text>
        </Text>
        <KevaButton
          type='secondary'
          style={{margin:10, marginTop: 40}}
          caption={loc.namespaces.confirm}
          onPress={async () => {
            this.setState({currentPage: 3, isBroadcasting: true});
            try {
              await BlueElectrum.ping();
              await BlueElectrum.waitTillConnected();
              if (this.isBiometricUseCapableAndEnabled) {
                if (!(await Biometric.unlockWithBiometrics())) {
                  this.setState({isBroadcasting: false});
                  return;
                }
              }
              let result = await BlueElectrum.broadcast(this.namespaceTx);
              if (result.code) {
                // Error.
                return this.setState({
                  isBroadcasting: false,
                  broadcastErr: result.message,
                });
              }
              // Wait until the namespace is available in the mempool.
              let totalWait = 0;
              while (true) {
                await this.fetchNamespaces();
                if (!this.props.namespaceList.namespaces[this.newNamespaceId]) {
                  waitPromise(2000);
                  totalWait += 2000;
                  if (totalWait > 20000) {
                    break;
                  }
                } else {
                  break;
                }
              }
              this.newNamespaceId = '';
              this.setState({isBroadcasting: false, showSkip: false});
              this.closeItemAni();
              await BlueApp.saveToDisk();
            } catch (err) {
              this.setState({isBroadcasting: false});
              console.warn(err);
            }
          }}
        />
      </View>
    );

    let broadcastPage;
    if (this.state.isBroadcasting) {
      broadcastPage = (
        <View style={styles.modalNS}>
          <Text style={styles.modalText}>{"Broadcasting Transaction ..."}</Text>
          <BlueLoading style={{paddingTop: 30}}/>
        </View>
      );
    } else if (this.state.broadcastErr) {
      broadcastPage = (
        <View style={styles.modalNS}>
          <Text style={[styles.modalText, {color: KevaColors.errColor, fontWeight: 'bold'}]}>{"Error"}</Text>
          <Text style={styles.modalErr}>{this.state.broadcastErr}</Text>
          <KevaButton
            type='secondary'
            style={{margin:10, marginTop: 30}}
            caption={'Cancel'}
            onPress={async () => {
              this.setState({showNSCreationModal: false});
            }}
          />
        </View>
      );
    } else {
      broadcastPage = (
        <View style={styles.modalNS}>
          <BlueBigCheckmark style={{marginHorizontal: 50}}/>
          <KevaButton
            type='secondary'
            style={{margin:10, marginTop: 30}}
            caption={'Done'}
            onPress={async () => {
              this.setState({
                showNSCreationModal: false,
                nsName: '',
              });
              await this.refreshNamespaces();
            }}
          />
        </View>
      );
    }

    return (
      <View>
        <StepModal
          showNext={false}
          showSkip={this.state.showSkip}
          currentPage={this.state.currentPage}
          stepComponents={[selectWalletPage, createNSPage, confirmPage, broadcastPage]}
          onFinish={this.NSCreationFinish}
          onNext={this.NSCreationNext}
          onCancel={this.NSCreationCancel}/>
      </View>
    );
  }

  onAddNamespace = () => {
    const wallets = BlueApp.getWallets();
    if (wallets.length == 0) {
      return toastError(loc.namespaces.no_wallet);
    }

    Keyboard.dismiss();
    if (!this.state.nsName || this.state.nsName.length == 0) {
      this.setState({inputMode: false});
      return;
    }

    this.setState({
      showNSCreationModal: true,
      currentPage: 0,
      showSkip: true,
      broadcastErr: null,
      isBroadcasting: false,
      fee: 0,
      createTransactionErr: null,
      inputMode: false,
      walletId: wallets[0].getID(),
    });
  }

  checkLockedFund = async () => {
    // Check if any fund locked for NFT bidding.
    const lockedFund = await BlueApp.getLockedFund();
    let lockedAmount = 0;
    for (let f of Object.keys(lockedFund)) {
      lockedAmount += lockedFund[f].fund;
    }
    this.setState({lockedFund, lockedAmount});
  }

  cleanLockedFund = async (wallets) => {
    // If utxo doesn't exist, remove it from lockedFund.
    const lockedFund = await BlueApp.getLockedFund();
    for (let key of Object.keys(lockedFund)) {
      let found = false;
      for (let w of wallets) {
        found = w.getUtxo().find(u => {
          const myKey = `${u.txId}:${u.vout}`;
          return myKey == key;
        });
        if (found) {
          break;
        }
      }

      if (!found) {
        delete lockedFund[key];
      }
    }
    await BlueApp.saveAllLockedFund(lockedFund);
  }

  updateLatestBlockHeight = async () => {
    try {
      const height = await BlueElectrum.blockchainBlock_count();
      if (Number.isFinite(height)) {
        this.setState({ latestBlockHeight: height });
      }
    } catch (err) {
      console.warn('MyNamespaces: failed to fetch latest block height', err);
    }
  }

  getApplyNamespaceAddress = async () => {
    const wallets = BlueApp.getWallets();
    const wallet = wallets && wallets[0];
    if (!wallet) {
      throw new Error('No wallet');
    }
    const address = wallet.getAddressAsync ? await wallet.getAddressAsync() : wallet.getAddress();
    if (!address) {
      throw new Error('No wallet address');
    }
    return address;
  }

  restoreCachedServerNamespaceResult = async () => {
    try {
      const address = await this.getApplyNamespaceAddress();
      const cached = await getCachedServerNamespaceResult(address);
      if (cached) {
        this.setState({ applyServerNamespaceAddress: address, applyServerNamespaceResult: cached });
      }
    } catch (err) {
      // No wallet yet is fine unless the user actively asks to apply.
    }
  }

  consumeApplyServerNamespaceParam = () => {
    if (this.props.navigation && this.props.navigation.getParam('applyServerNamespace')) {
      this.props.navigation.setParams({ applyServerNamespace: false });
      this.onApplyServerNamespace();
    }
  }

  onApplyServerNamespace = async () => {
    if (this.state.applyServerNamespaceLoading) {
      return;
    }
    this.setState({ applyServerNamespaceLoading: true });
    try {
      const address = await this.getApplyNamespaceAddress();
      const cached = await getCachedServerNamespaceResult(address);
      if (cached && (cached.status === 'sent' || cached.status === 'already_sent')) {
        this.setState({ applyServerNamespaceAddress: address, applyServerNamespaceResult: cached });
        await setSatoshiStatus('ready');
        Toast.show('Namespace ready', { position: Toast.positions.TOP, backgroundColor: '#53DD6C' });
        await this.refreshNamespaces();
        await BlueApp.saveToDisk();
        return;
      }

      const result = await requestServerNamespace(address);
      this.setState({ applyServerNamespaceAddress: address, applyServerNamespaceResult: result });
      if (result.status === 'sent' || result.status === 'already_sent') {
        await setSatoshiStatus('ready');
        Toast.show('Namespace ready', { position: Toast.positions.TOP, backgroundColor: '#53DD6C' });
        await this.refreshNamespaces();
        await BlueApp.saveToDisk();
      } else if (result.status === 'processing') {
        await setSatoshiStatus('requesting');
        Toast.show('处理中', { position: Toast.positions.TOP });
      } else {
        await setSatoshiStatus('unavailable');
        toastError(result.message || result.status || 'Namespace request failed');
      }
    } catch (err) {
      await setSatoshiStatus('unavailable');
      toastError(err.message || 'Namespace request failed');
    } finally {
      this.setState({ applyServerNamespaceLoading: false });
    }
  }

  fetchNamespaces = async () => {
    const { dispatch } = this.props;
    const wallets = BlueApp.getWallets();
    let namespaces = {};
    await BlueElectrum.ping();
    for (let w of wallets) {
      const ns = await findMyNamespaces(w, BlueElectrum);
      namespaces = {...namespaces, ...ns};
    }

    const order = this.props.namespaceList.order;
    // Remove the order that are not in the namespace list.
    let newOrder = order.filter(nsid => namespaces[nsid]);
    for (let id of Object.keys(namespaces)) {
      if (!newOrder.find(nsid => nsid == id)) {
        newOrder.unshift(id);
      }
    }

    await this.cleanLockedFund(wallets);
    await this.checkLockedFund();
    dispatch(setNamespaceList(namespaces, newOrder));
  }

  async componentDidMount() {

    _g_cleanLockedFund = async () => {
      const wallets = BlueApp.getWallets();
      await this.cleanLockedFund(wallets);
    }

    _g_checkLockedFund = async () => {
      await this.checkLockedFund();
    }

    try {
      await this.fetchNamespaces();
    } catch (err) {
      toastError('Cannot fetch namespaces');
      console.error(err);
    }
    await this.updateLatestBlockHeight();
    await this.restoreCachedServerNamespaceResult();
    this.isBiometricUseCapableAndEnabled = await Biometric.isBiometricUseCapableAndEnabled();

    this.consumeApplyServerNamespaceParam();
  }

  componentDidUpdate(prevProps) {
    if (prevProps.applyServerNamespaceRequestKey !== this.props.applyServerNamespaceRequestKey) {
      this.onApplyServerNamespace();
      return;
    }
    this.consumeApplyServerNamespaceParam();
  }

  refreshNamespaces = async () => {
    this.setState({isRefreshing: true});
    try {
      clearNamespaceAlphaCache();
      await BlueElectrum.ping();
      await this.fetchNamespaces();
      await this.updateLatestBlockHeight();
    } catch (err) {
      console.error(err);
    } finally {
      this.setState({isRefreshing: false});
    }
  }

  openItemAni = () => {
    LayoutAnimation.configureNext({
      duration: 100,
      update: {type: LayoutAnimation.Types.easeInEaseOut}
    });
    this.setState({inputMode: true});
  }

  closeItemAni = () => {
    LayoutAnimation.configureNext({
      duration: 100,
      update: {type: LayoutAnimation.Types.easeInEaseOut}
    });
    this.setState({inputMode: false, nsName: ''});
    this._inputRef && this._inputRef.blur();
    this._inputRef && this._inputRef.clear();
  }

  onLockedChange = async () => {
    await this.checkLockedFund();
  }

  onManageLockedFund = () => {
    this.props.navigation.push('ManageLocked', {
      lockedFund: this.state.lockedFund,
      onLockedChange: this.onLockedChange,
    });
  }

  render() {
    const { navigation, namespaceList, onInfo, onWait, avatarRefreshKey } = this.props;
    const canAdd = this.state.nsName && this.state.nsName.length > 0;
    const inputMode = this.state.inputMode;
    const hasLockedFund = this.state.lockedAmount > 0;
    return (
      <View style={styles.container}>
        {this.getNSCreationModal()}
        <View style={styles.inputContainer}>
          <TouchableOpacity onPress={this.closeItemAni}>
            <Text style={[{color: KevaColors.actionText, fontSize: 16, textAlign: 'left'}, inputMode && {paddingRight: 5}]}>
              {inputMode ? loc.general.cancel : ''}
            </Text>
          </TouchableOpacity>
          <TextInput
            onFocus={this.openItemAni}
            ref={ref => this._inputRef = ref}
            onChangeText={nsName => this.setState({ nsName: nsName })}
            value={this.state.nsName}
            placeholder={loc.namespaces.namespace_name}
            multiline={false}
            underlineColorAndroid='rgba(0,0,0,0)'
            returnKeyType={ 'done' }
            style={styles.textInput}
            onEndEditing={this.onAddNamespace}
            clearButtonMode='while-editing'
          />
          {this.state.saving ?
            <ActivityIndicator size="small" color={KevaColors.actionText} style={{ width: 42, height: 42 }} />
            :
            <TouchableOpacity onPress={this.onAddNamespace} disabled={!canAdd}>
              <Icon name={'md-add'}
                    style={[styles.addIcon, !canAdd && {color: KevaColors.inactiveText}]}
                    size={28} />
            </TouchableOpacity>
          }
        </View>
        {hasLockedFund &&
          <View style={styles.inputContainer}>
            <Text style={{fontSize: 16, marginLeft: 10, color: KevaColors.errColor}}>{this.state.lockedAmount/100000000 + ' KVA Locked'}</Text>
            <Button
              type='clear'
              buttonStyle={{alignSelf: 'center', marginRight: 10}}
              onPress={()=>{this.onManageLockedFund()}}
              icon={
                <Icon
                  name="ios-settings"
                  size={24}
                  color={KevaColors.actionText}
                />
              }
            />
          </View>
        }
        {
          (namespaceList.order.length > 0) ?
          <SortableListView
            style={styles.listStyle}
            contentContainerStyle={{paddingBottom: 400}}
            data={namespaceList.namespaces}
            order={namespaceList.order}
            onChangeOrder={this.onChangeOrder}
            refreshControl={
              <RefreshControl onRefresh={() => this.refreshNamespaces()} refreshing={this.state.isRefreshing} />
            }
            renderRow={({data, active, key}) => {
              return (
                <Namespace
                  onInfo={onInfo}
                  onWait={onWait}
                  refresh={this.refreshNamespaces}
                  data={data}
                  active={active}
                  navigation={navigation}
                  latestBlockHeight={this.state.latestBlockHeight}
                  namespaceList={namespaceList}
                  myNamespaceId={namespaceList.order[0]}
                  canChat={true}
                  avatarRefreshKey={avatarRefreshKey}
                  key={key}
                />
              );
            }}
          />
          :
          <ScrollView style={{flex: 1, paddingHorizontal: 10, paddingTop: 30}}
            contentContainerStyle={{justifyContent: 'center', alignItems: 'center'}}
            refreshControl={
              <RefreshControl onRefresh={() => this.refreshNamespaces()} refreshing={this.state.isRefreshing} />
            }
          >
            <Text style={[styles.emptyMessage, { marginBottom: 40, marginTop: 30 }]}>
              {loc.namespaces.click_add_btn}
            </Text>
            <Text style={[styles.emptyMessage, styles.help, {marginTop: 10}]}>
              {loc.namespaces.explain}
            </Text>
            <MCIcon type='material-community'
              name='chevron-double-down'
              color={KevaColors.inactiveText}
              size={60}
            />
          </ScrollView>
        }
      </View>
    );
  }

}

class OtherNamespaces extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      loaded: false, changes: false, nsName: '',
      namespaceId: null, saving: false,
      isLoading: true, isModalVisible: false,
      isRefreshing: false,
      inputMode: false,
      guestItems: [],
      guestLoading: false,
      guestOrderIndex: null,
      followedByMap: {},
      followingGuestPairs: {},
    };
  }

  onChangeOrder = async (order) => {
    const guestIndex = order.indexOf(GUEST_SECTION_KEY);
    const cleanedOrder = order.filter(id => id !== GUEST_SECTION_KEY);
    this.props.dispatch(setOtherNamespaceOrder(cleanedOrder));
    if (guestIndex >= 0) {
      await this.persistGuestOrder(guestIndex);
    }
  }

  async componentDidMount() {
    await this.loadGuestOrder();
  }

  loadGuestOrder = async () => {
    try {
      const storedIndex = await BlueApp.getItemStorage(GUEST_ORDER_STORAGE_KEY);
      const parsed = Number.parseInt(storedIndex, 10);
      if (Number.isFinite(parsed)) {
        this.setState({ guestOrderIndex: parsed });
      }
    } catch (error) {
      console.warn('Failed to load guest order', error);
    }
  }

  persistGuestOrder = async index => {
    try {
      await BlueApp.setItemStorage(GUEST_ORDER_STORAGE_KEY, String(index));
      this.setState({ guestOrderIndex: index });
    } catch (error) {
      console.warn('Failed to save guest order', error);
    }
  }

  buildOrderWithGuest = order => {
    const cleanedOrder = order.filter(id => id && id !== GUEST_SECTION_KEY);
    const maxIndex = cleanedOrder.length;
    const guestIndex = Number.isFinite(this.state.guestOrderIndex)
      ? Math.min(Math.max(this.state.guestOrderIndex, 0), maxIndex)
      : maxIndex;
    const nextOrder = [...cleanedOrder];
    nextOrder.splice(guestIndex, 0, GUEST_SECTION_KEY);
    return { nextOrder, guestIndex, cleanedOrder };
  }

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

  parseHashtagValue = item => {
    const rawValue = item?.value;
    if (!rawValue) {
      return '';
    }
    if (typeof rawValue !== 'string') {
      return this.stripChatTags(String(rawValue));
    }
    try {
      const decoded = b64decode(rawValue);
      return this.stripChatTags(decoded || rawValue);
    } catch (error) {
      return this.stripChatTags(rawValue);
    }
  };

  refreshGuestInbox = async () => {
    const { namespaceList, otherNamespaceList } = this.props;
    const myNamespaceIds = namespaceList?.order || [];
    if (!myNamespaceIds.length) {
      this.setState({ guestItems: [], followedByMap: {} });
      return;
    }
    this.setState({ guestLoading: true });
    try {
      await BlueElectrum.ping();
      await BlueElectrum.waitTillConnected();
      const reactions = [];
      for (const myNamespaceId of myNamespaceIds) {
        const myNamespace = namespaceList?.namespaces?.[myNamespaceId] || {};
        const myShortCode = myNamespace.shortCode || myNamespaceId;
        if (!myShortCode) {
          continue;
        }
        const tag = `${TAG_DM_PREFIX}${myShortCode}`;
        const response = await BlueElectrum.blockchainKeva_getHashtag(getHashtagScriptHash(tag), -1);
        const hashtagItems = Array.isArray(response) ? response : response?.hashtags || [];
        hashtagItems.forEach(item => {
          const peerNamespaceIdRaw = item.namespace;
          const peerNamespaceId = peerNamespaceIdRaw != null ? String(peerNamespaceIdRaw) : null;
          if (!peerNamespaceId) {
            return;
          }
          if (namespaceList?.namespaces?.[peerNamespaceId]) {
            return;
          }
          reactions.push({
            ...item,
            toMyNamespaceId: myNamespaceId,
            peerNamespaceId,
            peerShortCode: String(item.shortCode ?? peerNamespaceId),
            peerDisplayName: item.displayName || 'Unknown',
          });
        });
      }

      const pairMap = {};
      const followedByMap = {};
      reactions.forEach(reaction => {
        const peerNamespaceId = reaction.peerNamespaceId != null ? String(reaction.peerNamespaceId) : null;
        if (!peerNamespaceId) {
          return;
        }
        followedByMap[peerNamespaceId] = true;
        const pairId = `${String(reaction.toMyNamespaceId)}__${peerNamespaceId}`;
        const timeSeconds = reaction.time || reaction.timestamp || Date.now() / 1000;
        const lastTime = timeSeconds * 1000;
        const lastMessage = this.parseHashtagValue(reaction);
        const existing = pairMap[pairId];
        if (!existing || lastTime >= existing.lastTime) {
          pairMap[pairId] = {
            pairId,
            peerNamespaceId,
            peerShortCode: reaction.peerShortCode,
            peerDisplayName: reaction.peerDisplayName,
            toMyNamespaceId: reaction.toMyNamespaceId,
            lastMessage,
            lastTime,
          };
        }
      });

      const guestItems = Object.values(pairMap)
        .filter(item => !otherNamespaceList?.namespaces?.[String(item.peerNamespaceId)])
        .sort((a, b) => b.lastTime - a.lastTime);
      this.setState({ guestItems, followedByMap });
    } catch (error) {
      console.warn('Failed to refresh guest inbox', error);
    } finally {
      this.setState({ guestLoading: false });
    }
  };

  handleGuestFollow = async item => {
    const { otherNamespaceList, dispatch } = this.props;
    if (!item?.peerNamespaceId) {
      return;
    }
    this.setState(prevState => ({
      followingGuestPairs: { ...prevState.followingGuestPairs, [item.pairId]: true },
    }));
    try {
      await BlueElectrum.ping();
      const namespaceInfo = await getNamespaceInfo(BlueElectrum, item.peerNamespaceId, true);
      const namespaceData = {
        id: item.peerNamespaceId,
        namespaceId: item.peerNamespaceId,
        displayName: namespaceInfo?.displayName || item.peerDisplayName,
        shortCode: namespaceInfo?.shortCode || item.peerShortCode,
        price: namespaceInfo?.price,
        desc: namespaceInfo?.desc,
        addr: namespaceInfo?.addr,
        txId: namespaceInfo?.tx,
        profile: namespaceInfo?.value,
      };
      let order = [...otherNamespaceList.order];
      if (!order.find(nsid => nsid === item.peerNamespaceId)) {
        order.unshift(item.peerNamespaceId);
      }
      dispatch(setOtherNamespaceList({ [item.peerNamespaceId]: namespaceData }, order));
      const conversationId = buildConversationId(item.toMyNamespaceId, item.peerNamespaceId);
      await setConversationMetadata(conversationId, {
        peerNamespaceId: item.peerNamespaceId,
        replyFromNamespaceId: item.toMyNamespaceId,
        isMutual: true,
        boundAt: Date.now(),
      });
      await this.refreshGuestInbox();
    } catch (error) {
      console.warn('Failed to follow from guest', error);
    } finally {
      this.setState(prevState => {
        const nextMap = { ...prevState.followingGuestPairs };
        delete nextMap[item.pairId];
        return { followingGuestPairs: nextMap };
      });
    }
  };

  refreshNamespaces = async () => {
    const { dispatch, otherNamespaceList } = this.props;
    this.setState({isRefreshing: true});
    let namespaceAll = {};
    try {
      for (let ns of Object.keys(otherNamespaceList.namespaces)) {
        if (ns.length < 20) {
          continue;
        }
        const namespace = await getNamespaceInfo(BlueElectrum, ns, true);
        namespaceAll = {...namespaceAll, ...{[ns]: namespace}};
      }
      const order = otherNamespaceList.order;
      dispatch(setOtherNamespaceList(namespaceAll, order));
    } catch (err) {
      console.error(err);
      this.setState({isRefreshing: false});
    }
    this.setState({isRefreshing: false});
  }

  handleGuestRefresh = async () => {
    await this.refreshGuestInbox();
  }

  onSearchNamespace = async () => {
    const { dispatch, otherNamespaceList } = this.props;
    try {
      Keyboard.dismiss();
      if (!this.state.nsName || this.state.nsName.length == 0) {
        this.setState({inputMode: false});
        return;
      }
      this.setState({saving: true, inputMode: false});
      await BlueElectrum.ping();
      const namespace = await findOtherNamespace(BlueElectrum, this.state.nsName);
      if (!namespace) {
        throw new Error('Cannot find namespace');
      }
      const newId = Object.keys(namespace)[0];

      // Fix the order
      let order = [...otherNamespaceList.order];
      if (!order.find(nsid => nsid == newId)) {
        order.unshift(newId);
      }
      dispatch(setOtherNamespaceList(namespace, order));
      this.setState({nsName: '', saving: false});
      this.closeItemAni();
    } catch (err) {
      this.setState({saving: false});
      console.log(err)
      toastError(loc.namespaces.namespace_not_found);
    }
  }

  onDeleteConfirm = async index => {
    const {dispatch} = this.props;
    if (index === 0 && this._namespaceId) {
      LayoutAnimation.configureNext({
        duration: 300,
        update: {type: LayoutAnimation.Types.easeInEaseOut}
      });
      dispatch(deleteOtherNamespace(this._namespaceId));
      dispatch(setKeyValueList(this._namespaceId));
      await removeConversationMetadataForPeer(this._namespaceId);
    }
  }

  onDelete = namespaceId => {
    this._namespaceId = namespaceId;
    this._actionDelete.show();
  }

  openItemAni = () => {
    LayoutAnimation.configureNext({
      duration: 100,
      update: {type: LayoutAnimation.Types.easeInEaseOut}
    });
    this.setState({inputMode: true});
  }

  closeItemAni = () => {
    LayoutAnimation.configureNext({
      duration: 100,
      update: {type: LayoutAnimation.Types.easeInEaseOut}
    });
    this.setState({inputMode: false, nsName: '', isRefreshing: false});
    this._inputRef && this._inputRef.blur();
    this._inputRef && this._inputRef.clear();
  }

  render() {
    const { navigation, otherNamespaceList, onInfo, namespaceList, avatarRefreshKey } = this.props;
    const canSearch = this.state.nsName && this.state.nsName.length > 0;
    const inputMode = this.state.inputMode;
    const { guestItems, followedByMap, followingGuestPairs } = this.state;
    const hasGuestSection = true;
    const isEmpty = otherNamespaceList.order.length == 0 && guestItems.length === 0;
    const hasRows = otherNamespaceList.order.length > 0 || hasGuestSection;
    const { nextOrder, cleanedOrder } = this.buildOrderWithGuest(otherNamespaceList.order);
    const listOrder = hasGuestSection ? nextOrder : cleanedOrder;
    const listData = hasGuestSection
      ? { ...otherNamespaceList.namespaces, [GUEST_SECTION_KEY]: { id: GUEST_SECTION_KEY, isGuest: true } }
      : otherNamespaceList.namespaces;

    return (
      <View style={styles.container}>
        <ActionSheet
          ref={ref => this._actionDelete = ref}
          options={[loc.namespaces.hide, loc.general.cancel]}
          cancelButtonIndex={1}
          destructiveButtonIndex={0}
          onPress={this.onDeleteConfirm}
        />
        <View style={styles.inputContainer}>
          <TouchableOpacity onPress={this.closeItemAni}>
            <Text style={[{color: KevaColors.actionText, fontSize: 16, textAlign: 'left'}, inputMode && {paddingRight: 5}]}>
              {inputMode ? loc.general.cancel : ''}
            </Text>
          </TouchableOpacity>
          <TextInput
            onFocus={this.openItemAni}
            ref={ref => this._inputRef = ref}
            onChangeText={nsName => this.setState({ nsName: nsName })}
            value={this.state.nsName}
            placeholder={loc.namespaces.shortcode_id}
            multiline={false}
            underlineColorAndroid='rgba(0,0,0,0)'
            returnKeyType='search'
            clearButtonMode='while-editing'
            onSubmitEditing={this.onSearchNamespace}
            style={styles.textInput}
            returnKeyType={ 'done' }
            clearButtonMode='while-editing'
          />
          {this.state.saving ?
            <ActivityIndicator size="small" color={KevaColors.actionText} style={{ width: 42, height: 42 }} />
            :
            <TouchableOpacity onPress={this.onSearchNamespace} disabled={!canSearch}>
              <Icon name={'md-search'}
                    style={[styles.searchIcon, !canSearch && {color: KevaColors.inactiveText}]}
                    size={25} />
            </TouchableOpacity>
          }
        </View>
        {hasRows ?
          <SortableListView
            style={[styles.listStyle, isEmpty && {flex: 0}]}
            contentContainerStyle={(!isEmpty) && {paddingBottom: 400}}
            data={listData}
            order={listOrder}
            onChangeOrder={this.onChangeOrder}
            renderRow={({data, active}) => {
              if (data?.isGuest) {
                return (
                  <GuestInbox
                    active={active}
                    items={guestItems}
                    onFollow={this.handleGuestFollow}
                    followingPairs={followingGuestPairs}
                    navigation={navigation}
                  />
                );
              }
              const peerNamespaceId = data.id || data.namespaceId;
              const isFollowing = !!otherNamespaceList.namespaces[peerNamespaceId];
              const isFollowedBy = !!followedByMap[peerNamespaceId];
              const isMutual = isFollowing && isFollowedBy;
              return (
                <Namespace
                  onInfo={onInfo}
                  onDelete={this.onDelete}
                  data={data}
                  active={active}
                  navigation={navigation}
                  isOther={true}
                  namespaceList={namespaceList}
                  canChat={true}
                  isMutual={isMutual}
                  avatarRefreshKey={avatarRefreshKey}
                />
              );
            }}
          />
          :
          <ScrollView style={{flex: 1, paddingHorizontal: 10, paddingTop: 30}}
            contentContainerStyle={{justifyContent: 'center', alignItems: 'center'}}
          >
            <Image source={require('../../img/other_no_data.png')} style={{ width: SCREEN_WIDTH*0.33, height: SCREEN_WIDTH*0.33, marginBottom: 20 }} />
            <Text style={[styles.emptyMessage, { marginBottom: 7 }]} selectable>
              {loc.namespaces.click_search_btn}
            </Text>
          </ScrollView>
        }
      </View>
    );
  }

}

class Namespaces extends React.Component {

  static navigationOptions = ({ navigation }) => ({
    ...BlueNavigationStyle(),
    headerShown: false,
  });

  constructor(props) {
    super(props);
    this.state = {
      loaded: false, changes: false, nsName: '', namespaceId: null, saving: false ,
      isLoading: true, isModalVisible: false,
      spinning: false,
      index: 0,
      nsIsOther: false,
      nsDataAlphaValue: null,
      modalWalletAddress: '',
      namespaceUiLang: getCachedNamespaceUiLang(),
      avatarRefreshKey: 0,
      applyServerNamespaceRequestKey: 0,
      routes: [
        { key: 'first', title: loc.namespaces.my_data },
        { key: 'second', title: loc.namespaces.others }
      ]
    };
  }

  async componentDidMount() {
    const { dispatch, reactions } = this.props;
    this.focusListener = this.props.navigation.addListener('willFocus', this.handleNavigationParams);
    this.handleNavigationParams();
    InteractionManager.runAfterInteractions(async () => {
      if (!reactions.populated) {
        const allReactions = populateReactions();
        dispatch(setAllReactions(allReactions));
      }
    });
  }

  componentWillUnmount() {
    if (this.focusListener && this.focusListener.remove) {
      this.focusListener.remove();
    }
  }

  handleNavigationParams = () => {
    const { navigation } = this.props;
    const targetTab = navigation.getParam('initialTab');
    if (targetTab === 'following' && this.state.index !== 1) {
      this.setState({ index: 1 });
    }
    if (targetTab === 'me' && this.state.index !== 0) {
      this.setState({ index: 0 });
    }
    if (targetTab) {
      navigation.setParams({ initialTab: null });
    }
    if (navigation.getParam('applyServerNamespace')) {
      navigation.setParams({ applyServerNamespace: false });
      this.setState(prevState => ({
        index: 0,
        applyServerNamespaceRequestKey: prevState.applyServerNamespaceRequestKey + 1,
      }));
    }
    if (navigation.getParam('openGuest')) {
      navigation.setParams({ openGuest: false });
      navigation.push('GuestChat', { mode: 'guest' });
    }
    const openNamespaceInfo = navigation.getParam('openNamespaceInfo');
    if (openNamespaceInfo && (openNamespaceInfo.id || openNamespaceInfo.namespaceId)) {
      navigation.setParams({ openNamespaceInfo: null });
      this.onNSInfo(openNamespaceInfo, false);
    }
  };

  onNSInfo = (nsData, isOther = false) => {
    const shortCode = normalizeShortCode(nsData && nsData.shortCode);
    this.setState({
      nsData: nsData,
      codeErr: null,
      isModalVisible: true,
      nsIsOther: !!isOther,
      nsDataAlphaValue: shortCode ? getCachedAlphaValue(shortCode) : null,
      modalWalletAddress: '',
      namespaceUiLang: getCachedNamespaceUiLang(nsData),
    }, () => {
      if (shortCode) {
        this.loadModalAlphaValue(nsData);
      }
      this.loadModalNamespaceUiLanguage(nsData, true);
      this.loadModalWalletAddress(nsData);
    });
  }

  loadModalWalletAddress = async (namespace = this.state.nsData) => {
    const namespaceId = String(namespace?.namespaceId || namespace?.id || '');
    const walletId = namespace?.walletId;
    if (!walletId) {
      this.setState({ modalWalletAddress: '' });
      return;
    }

    try {
      const wallets = BlueApp.getWallets();
      const wallet = wallets.find(w => w.getID && w.getID() == walletId);
      if (!wallet) {
        this.setState({ modalWalletAddress: '' });
        return;
      }
      const address = wallet.getAddressAsync
        ? await wallet.getAddressAsync()
        : (wallet.getAddress ? wallet.getAddress() : '');
      const currentNamespaceId = String(this.state?.nsData?.namespaceId || this.state?.nsData?.id || '');
      if (namespaceId === currentNamespaceId) {
        this.setState({ modalWalletAddress: String(address || '').trim() });
      }
    } catch (error) {
      console.warn('Failed to resolve modal wallet address', error);
      this.setState({ modalWalletAddress: '' });
    }
  }

  loadModalNamespaceUiLanguage = async (namespace = this.state.nsData, force = false) => {
    const lang = await resolveNamespaceUiLanguage(namespace, force);
    const currentId = normalizeShortCode(this.state?.nsData?.shortCode) || String(this.state?.nsData?.namespaceId || this.state?.nsData?.id || '');
    const nextId = normalizeShortCode(namespace?.shortCode) || String(namespace?.namespaceId || namespace?.id || '');
    if (currentId === nextId && lang && lang !== this.state.namespaceUiLang) {
      this.setState({ namespaceUiLang: lang });
    }
  }

  loadModalAlphaValue = async (namespace = this.state.nsData) => {
    const shortCode = normalizeShortCode(namespace && namespace.shortCode);
    if (!shortCode) {
      this.setState({ nsDataAlphaValue: null });
      return;
    }
    const alphaValue = await primeNamespaceAlphaValue(shortCode);
    if (normalizeShortCode(this.state?.nsData?.shortCode) === shortCode) {
      this.setState({ nsDataAlphaValue: alphaValue });
    }
  }

  unfollowNamespace = async namespaceId => {
    const { dispatch } = this.props;
    if (!namespaceId) {
      return;
    }
    LayoutAnimation.configureNext({
      duration: 300,
      update: { type: LayoutAnimation.Types.easeInEaseOut },
    });
    dispatch(deleteOtherNamespace(namespaceId));
    dispatch(setKeyValueList(namespaceId));
    await removeConversationMetadataForPeer(namespaceId);
  }

  openEditProfileFromModal = (namespace) => {
    const { navigation } = this.props;
    if (!navigation || !namespace || !namespace.walletId || this.state.nsIsOther) {
      return;
    }
    const namespaceId = namespace.id || namespace.namespaceId;
    this.setState({ isModalVisible: false }, () => {
      navigation.navigate('EditProfile', {
        walletId: namespace.walletId,
        namespaceId,
        namespaceInfo: {
          ...namespace,
          id: namespaceId,
          namespaceId,
          displayName: namespace.displayName,
        },
      });
    });
  }

  openTransfer = (namespace) => {
    const { navigation } = this.props;
    if (!navigation || !namespace) {
      return;
    }
    this.setState({ isModalVisible: false });
    navigation.push('TransferNamespace', {
      namespaceId: namespace.id || namespace.namespaceId,
      walletId: namespace.walletId,
    });
  }

  openSellNFT = (namespace) => {
    const { navigation } = this.props;
    if (!navigation || !namespace) {
      return;
    }
    this.setState({ isModalVisible: false });
    navigation.push('SellNFT', {
      walletId: namespace.walletId,
      namespaceId: namespace.id || namespace.namespaceId,
      namespaceInfo: namespace,
    });
  }

  onClearRoleDatas = namespace => {
    const { navigation } = this.props;
    if (!navigation || !namespace) return;
    Alert.alert(
      'Initialize role data?',
      'This will clear current role state, role index, and all role cards.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            this.setState({ isModalVisible: false });
            navigation.push('AgentRole', {
              namespaceId: namespace.id || namespace.namespaceId,
              shortCode: namespace.shortCode,
              displayName: namespace.displayName,
              walletId: namespace.walletId,
              txid: namespace.txId,
              rootAddress: namespace.rootAddress,
              price: namespace.price,
              desc: namespace.desc,
              addr: namespace.addr,
              profile: namespace.profile,
              autoCommand: '/role clearall',
              suppressAutoLinkStart: true,
            });
          },
        },
      ],
    );
  }

  onClearStoryDatas = namespace => {
    const { navigation } = this.props;
    if (!navigation || !namespace) return;
    Alert.alert(
      'Clear',
      'This will clear current story data and local story cache.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            this.setState({ isModalVisible: false });
            navigation.push('AgentStory', {
              namespaceId: namespace.id || namespace.namespaceId,
              shortCode: namespace.shortCode,
              displayName: namespace.displayName,
              walletId: namespace.walletId,
              txid: namespace.txId,
              rootAddress: namespace.rootAddress,
              price: namespace.price,
              desc: namespace.desc,
              addr: namespace.addr,
              profile: namespace.profile,
              clearStoryOnMount: true,
              suppressAutoLinkStart: true,
            });
          },
        },
      ],
    );
  }
  openStoryFromModal = (namespace, options = {}) => {
    const { navigation } = this.props;
    if (!navigation || !namespace) return;
    navigation.push('AgentStory', {
      namespaceId: namespace.id || namespace.namespaceId,
      shortCode: namespace.shortCode,
      displayName: namespace.displayName,
      walletId: namespace.walletId,
      txid: namespace.txId,
      rootAddress: namespace.rootAddress,
      price: namespace.price,
      desc: namespace.desc,
      addr: namespace.addr,
      profile: namespace.profile,
      suppressAutoLinkStart: true,
      ...options,
    });
  }

  openRoleFromModal = (namespace, options = {}) => {
    const { navigation } = this.props;
    if (!navigation || !namespace) return;
    navigation.push('AgentRole', {
      namespaceId: namespace.id || namespace.namespaceId,
      shortCode: namespace.shortCode,
      displayName: namespace.displayName,
      walletId: namespace.walletId,
      txid: namespace.txId,
      rootAddress: namespace.rootAddress,
      price: namespace.price,
      desc: namespace.desc,
      addr: namespace.addr,
      profile: namespace.profile,
      suppressAutoLinkStart: true,
      roleEntrySource: 'namespace-profile-story-actions',
      ...options,
    });
  }

  onOpenStoryRecordsFromModal = namespace => {
    if (!namespace) return;
    this.setState({ isModalVisible: false }, () => {
      this.openRoleFromModal(namespace, { autoCommand: '/role story records' });
    });
  }

  onCloneStoryFromModal = namespace => {
    if (!namespace) return;
    this.setState({ isModalVisible: false }, () => {
      this.openRoleFromModal(namespace, { autoCommand: '/role story clone' });
    });
  }

  onSwitchWorldlineFromModal = namespace => {
    if (!namespace) return;
    this.setState({ isModalVisible: false }, () => {
      this.openRoleFromModal(namespace, { autoCommand: '/role story switch-worldline' });
    });
  }

  onOpenRoleMemoryFromModal = namespace => {
    if (!namespace) return;
    this.setState({ isModalVisible: false }, () => {
      this.openRoleFromModal(namespace, { autoCommand: '/role memory' });
    });
  }

  onExportRoleRecordFromModal = namespace => {
    if (!namespace) return;
    this.setState({ isModalVisible: false }, () => {
      this.openRoleFromModal(namespace, { autoCommand: '/role export' });
    });
  }

  onImportRoleRecordFromModal = namespace => {
    if (!namespace) return;
    this.setState({ isModalVisible: false }, () => {
      this.openRoleFromModal(namespace, { autoCommand: '/role import' });
    });
  }

  onCloneRoleMemoryFromModal = namespace => {
    if (!namespace) return;
    this.setState({ isModalVisible: false }, () => {
      this.openRoleFromModal(namespace, { autoCommand: '/role summary clone' });
    });
  }

  onOpenRoleLanguageFromModal = namespace => {
    if (!namespace) return;
    this.setState({ isModalVisible: false }, () => {
      this.openRoleFromModal(namespace, { autoCommand: '/role lang list' });
    });
  }

  onOpenRoleModelFromModal = namespace => {
    if (!namespace) return;
    this.setState({ isModalVisible: false }, () => {
      this.openRoleFromModal(namespace, { autoCommand: '/rolemodel' });
    });
  }

  onOpenRoleVoiceFromModal = namespace => {
    if (!namespace) return;
    this.setState({ isModalVisible: false }, () => {
      this.openRoleFromModal(namespace, { autoCommand: '/role talkmenu' });
    });
  }

  onExportStoryDatas = async namespace => {
    if (!namespace) return;
    try {
      const result = await exportStoryRecordToFile(namespace);
      const filePath = String(result && result.filePath ? result.filePath : '').trim();
      Alert.alert(
        'Export story record',
        `Story record exported.${filePath ? `\n\n${filePath}` : ''}`,
        [
          filePath ? {
            text: 'Copy Path',
            onPress: () => {
              Clipboard.setString(filePath);
              Toast.show(loc.general.copiedToClipboard, {
                position: Toast.positions.TOP,
                backgroundColor: '#53DD6C',
              });
            },
          } : null,
          { text: 'OK' },
        ].filter(Boolean),
      );
    } catch (error) {
      console.warn('Failed to export story record', error);
      toastError(`Export story failed: ${String(error && error.message ? error.message : error || 'unknown')}`);
    }
  }

  onImportStoryDatas = namespace => {
    if (!namespace) return;
    Alert.alert(
      'Import story record?',
      'This will replace the current local story record for this namespace with the selected xKEVA story export file. A backup of the current local story folder will be kept before importing.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Import',
          onPress: async () => {
            try {
              const result = await importStoryRecordFromFile(namespace);
              if (result && result.cancelled) return;
              clearNamespaceAlphaCache();
              await this.loadModalAlphaValue(namespace);
              Alert.alert(
                'Import complete',
                `Story record restored. Files imported: ${result && result.writtenCount ? result.writtenCount : 0}.`,
                [
                  { text: 'OK' },
                  {
                    text: 'Open Story',
                    onPress: () => {
                      this.setState({ isModalVisible: false }, () => {
                        this.openStoryFromModal(namespace, {
                          autoCommand: '/d continue',
                          autoCommandSource: 'story-import',
                          startStoryOnMount: true,
                        });
                      });
                    },
                  },
                ],
              );
            } catch (error) {
              if (isStoryRecordImportCancel(error)) return;
              console.warn('Failed to import story record', error);
              toastError(`Import story failed: ${String(error && error.message ? error.message : error || 'unknown')}`);
            }
          },
        },
      ],
    );
  }

  onWait = (namespaceId, displayName, refresh) => {
    this.setState({
      pendingDisplayName: displayName,
      pendingNamespaceId: namespaceId,
      refresh,
      pendingModalVisible: true,
    });
  }

  copyString = (str) => {
    Clipboard.setString(str);
    Toast.show(loc.general.copiedToClipboard, {
      position: Toast.positions.TOP,
      backgroundColor: "#53DD6C",
    });
  }

  getModalNamespaceStorageId = (namespace = this.state.nsData) => {
    const shortCode = namespace && namespace.shortCode;
    return shortCode ? String(shortCode) : '';
  }

  ensureModalLocalAvatarDir = async () => {
    const exists = await RNFS.exists(LOCAL_NAMESPACE_AVATAR_DIR);
    if (!exists) {
      await RNFS.mkdir(LOCAL_NAMESPACE_AVATAR_DIR);
    }
  }

  pickLocalAvatar = async (namespace = this.state.nsData) => {
    try {
      const storageId = this.getModalNamespaceStorageId(namespace);
      if (!storageId) {
        toastError('Shortcode required before setting local avatar');
        return;
      }
      const picked = await ImagePicker.openPicker({
        mediaType: 'photo',
        cropping: true,
        compressImageQuality: 0.9,
        forceJpg: true,
      });
      const sourcePath = picked && picked.path;
      if (!sourcePath) return;
      await this.ensureModalLocalAvatarDir();
      const targetPath = getNamespaceAvatarPath(storageId);
      if (await RNFS.exists(targetPath)) {
        await RNFS.unlink(targetPath).catch(() => {});
      }
      await RNFS.copyFile(sourcePath, targetPath);
      this.setState({ localAvatarUri: `file://${targetPath}` });
      Toast.show('Local avatar updated', {
        position: Toast.positions.TOP,
        backgroundColor: '#53DD6C',
      });
    } catch (error) {
      if (error && (String(error.code || '').includes('E_PICKER_CANCELLED') || String(error.message || '').toLowerCase().includes('cancel'))) {
        return;
      }
      console.warn('Failed to pick local avatar', error);
      toastError('Failed to set local avatar');
    }
  }

  removeLocalAvatar = async (namespace = this.state.nsData) => {
    try {
      const storageId = this.getModalNamespaceStorageId(namespace);
      if (!storageId) return;
      const path = getNamespaceAvatarPath(storageId);
      if (await RNFS.exists(path)) {
        await RNFS.unlink(path);
      }
      this.setState(prevState => ({
        localAvatarUri: null,
        avatarRefreshKey: prevState.avatarRefreshKey + 1,
      }));
      Toast.show('Local avatar removed', {
        position: Toast.positions.TOP,
        backgroundColor: '#53DD6C',
      });
    } catch (error) {
      console.warn('Failed to remove local avatar', error);
      toastError('Failed to remove local avatar');
    }
  }

  onRemoveLocalAvatarFromModal = namespace => {
    if (!namespace) return;
    Alert.alert(
      'Remove avatar?',
      'This will delete the local avatar on this device.',
      [
        { text: loc.general.cancel, style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => this.removeLocalAvatar(namespace),
        },
      ],
    );
  }

  getNSModal() {
    const nsData = this.state.nsData;
    if (!nsData) {
      return null;
    }

    const namespaceText = key => getNamespaceText(key, this.state.namespaceUiLang);
    const profileWalletAddress = String(this.state.modalWalletAddress || '').trim();
    const profileAddressText = profileWalletAddress || 'Loading wallet address...';
    const titleAvatar = getInitials(nsData.displayName || '');
    const colorAvatar = stringToColor(nsData.displayName || '');
    const modalGeneratedAvatarUri = buildHeadAssetUriCandidates(nsData.shortCode)[0] || null;
    const modalAvatarSource = this.state.localAvatarUri
      ? { uri: this.state.localAvatarUri }
      : (modalGeneratedAvatarUri ? { uri: modalGeneratedAvatarUri } : null);
    const modalAlphaValue = nsData.shortCode
      ? (this.state.nsDataAlphaValue !== null ? this.state.nsDataAlphaValue : resolveNamespaceAlphaValue(nsData.shortCode))
      : null;
    const { glowColor: modalAlphaGlowColor, glowSoftColor: modalAlphaGlowSoftColor } = getAlphaGlowDetails(modalAlphaValue);
    const modalAlphaGlowStyle = modalAlphaGlowColor ? {
      shadowColor: modalAlphaGlowColor,
      shadowOpacity: 0.95,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 0 },
      elevation: 12,
    } : null;
    const modalAlphaHaloStyle = modalAlphaGlowColor ? {
      borderColor: modalAlphaGlowColor,
      backgroundColor: modalAlphaGlowSoftColor,
      shadowColor: modalAlphaGlowColor,
      shadowOpacity: 0.78,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 0 },
      elevation: 10,
    } : null;
    return (
      <Modal style={styles.modalShow} backdrop={true}
        swipeDirection="down"
        coverScreen={false}
        onSwipeComplete={this.closeModal}
        isVisible={this.state.isModalVisible}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={this.closeModal}>
            <Text style={{color: KevaColors.actionText, fontSize: 16, paddingVertical: 5}}>
              {loc.general.close}
            </Text>
          </TouchableOpacity>
          {ModalHandle}
          <View style={{width: 44}} />
        </View>
        <ScrollView style={styles.infoModalScroll} contentContainerStyle={styles.infoModalContent}>
          <View style={styles.infoIdentityCard}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={styles.infoAvatarButton}
              onPress={() => this.pickLocalAvatar(nsData)}
              onLongPress={() => {
                if (this.state.localAvatarUri) {
                  this.onRemoveLocalAvatarFromModal(nsData);
                }
              }}
            >
              <View style={[styles.infoAvatarNeonWrapper, modalAlphaGlowStyle]}>
                {modalAlphaHaloStyle ? <View pointerEvents="none" style={[styles.infoAvatarNeonHalo, modalAlphaHaloStyle]} /> : null}
                {modalAvatarSource ? (
                  <Image source={modalAvatarSource} style={styles.infoAvatarImage} />
                ) : (
                  <View style={[styles.infoAvatarFallback, { backgroundColor: colorAvatar }]}>
                    <Text style={styles.infoAvatarFallbackLabel}>{titleAvatar}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>

            <View style={styles.infoIdentityMeta}>
              <View style={styles.infoMetaInlineRow}>
                <Text style={[styles.infoMetaLabel, styles.infoMetaInlineLabel]}>{'Name'}</Text>
                <Text style={[styles.infoMetaValue, styles.infoMetaInlineValue]} numberOfLines={1} ellipsizeMode='tail'>{nsData.displayName}</Text>
                {!this.state.nsIsOther && !!nsData.walletId ? (
                  <TouchableOpacity
                    style={styles.infoNameEditButton}
                    onPress={() => this.openEditProfileFromModal(nsData)}
                    activeOpacity={0.75}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MCIcon name="pencil-outline" size={18} color={KevaColors.actionText} />
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.infoMetaAddressRow}>
                <Text
                  style={[styles.infoMetaValue, styles.infoWalletAddressText]}
                  numberOfLines={1}
                  ellipsizeMode='tail'
                  adjustsFontSizeToFit
                  minimumFontScale={0.65}
                >{profileAddressText}</Text>
                <TouchableOpacity style={styles.inlineCopyButton} onPress={() => {this.copyString(profileWalletAddress)}}>
                  {COPY_ICON}
                </TouchableOpacity>
              </View>

              <View style={styles.infoMetaInlineRowLast}>
                <Text style={[styles.infoMetaLabel, styles.infoMetaInlineLabel]}>{'ID'}</Text>
                {nsData.shortCode ?
                  <>
                    <Text style={[styles.infoMetaValue, styles.infoMetaInlineValue]} numberOfLines={1} ellipsizeMode='tail'>{nsData.shortCode}</Text>
                    <TouchableOpacity style={styles.inlineCopyButton} onPress={() => {this.copyString(nsData.shortCode)}}>
                      {COPY_ICON}
                    </TouchableOpacity>
                  </>
                  :
                  <Text style={styles.infoMetaValue}>{loc.general.unconfirmed}</Text>
                }
              </View>
            </View>
          </View>

          {!this.state.nsIsOther && !!nsData.walletId ? (
            <View style={styles.consoleSectionCard}>
              <Text style={styles.consoleSectionTitle}>{namespaceText('agent')}</Text>
              <>
                <View style={styles.consoleActionRow}>
                  <KevaButton
                    type='secondary'
                    caption={`  ${namespaceText('avatar')}  `}
                    style={styles.consoleActionButton}
                    onPress={() => this.onRemoveLocalAvatarFromModal(nsData)}
                  />
                  <KevaButton
                    type='secondary'
                    caption={`  ${namespaceText('transfer')}  `}
                    style={styles.consoleActionButton}
                    onPress={() => this.openTransfer(nsData)}
                  />
                  <KevaButton
                    type='secondary'
                    caption={`  ${namespaceText('sell')}  `}
                    style={styles.consoleActionButton}
                    onPress={() => this.openSellNFT(nsData)}
                  />
                </View>
                <View style={styles.consoleActionRow}>
                  <KevaButton
                    type='secondary'
                    caption={`  ${namespaceText('language')}  `}
                    style={styles.consoleActionButton}
                    onPress={() => this.onOpenRoleLanguageFromModal(nsData)}
                  />
                  <KevaButton
                    type='secondary'
                    caption={`  ${namespaceText('model')}  `}
                    style={styles.consoleActionButton}
                    onPress={() => this.onOpenRoleModelFromModal(nsData)}
                  />
                  <KevaButton
                    type='secondary'
                    caption={`  ${namespaceText('voice')}  `}
                    style={styles.consoleActionButton}
                    onPress={() => this.onOpenRoleVoiceFromModal(nsData)}
                  />
                </View>
              </>
            </View>
          ) : null}

          <View style={styles.consoleSectionCard}>
            <Text style={styles.consoleSectionTitle}>{namespaceText('roleSection')}</Text>
            {!!nsData.walletId && !this.state.nsIsOther ? (
              <View style={styles.consoleActionRow}>
                <KevaButton
                  type='secondary'
                  caption={`  ${namespaceText('memory')}  `}
                  style={styles.consoleActionButton}
                  onPress={() => this.onOpenRoleMemoryFromModal(nsData)}
                />
                <KevaButton
                  type='secondary'
                  caption={`  ${namespaceText('save')}  `}
                  style={styles.consoleActionButton}
                  onPress={() => this.onExportRoleRecordFromModal(nsData)}
                />
                <KevaButton
                  type='secondary'
                  caption={`  ${namespaceText('load')}  `}
                  style={styles.consoleActionButton}
                  onPress={() => this.onImportRoleRecordFromModal(nsData)}
                />
                <KevaButton
                  type='secondary'
                  caption={`  ${namespaceText('clone')}  `}
                  style={styles.consoleActionButton}
                  onPress={() => this.onCloneRoleMemoryFromModal(nsData)}
                />
                <KevaButton
                  type='secondary'
                  caption={`  ${namespaceText('clear')}  `}
                  style={styles.consoleActionButton}
                  onPress={() => this.onClearRoleDatas(nsData)}
                />
              </View>
            ) : (
              <Text style={styles.consoleSectionHint}>{namespaceText('roleActionsOwnOnly')}</Text>
            )}
          </View>

          <View style={styles.consoleSectionCard}>
            <Text style={styles.consoleSectionTitle}>{namespaceText('storySection')}</Text>
            {!!nsData.walletId && !this.state.nsIsOther ? (
              <>
                <View style={styles.consoleActionRow}>
                  <KevaButton
                    type='secondary'
                    caption={`  ${namespaceText('save')}  `}
                    style={styles.consoleActionButton}
                    onPress={() => this.onExportStoryDatas(nsData)}
                  />
                  <KevaButton
                    type='secondary'
                    caption={`  ${namespaceText('load')}  `}
                    style={styles.consoleActionButton}
                    onPress={() => this.onImportStoryDatas(nsData)}
                  />
                  <KevaButton
                    type='secondary'
                    caption={`  ${namespaceText('records')}  `}
                    style={styles.consoleActionButton}
                    onPress={() => this.onOpenStoryRecordsFromModal(nsData)}
                  />
                  <KevaButton
                    type='secondary'
                    caption={`  ${namespaceText('clone')}  `}
                    style={styles.consoleActionButton}
                    onPress={() => this.onCloneStoryFromModal(nsData)}
                  />
                </View>
                <View style={styles.consoleActionRow}>
                  <KevaButton
                    type='secondary'
                    caption={`  ${namespaceText('timeline')}  `}
                    style={styles.consoleActionButton}
                    onPress={() => this.onSwitchWorldlineFromModal(nsData)}
                  />
                  <KevaButton
                    type='secondary'
                    caption={`  ${namespaceText('clear')}  `}
                    style={styles.consoleActionButton}
                    onPress={() => this.onClearStoryDatas(nsData)}
                  />
                </View>
              </>
            ) : null}
            {this.state.nsIsOther ? (
              <View style={styles.consoleActionRow}>
                <KevaButton
                  type='secondary'
                  caption={loc.namespaces.hide}
                  style={styles.consoleActionButton}
                  onPress={() => this.onUnfollowFromModal(nsData)}
                />
              </View>
            ) : null}
          </View>
        </ScrollView>
      </Modal>
    )
  }

  closeModal = () => {
    this.setState({ codeErr: null, isModalVisible: false, nsIsOther: false, nsDataAlphaValue: null });
  }

  onUnfollowFromModal = async nsData => {
    const namespaceId = nsData?.id || nsData?.namespaceId;
    if (!namespaceId) {
      return;
    }
    this.setState({ isModalVisible: false, nsIsOther: false });
    await this.unfollowNamespace(namespaceId);
  }

  getPendingModal() {
    const {pendingDisplayName, pendingNamespaceId, pendingModalVisible, refresh} = this.state;
    const {namespaceList} = this.props;
    if (!pendingModalVisible || !pendingNamespaceId) {
      return;
    }
    const nsData = namespaceList.namespaces[pendingNamespaceId];
    const titleStyle ={
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 5,
      color: KevaColors.darkText,
    };
    const contentStyle = {
      fontSize: 16,
      color: KevaColors.darkText,
      paddingTop: 15,
      alignSelf: 'center',
      textAlign: 'center',
    };
    const confirmStyle = {
      fontSize: 20,
      color: KevaColors.okColor,
      paddingTop: 15,
      alignSelf: 'center',
      textAlign: 'center',
    };
    return (
      <Modal style={styles.modalPending} backdrop={true}
        swipeDirection="down"
        coverScreen={false}
        onSwipeComplete={this.closePendingModal}
        isVisible={this.state.pendingModalVisible}>
        <View style={styles.modalHeader}>
          <TouchableOpacity onPress={this.closePendingModal}>
            <Text style={{color: KevaColors.actionText, fontSize: 16, paddingVertical: 5}}>
              {loc.general.close}
            </Text>
          </TouchableOpacity>
          {ModalHandle}
          <Text style={{color: '#fff', fontSize: 16}}>
              {loc.general.close}
          </Text>
        </View>
        <View style={{ marginHorizontal: 10}}>
          <Text style={titleStyle}>{pendingDisplayName}</Text>
          {!nsData.shortCode &&
            <>
              <BlueBigWait style={{marginHorizontal: 50}}/>
              <Text style={contentStyle}>{loc.namespaces.pending_confirmation}</Text>
            </>
          }
          {nsData.shortCode &&
            <>
              <BlueBigCheckmark style={{marginHorizontal: 50}}/>
              <Text style={confirmStyle}>{loc.namespaces.confirmed}</Text>
            </>
          }
          <KevaButton
            type='secondary'
            loading={this.state.checking}
            style={{margin:10, marginTop: 40}}
            caption={nsData.shortCode ? loc.general.done: loc.namespaces.check_again}
            onPress={async () => {
              if (nsData.shortCode) {
                return this.closePendingModal();
              }
              this.setState({checking: true});
              await refresh();
              this.setState({checking: false});
            }}
          />
        </View>
      </Modal>
    )
  }

  closePendingModal = () => {
    this.setState({
      pendingModalVisible: false,
      pendingDisplayName: "",
      pendingNamespaceId: "",
    });
  }

  render() {
    const { dispatch, navigation, namespaceList, otherNamespaceList } = this.props;
    const labelStyle = focused => ({
      color: focused ? KevaColors.actionText : KevaColors.inactiveText,
      margin: 0,
      fontSize: 16,
    });
    return (
      <View style={styles.screenBackground}>
        <SafeAreaView style={styles.topContainer}>
          {this.getNSModal()}
          {this.getPendingModal()}
          <TabView
            navigationState={this.state}
            renderScene={({ route }) => {
              if (route.key === 'first') {
                return <MyNamespaces dispatch={dispatch} navigation={navigation} namespaceList={namespaceList} onInfo={this.onNSInfo} onWait={this.onWait} avatarRefreshKey={this.state.avatarRefreshKey} applyServerNamespaceRequestKey={this.state.applyServerNamespaceRequestKey}/>;
              }
              if (route.key === 'second') {
                return (
                  <OtherNamespaces
                    dispatch={dispatch}
                    navigation={navigation}
                    otherNamespaceList={otherNamespaceList}
                    namespaceList={namespaceList}
                    onInfo={this.onNSInfo}
                    avatarRefreshKey={this.state.avatarRefreshKey}
                    applyServerNamespaceRequestKey={this.state.applyServerNamespaceRequestKey}
                  />
                );
              }
              return <View />;
            }}
            lazy
            removeClippedSubviews={false}
            onIndexChange={index => this.setState({ index })}
            initialLayout={{ width: Dimensions.get('window').width }}
            renderTabBar={props =>
              <TabBar
                {...props}
                renderLabel={({ route, focused }) => (
                  <Text style={labelStyle(focused)}>
                    {route.title}
                  </Text>
                )}
                indicatorStyle={{ backgroundColor: KevaColors.actionText }}
                labelStyle={{ backgroundColor: 'transparent', color: KevaColors.inactiveText }}
                style={styles.tabBar}
              />
            }
          />
        </SafeAreaView>
      </View>
    );
  }

}

function mapStateToProps(state) {
  return {
    namespaceList: state.namespaceList,
    otherNamespaceList: state.otherNamespaceList,
    reactions: state.reactions,
  }
}

export default NamespacesScreen = connect(mapStateToProps)(Namespaces)

var styles = StyleSheet.create({
  screenBackground: {
    flex: 1,
    backgroundColor: '#050505',
  },
  avatarWrapper: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  avatarNeonHalo: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    opacity: 0.85,
  },
  generatedAvatarImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    resizeMode: 'cover',
  },
  generatedAvatarContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fallbackAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestFallbackAvatar: {
    backgroundColor: '#fff',
  },
  hiddenAvatar: {
    display: 'none',
  },
  fallbackAvatarLabel: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  guestFallbackAvatarLabel: {
    color: '#0B1224',
    fontSize: 18,
    fontWeight: '700',
  },
  avatarProbe: {
    width: 1,
    height: 1,
    position: 'absolute',
    opacity: 0,
  },
  cardContainer: {
    marginHorizontal: 10,
    marginTop: 10,
    position: 'relative',
    zIndex: 0,
    elevation: 0,
  },
  neonCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    backgroundColor: '#0a0a0a',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
    overflow: 'hidden',
  },
  cardInner: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    backgroundColor: '#0d1420',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#182233',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  neonAvatarWrapper: {
    marginRight: 12,
  },
  titleArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleBlock: {
    flex: 1,
    paddingRight: 6,
  },
  topContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  sectionWrap: {
    marginBottom: 0
  },
  section: {
    backgroundColor: '#0d1420',
    borderBottomWidth: 1 / PixelRatio.get(),
    borderBottomColor: '#1b2336',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  detail: {
    color: '#7f9bb8',
    fontSize: 13,
    paddingTop: 3
  },
  sectionText: {
    color: '#d6e8ff',
    fontSize: 16,
  },
  resultText: {
    color: '#9fc2ff',
    fontSize: 15,
    top: -1,
    paddingRight: 5
  },
  listStyle: {
    flex: 1,
  },
  cardTitle: {
    flexDirection: 'row',
    alignItems: "center",
    marginHorizontal: 12,
    backgroundColor: '#0d1420',
    borderRadius: 12,
    marginTop: 14,
  },
  cardTitleText: {
    fontSize: 19,
    color: '#E0F2FE',
    paddingHorizontal: 6,
    letterSpacing: 0.3,
  },
  saleTitle: {
    color: '#7DD3FC',
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  levelLabel: {
    fontSize: 13,
    color: 'rgba(125, 211, 252, 0.9)',
    paddingHorizontal: 6,
  },
  shortCodeLevelLabel: {
    fontSize: 13,
    color: 'rgba(125, 211, 252, 0.95)',
    paddingLeft: 6,
    paddingRight: 2,
  },
  chatButton: {
    marginLeft: 6,
    backgroundColor: 'rgba(125, 211, 252, 0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chatButtonText: {
    color: '#E0F2FE',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  guestContainer: {
    backgroundColor: '#0b1224',
    borderRadius: 18,
    padding: 16,
    marginHorizontal: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#1f2a44',
  },
  guestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  guestTitle: {
    color: '#e2e8f0',
    fontSize: 18,
    fontWeight: '700',
  },
  guestRefresh: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1f2a44',
    backgroundColor: '#0f172a',
  },
  guestRefreshText: {
    color: KevaColors.actionText,
    fontSize: 13,
    fontWeight: '600',
  },
  guestEmpty: {
    color: '#6f7587',
    fontSize: 14,
  },
  guestItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#162033',
  },
  guestItemFirst: {
    borderTopWidth: 0,
  },
  guestAvatarWrapper: {
    width: 42,
    height: 42,
    borderRadius: 21,
    overflow: 'hidden',
    marginRight: 12,
  },
  guestAvatarImage: {
    width: '100%',
    height: '100%',
  },
  guestAvatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestAvatarText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  guestContent: {
    flex: 1,
    marginRight: 12,
  },
  guestName: {
    color: '#e2e8f0',
    fontSize: 15,
    fontWeight: '600',
  },
  guestMessage: {
    color: '#94a3b8',
    fontSize: 13,
    marginTop: 2,
  },
  guestFollowButton: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderColor: KevaColors.actionText,
  },
  guestFollowTitle: {
    color: KevaColors.actionText,
    fontSize: 14,
  },
  cardContent: {
    backgroundColor: '#fff',
    padding: 5
  },
  item: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    padding: 5
  },
  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginHorizontal: 12,
    marginTop: 8
  },
  actionIcon: {
    color: '#A5B4FC',
    paddingHorizontal: 10,
    paddingVertical: 10
  },
  tabBar: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    shadowOffset: { height: 0, width: 0 },
    shadowColor: 'transparent',
    elevation: 0,
    borderBottomWidth: THIN_BORDER,
    borderBottomColor: 'rgba(125, 211, 252, 0.55)',
  },
  warnAction: {
    color: KevaColors.warnColor,
  },
  arrowWrapper: {
    paddingLeft: 6,
    paddingRight: 2,
    paddingVertical: 4,
  },
  arrowIcon: {
    padding: 10,
  },
  accentLine: {
    height: 1,
    marginTop: 12,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  spaceActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 6,
    marginTop: 8,
    paddingBottom: 2,
  },
  spaceActionGrid: {
    paddingHorizontal: 6,
    marginTop: 8,
    paddingBottom: 2,
  },
  spaceActionRowMulti: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'nowrap',
    marginBottom: 6,
  },
  spaceActionButton: {
    backgroundColor: 'rgba(125, 211, 252, 0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 8,
  },
  spaceActionButtonDisabled: {
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    borderColor: 'rgba(148, 163, 184, 0.2)',
    opacity: 0.45,
  },
  spaceActionText: {
    color: '#E0F2FE',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  spaceActionTextDisabled: {
    color: 'rgba(148, 163, 184, 0.45)',
  },
  modal: {
    height: 300,
    borderRadius: 10,
    backgroundColor: '#fff',
    justifyContent: 'flex-start',
  },
  modalPending: {
    borderRadius: 10,
    backgroundColor: '#fff',
    justifyContent: 'flex-start',
    marginHorizontal: 0,
    marginVertical: 60,
    marginHorizontal: 20,
  },
  modalShow: {
    borderRadius: 10,
    backgroundColor: '#0a0f18',
    justifyContent: 'flex-start',
    marginHorizontal: 0,
    marginBottom: 0,
    android: {
      marginTop: 20,
    },
    ios: {
      marginTop: 50,
    }
  },
  modalHeader: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginBottom: 10,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: THIN_BORDER,
    borderColor: '#1b2336',
    backgroundColor: '#0a0f18',
  },
  codeErr: {
    marginTop: 20,
    marginHorizontal: 20,
    flexDirection: 'row'
  },
  codeErrText: {
    color: KevaColors.errColor
  },
  inputContainer: {
    paddingVertical: 3,
    paddingLeft: 8,
    backgroundColor: '#fff',
    borderBottomWidth: THIN_BORDER,
    borderColor: KevaColors.cellBorder,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  textInput:
  {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#f1f3f4',
    android: {
      paddingTop: 5,
      paddingBottom: 5,
    },
    ios: {
      paddingTop: 8,
      paddingBottom: 8,
    },
    paddingLeft: 7,
    paddingRight: 36,
    fontSize: 15,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderColor: KevaColors.cellBorder,
    backgroundColor: '#fff',
    height: 50
  },
  addIcon: {
    width: 42,
    height: 42,
    color: KevaColors.actionText,
    paddingVertical: 5,
    paddingHorizontal: 9,
    top: 1,
  },
  searchIcon: {
    width: 42,
    height: 42,
    color: KevaColors.actionText,
    paddingVertical: 5,
    paddingHorizontal: 9,
    android: {
      top: 4,
    },
    ios: {
      top: 3,
    }
  },
  action: {
    fontSize: 16,
    color: KevaColors.actionText,
    paddingVertical: 10
  },
  modalNS: {
    height: 300,
    alignSelf: 'center',
    justifyContent: 'flex-start',
  },
  modalText: {
    fontSize: 18,
    color: KevaColors.lightText,
  },
  waitText: {
    fontSize: 16,
    color: KevaColors.lightText,
    paddingTop: 10,
    alignSelf: 'center',
  },
  modalFee: {
    fontSize: 18,
    color: KevaColors.statusColor,
  },
  modalErr: {
    fontSize: 16,
    marginTop: 20,
  },
  transferAction: {
    marginTop: 18,
    alignSelf: 'flex-start',
  },
  transferActionRow: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
  },
  transferActionInline: {
    marginRight: 10,
  },
  infoModalScroll: {
    flexGrow: 0,
  },
  infoModalContent: {
    paddingHorizontal: 12,
    paddingBottom: 20,
    backgroundColor: '#0a0f18',
  },
  infoIdentityCard: {
    backgroundColor: '#08111f',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1f2a44',
    padding: 16,
    marginBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  infoIdentityMeta: {
    flex: 1,
    marginLeft: 14,
  },
  infoMetaRow: {
    marginBottom: 14,
  },
  infoMetaRowLast: {
    marginBottom: 0,
  },
  infoMetaInlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoMetaInlineRowLast: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
  },
  infoMetaAddressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoMetaLabel: {
    fontSize: 12,
    color: '#7DD3FC',
    fontWeight: '700',
    letterSpacing: 1.1,
    marginBottom: 5,
  },
  infoMetaValue: {
    fontSize: 16,
    color: '#E2E8F0',
  },
  infoMetaInlineLabel: {
    marginBottom: 0,
    marginRight: 6,
  },
  infoMetaInlineValue: {
    flexShrink: 1,
  },
  infoMetaValueStack: {
    flex: 1,
    alignItems: 'flex-end',
  },
  infoMetaSubValue: {
    marginTop: 4,
    color: 'rgba(226,232,240,0.72)',
    fontSize: 12,
  },
  consoleSectionCard: {
    backgroundColor: '#08111f',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1f2a44',
    padding: 16,
    marginBottom: 14,
  },
  consoleSectionTitle: {
    fontSize: 12,
    color: '#7DD3FC',
    fontWeight: '700',
    letterSpacing: 1.3,
    marginBottom: 8,
  },
  consoleSectionBody: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 20,
  },
  consoleSectionHint: {
    fontSize: 13,
    color: '#64748B',
    marginTop: 12,
  },
  consoleActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 14,
  },
  consoleActionButton: {
    marginRight: 10,
    marginBottom: 8,
  },
  infoAvatarButton: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 120,
  },
  infoAvatarNeonWrapper: {
    width: 110,
    height: 110,
    borderRadius: 55,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  infoAvatarNeonHalo: {
    position: 'absolute',
    width: 106,
    height: 106,
    borderRadius: 53,
    borderWidth: 1,
    opacity: 0.86,
  },
  infoAvatarImage: {
    width: 88,
    height: 88,
    borderRadius: 44,
  },
  infoAvatarFallback: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoAvatarFallbackLabel: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  infoAvatarHint: {
    fontSize: 13,
    color: KevaColors.actionText,
    textAlign: 'center',
  },
  infoAvatarSubHint: {
    fontSize: 11,
    color: KevaColors.lightText,
    textAlign: 'center',
    marginTop: 4,
  },
  inlineValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  inlineValueText: {
    flex: 1,
  },
  infoWalletAddressText: {
    flex: 1,
    fontSize: 12,
    letterSpacing: -0.25,
  },
  inlineCopyButton: {
    marginLeft: 'auto',
    paddingLeft: 8,
  },
  infoNameEditButton: {
    marginLeft: 6,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  emptyMessage: {
    fontSize: 18,
    color: KevaColors.inactiveText,
    textAlign: 'center',
    lineHeight: 30,
  },
  help: {
    fontSize: 16,
    alignSelf: 'center',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  inputAndroid: {
    width: SCREEN_WIDTH*0.8,
    color: KevaColors.lightText,
    textAlign: 'center',
    fontSize: 16,
    borderWidth: THIN_BORDER,
    borderColor: KevaColors.lightText,
    borderRadius: 4
  },
  inputIOS: {
    width: SCREEN_WIDTH*0.8,
    color: KevaColors.lightText,
    textAlign: 'center',
    fontSize: 16,
    borderWidth: THIN_BORDER,
    borderColor: KevaColors.lightText,
    borderRadius: 4,
    height: 46,
  },
});
