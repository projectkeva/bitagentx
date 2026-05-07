import React from 'react';
import {
  Text,
  Image,
  View,
  TouchableOpacity,
  FlatList,
  InteractionManager,
  Clipboard,
} from 'react-native';
import { Button, Image as ImagePlaceholder  } from 'react-native-elements';
const StyleSheet = require('../../PlatformStyleSheet');
const KevaButton = require('../../common/KevaButton');
const KevaColors = require('../../common/KevaColors');
import { THIN_BORDER, showStatusAlways, hideStatus, toastError } from '../../util';
import {
  BlueNavigationStyle,
  BlueLoading,
  BlueBigCheckmark,
} from '../../BlueComponents';
const loc = require('../../loc');
let BlueApp = require('../../BlueApp');
let BlueElectrum = require('../../BlueElectrum');
import { FALLBACK_DATA_PER_BYTE_FEE } from '../../models/networkTransactionFees';

import Icon from 'react-native-vector-icons/Ionicons';
import MIcon from 'react-native-vector-icons/MaterialIcons';
import ActionSheet from 'react-native-actionsheet';
import { connect } from 'react-redux'
import { createThumbnail } from "react-native-create-thumbnail";
import { setKeyValueList, setMediaInfo,
         CURRENT_KEYVALUE_LIST_VERSION, setOtherNamespaceList,
         deleteOtherNamespace,
       } from '../../actions'
import {
        getNamespaceScriptHash, parseSpecialKey,
        deleteKeyValue, getSpecialKeyText,
        getNamespaceInfoFromShortCode, decodeBase64,
        findTxIndex, getNamespaceInfo,
        } from '../../class/keva-ops';
import Toast from 'react-native-root-toast';
import StepModal from "../../common/StepModalWizard";
import { timeConverter, getInitials, stringToColor } from "../../util";
import Biometric from '../../class/biometrics';
import { extractMedia, getImageGatewayURL, removeMedia } from './mediaManager';
import { buildHeadAssetUriCandidates } from '../../common/namespaceAvatar';
import { getAlphaAvatarFrameDetails } from '../../common/alphaVisuals';
import RNFS from 'react-native-fs';
import { readStoryJsonFile, getAlphaStatePath } from './story_alpha';
import LinearGradient from 'react-native-linear-gradient';
const { calculateLevelFromShortcode } = require('../../common/shortcodeLevel');
const createHash = require('create-hash');
import { removeConversationMetadataForPeer } from './followChatStorage';
import { getCachedNamespaceUiLang, getNamespaceFilterText, resolveNamespaceUiLanguage } from './namespace_i18n';

const sha256Bytes = message => Buffer.from(createHash('sha256').update(message).digest());
const FILTER_MODES = ['TEXT', 'ROLE', 'STORY', 'ALL', 'COMMENT', 'SHARE'];

const parseKeyValueJson = value => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    return null;
  }
};

const isRoleKeyValueEntry = entry => {
  const keyText = typeof entry?.key === 'string' ? entry.key.trim() : '';
  const { keyType } = parseSpecialKey(entry?.key) || {};
  if (keyType === 'rolecard' || keyType === 'rolecard_index') {
    return true;
  }
  if (/^role\.memory\.[^.]+\.(?:name|verified|likely|fog)$/i.test(keyText)) {
    return true;
  }

  const parsedValue = parseKeyValueJson(entry?.value);
  const schema = String(parsedValue?.schema || '').trim().toLowerCase();
  if (schema === 'role_snapshot') {
    return true;
  }
  if (
    parsedValue?.role &&
    typeof parsedValue.role === 'object' &&
    (parsedValue.role.roleSlug || parsedValue.role.roleName)
  ) {
    return true;
  }
  if (
    parsedValue?.roleData &&
    typeof parsedValue.roleData === 'object' &&
    (parsedValue.roleData.roleSlug || parsedValue.roleData.roleName)
  ) {
    return true;
  }

  return false;
};

const isStoryKeyValueEntry = entry => {
  const keyText = typeof entry?.key === 'string' ? entry.key.trim() : '';
  if (
    /^(?:agentstory|story)[._:-]/i.test(keyText) ||
    /^current_(?:story|choices|summary)(?:\.json)?$/i.test(keyText)
  ) {
    return true;
  }

  const parsedValue = parseKeyValueJson(entry?.value);
  const schema = String(parsedValue?.schema || '').trim().toLowerCase();
  if (
    schema === 'story_summary_tags.v1' ||
    /^story(?:[_./-]|$)/i.test(schema) ||
    String(parsedValue?.source || '').trim().toLowerCase() === 'current_story'
  ) {
    return true;
  }
  if (
    (parsedValue?.storySessionId || parsedValue?.storyId) &&
    (Array.isArray(parsedValue?.messages) || Array.isArray(parsedValue?.choices) || parsedValue?.roleSlug)
  ) {
    return true;
  }

  return false;
};

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

const CHAT_DIR = `${RNFS.DocumentDirectoryPath}/agent_chats`;
const alphaFileValueCache = new Map();

const normalizeShortCode = shortCode => {
  if (shortCode === null || typeof shortCode === 'undefined') {
    return '';
  }
  return String(shortCode).replace(/\s+/g, '').trim();
};

const normalizeStoredAlphaValue = value => {
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
  const normalizedShortCode = normalizeShortCode(shortCode);
  if (!normalizedShortCode) return null;
  if (alphaFileValueCache.has(normalizedShortCode)) {
    return alphaFileValueCache.get(normalizedShortCode);
  }
  try {
    const alphaState = await readStoryJsonFile(getAlphaStatePath(`${CHAT_DIR}/${encodeURIComponent(normalizedShortCode)}/story`));
    const normalized = normalizeStoredAlphaValue(alphaState?.currentAlpha);
    alphaFileValueCache.set(normalizedShortCode, normalized);
    return normalized;
  } catch (error) {
    const fallbackAlpha = computeAlphaValue(normalizedShortCode);
    alphaFileValueCache.set(normalizedShortCode, fallbackAlpha);
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

const PLAY_ICON  = <MIcon name="play-arrow" size={50} color="#fff"/>;
const LOCAL_NAMESPACE_AVATAR_DIR = `${RNFS.DocumentDirectoryPath}/namespace_avatars`;
const getNamespaceAvatarPath = namespaceId => `${LOCAL_NAMESPACE_AVATAR_DIR}/${encodeURIComponent(String(namespaceId || 'unknown'))}.jpg`;
const getLocalNamespaceAvatarUri = async namespaceId => {
  if (!namespaceId) return null;
  try {
    const path = getNamespaceAvatarPath(namespaceId);
    const exists = await RNFS.exists(path);
    return exists ? `file://${path}?t=${Date.now()}` : null;
  } catch (error) {
    console.warn('Failed to resolve local namespace avatar uri', error);
    return null;
  }
};

const selectAvatarCandidateUri = (candidateUris = [], failedUris = [], generatedUri = null) => {
  if (generatedUri) return null;
  for (const candidate of candidateUris) {
    if (!candidate) continue;
    if (failedUris && failedUris.includes(candidate)) continue;
    return candidate;
  }
  return null;
};


class Item extends React.Component {

  constructor(props) {
    super(props);
    this.state = {
      loading: false,
      selectedImage: null,
      isRefreshing: false,
      thumbnail: null,
      avatarCandidateUris: [],
      avatarCandidateRequestId: 0,
      avatarFailedUris: [],
      generatedAvatarUri: null,
      localAvatarUri: null,
    };
    this._avatarRequestId = 0;
    this._avatarHandle = null;
    this._isMounted = false;
  }

  componentDidMount() {
    this._isMounted = true;
    this.loadLocalAvatar(this.getShortCode());
    this.prepareGeneratedAvatar(this.getShortCode());
    this._focusSub = this.props.navigation?.addListener?.('didFocus', () => {
      this.loadLocalAvatar(this.getShortCode());
      this.prepareGeneratedAvatar(this.getShortCode());
    });

    InteractionManager.runAfterInteractions(() => {
      this._componentDidMount();
    });
  }

  componentDidUpdate(prevProps) {
    const prevShortCode = this.getShortCode(prevProps);
    const currentShortCode = this.getShortCode();
    if (prevShortCode !== currentShortCode) {
      this.loadLocalAvatar(currentShortCode);
      this.prepareGeneratedAvatar(currentShortCode);
    }
  }

  componentWillUnmount() {
    this._isMounted = false;
    if (this._focusSub && typeof this._focusSub.remove === 'function') {
      this._focusSub.remove();
    }
    if (this._avatarHandle && typeof this._avatarHandle.cancel === 'function') {
      this._avatarHandle.cancel();
    }
    this._avatarHandle = null;
  }

  getShortCode = (props = this.props) => {
    const { item, navigation } = props;
    if (item && item.shortCode) {
      return item.shortCode;
    }
    if (
      navigation &&
      navigation.state &&
      navigation.state.params &&
      navigation.state.params.shortCode
    ) {
      return navigation.state.params.shortCode;
    }
    return null;
  }

  loadLocalAvatar = async shortCode => {
    try {
      if (!shortCode) {
        if (this._isMounted) this.setState({ localAvatarUri: null });
        return;
      }
      const uri = await getLocalNamespaceAvatarUri(shortCode);
      if (this._isMounted) {
        this.setState({ localAvatarUri: uri });
      }
    } catch (error) {
      console.warn('Failed to load keyvalues local avatar', error);
    }
  }

  prepareGeneratedAvatar = shortCode => {
    if (this._avatarHandle && typeof this._avatarHandle.cancel === 'function') {
      this._avatarHandle.cancel();
    }

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
        const prevCandidateUris = prevState.avatarCandidateUris || [];
        const sameCandidates =
          prevCandidateUris.length === candidateUris.length &&
          prevCandidateUris.every((uri, idx) => uri === candidateUris[idx]);
        return {
          avatarCandidateUris: candidateUris,
          avatarCandidateRequestId: requestId,
          avatarFailedUris: sameCandidates ? prevState.avatarFailedUris || [] : [],
          generatedAvatarUri: sameCandidates ? prevState.generatedAvatarUri : null,
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
    this.setState({
      generatedAvatarUri: uri,
      avatarFailedUris: [],
    });
  }

  onAvatarLoadError = (uri, requestId) => {
    if (!this._isMounted || requestId !== this._avatarRequestId) {
      return;
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

  onEdit = () => {
    const {navigation, item} = this.props;
    const {walletId, namespaceId} = navigation.state.params;
    navigation.navigate('AddKeyValue', {
      walletId,
      namespaceId,
      key: item.key,
      value: item.value,
    })
  }

  onClose(close) {
    close && close();
    if (this.state.selectedImage) {
      setTimeout(() => this.setState({selectedImage: null}), 50);
    }
  }

  stripHtml = str => {
    return String(str || '')
      .replace(/<\s*br\s*\/?\s*>/gi, '\n')
      .replace(/<\s*\/\s*(p|div|li|h[1-6]|blockquote|tr)\s*>/gi, '\n')
      .replace(/(<([^>]+)>)/gi, '')
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async _componentDidMount() {
    let {item, mediaInfoList, dispatch} = this.props;
    const {mediaCID, mimeType} = extractMedia(item.value);
    if (!mediaCID || !mimeType.startsWith('video')) {
      return;
    }

    const mediaInfo = mediaInfoList[mediaCID];
    if (mediaInfo) {
      this.setState({thumbnail: mediaInfo.thumbnail, width: mediaInfo.width, height: mediaInfo.height});
      return;
    }

    try {
      let response = await createThumbnail({
        url: getImageGatewayURL(mediaCID),
        timeStamp: 2000,
      });
      dispatch(setMediaInfo(mediaCID, {thumbnail: response.path, width: response.width, height: response.height}));
      this.setState({thumbnail: response.path});
    } catch (err) {
      console.warn(err);
    }
  }

  render() {
    let {item, onShow, onReply, onShare, onReward, namespaceId, displayName, navigation} = this.props;
    let {thumbnail} = this.state;
    const {isOther} = navigation.state.params;
    const {mediaCID, mimeType} = extractMedia(item.value);
    let displayKey = item.key;
    let displayValue = item.value;
    let isBid = false;
    const {keyType} = parseSpecialKey(item.key);
    if (keyType) {
      // TODO: fix this special hack for bidding.
      if (keyType == 'comment' && displayValue.startsWith('psbt')) {
        displayKey = loc.namespaces.make_offer;
        displayValue = '';
        isBid = true;
      } else {
        displayKey = getSpecialKeyText(keyType);
      }
    }
    if ((typeof displayKey) != 'string') {
      displayKey = 'Unknown ' + item.height;
    } else if (displayKey.startsWith('__WALLET_TRANSFER__')) {
      displayKey = loc.namespaces.ns_transfer_explain;
    }

    const canEdit = !isOther && item.type !== 'REG' && keyType != 'profile' && !isBid;

    const {
      avatarCandidateUris,
      avatarCandidateRequestId,
      avatarFailedUris,
      generatedAvatarUri,
      localAvatarUri,
    } = this.state;

    const avatarCandidateUri = selectAvatarCandidateUri(avatarCandidateUris, avatarFailedUris, generatedAvatarUri);
    const shouldProbeAvatar = !localAvatarUri && !!(avatarCandidateUri && avatarCandidateRequestId === this._avatarRequestId);
    const fallbackInitials = getInitials(displayName);
    const fallbackColor = stringToColor(displayName);
    const avatarSource = localAvatarUri ? { uri: localAvatarUri } : (generatedAvatarUri ? { uri: generatedAvatarUri } : undefined);
const avatarContent = avatarSource ? (
  <View style={styles.feedGeneratedAvatarContainer}>
    <Image source={avatarSource} style={styles.feedGeneratedAvatarImage} />
  </View>
) : (
  <View style={[styles.feedFallbackAvatar, { backgroundColor: fallbackColor }]}>
    <Text style={styles.feedFallbackAvatarLabel}>{fallbackInitials}</Text>
  </View>
);

    return (
      <LinearGradient
        colors={['#0b1224', '#0f162b', '#0b1224']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        <TouchableOpacity onPress={() => onShow(namespaceId, displayName, item.key, item.value, item.tx_hash, item.shares, item.likes, item.height, item.favorite)}>
          <View style={styles.cardInner}>
            <View style={styles.headerRow}>
              <Text style={styles.keyDesc} numberOfLines={1} ellipsizeMode="tail">{displayKey}</Text>
              <View style={styles.actionRow}>
                {
                  canEdit &&
                  <TouchableOpacity onPress={this.onEdit}>
                    <Icon name="ios-create" size={22} style={styles.actionIcon} />
                  </TouchableOpacity>
                }
                {
                  canEdit &&
                  <TouchableOpacity onPress={() => this.props.onDelete(namespaceId, item.key)}>
                    <Icon name="ios-trash" size={22} style={styles.actionIcon} />
                  </TouchableOpacity>
                }
                {
                  !canEdit && <View style={styles.hiddenAction}/>
                }
              </View>
            </View>
            {(item.height > 0) ?
              <Text style={styles.timestamp}>{timeConverter(item.time) + '     BLOCK ' + item.height}</Text>
              :
              <Text style={styles.timestamp}>{loc.general.unconfirmed}</Text>
            }
            <Text style={styles.valueDesc} numberOfLines={4} ellipsizeMode="tail">{this.stripHtml(removeMedia(displayValue))}</Text>
            {
              mediaCID && (
                mimeType.startsWith('video') ?
                <View style={styles.previewVideoWrapper}>
                  <Image source={{uri: thumbnail}}
                    style={styles.previewVideo}
                  />
                  <View style={styles.playIcon}>
                    {PLAY_ICON}
                  </View>
                </View>
                :
                <ImagePlaceholder style={styles.previewImage} source={{uri: getImageGatewayURL(mediaCID)}} />
              )
            }
          </View>
        </TouchableOpacity>
        <LinearGradient
          colors={['transparent', 'rgba(125, 211, 252, 0.7)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.nftAccentLine}
        />
        <View style={styles.footerActions}>
          <TouchableOpacity onPress={() => onReply(item.tx_hash)} style={styles.footerActionButton}>
            <MIcon name="chat-bubble-outline" size={22} style={styles.talkIcon} />
            {(item.replies > 0) && <Text style={styles.count}>{item.replies}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onShare(item.tx_hash, item.key, item.value, item.height)} style={styles.footerActionButton}>
            <MIcon name="cached" size={22} style={styles.shareIcon} />
            {(item.shares > 0) && <Text style={styles.count}>{item.shares}</Text>}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onReward(item.tx_hash, item.key, item.value, item.height)} style={styles.footerActionButton}>
            {
              item.favorite ?
                <MIcon name="favorite" size={22} style={[styles.shareIcon, {color: KevaColors.favorite}]} />
              :
                <MIcon name="favorite-border" size={22} style={styles.shareIcon} />
            }
            {(item.likes > 0) && <Text style={styles.count}>{item.likes}</Text> }
          </TouchableOpacity>
        </View>
      </LinearGradient>
    )
  }
}

class KeyValues extends React.Component {

  constructor(props) {
    super(props);
    const initialNamespaceContext = ((props || {}).navigation || {}).state?.params || {};
    this.state = {
      loaded: false,
      isModalVisible: false,
      currentPage: 0,
      showDeleteModal: false,
      isRefreshing: false,
      totalToFetch: 0,
      fetched: 0,
      avatarCandidateUris: [],
      avatarCandidateRequestId: 0,
      avatarFailedUris: [],
      generatedAvatarUri: null,
      localAvatarUri: null,
      latestBlockHeight: undefined,
      filterMode: 'TEXT',
      namespaceUiLanguage: getCachedNamespaceUiLang(initialNamespaceContext),
      resolvedAlphaValue: null,
      resolvedAlphaLoaded: false,
    };
    this.onEndReachedCalledDuringMomentum = true;
    this.min_tx_num = -1;
    this._avatarRequestId = 0;
    this._avatarHandle = null;
    this._isMounted = false;
  }

  cycleFilterMode = () => {
    this.setState(prevState => {
      const cur = prevState.filterMode || 'TEXT';
      const idx = FILTER_MODES.indexOf(cur);
      const next = FILTER_MODES[(idx + 1) % FILTER_MODES.length];
      return { filterMode: next };
    });
  }

  getNamespaceLanguageContext = () => {
    const params = this.props?.navigation?.state?.params || {};
    return {
      namespaceId: params.namespaceId,
      shortCode: params.shortCode,
      displayName: params.displayName,
      agentId: params.agentId,
      id: params.id,
    };
  }

  refreshNamespaceUiLanguage = async (force = false) => {
    const lang = await resolveNamespaceUiLanguage(this.getNamespaceLanguageContext(), force);
    if (!this._isMounted) {
      return lang;
    }
    if (lang && lang !== this.state.namespaceUiLanguage) {
      this.setState({ namespaceUiLanguage: lang });
    }
    return lang;
  }

  getFilterModeLabel = mode => {
    return getNamespaceFilterText(mode, this.state.namespaceUiLanguage);
  }

  static navigationOptions = ({ navigation }) => ({
    ...BlueNavigationStyle(),
    title: '',
    tabBarVisible: false,
    headerRight: () => (!navigation.state.params.isOther &&
      <View style={{flexDirection: 'row', justifyContent: 'flex-end'}}>
        <TouchableOpacity
          style={{ marginHorizontal: 5, justifyContent: 'center', alignItems: 'flex-end', position: 'relative', top: 1 }}
          onPress={() =>
            navigation.navigate('ScanQRCode', {
              launchedBy: navigation.state.routeName,
              onBarScanned: navigation.state.params.onBarCodeRead,
            })
          }
        >
          <Icon name="md-qr-scanner" size={26} color={KevaColors.actionText} />
        </TouchableOpacity>
        <TouchableOpacity
          style={{ marginHorizontal: 16, minWidth: 30, justifyContent: 'center', alignItems: 'flex-end' }}
          onPress={() =>
            navigation.navigate('AddKeyValue', {
              walletId: navigation.state.params.walletId,
              namespaceId: navigation.state.params.namespaceId,
            })
          }
        >
          <Icon name="md-add" size={30} color={KevaColors.actionText} />
        </TouchableOpacity>
      </View>
    ),
    headerStyle: { backgroundColor: '#fff', elevation:0, shadowColor: 'transparent', borderBottomWidth: THIN_BORDER, borderColor: KevaColors.cellBorder },
  });

  onDelete = (namespaceId, key) => {
    this._namespaceId = namespaceId;
    this._key = key;
    this._actionDelete.show();
  }

  deleteItem = async (namespaceId, key) => {
    const walletId = this.props.navigation.getParam('walletId');
    const wallets = BlueApp.getWallets();
    this.wallet = wallets.find(w => w.getID() == walletId);
    if (!this.wallet) {
      Toast.show('Cannot find the wallet');
      return;
    }
    this.setState({
      showDeleteModal: true,
      currentPage: 0,
      showSkip: true,
      broadcastErr: null,
      isBroadcasting: false,
      createTransactionErr: null,
      fee: 0,
    }, () => {
      setTimeout(async () => {
        try {
          const { tx, fee } = await deleteKeyValue(wallets[0], FALLBACK_DATA_PER_BYTE_FEE, namespaceId, key);
          let feeKVA = fee / 100000000;
          this.setState({ showDeleteModal: true, currentPage: 1, fee: feeKVA });
          this.deleteKeyTx = tx;
        } catch (err) {
          this.setState({createTransactionErr: err.message});
        }
      }, 800);
    });
  }

  onDeleteConfirm = index => {
    if (index === 0 && this._namespaceId && this._key) {
      this.deleteItem(this._namespaceId, this._key);
    }
  }

  progressCallback = (totalToFetch, fetched) => {
    this.setState({totalToFetch, fetched});
  }

  decodeKeyValueList = (keyValues) => {
    // Base64 decode
    let decodedKeyValues = keyValues.map(kv => {
      if (kv.displayName) {
        kv.displayName = decodeBase64(kv.displayName);
      }
      if (kv.key) {
        kv.key = decodeBase64(kv.key);
      }
      if (kv.value) {
        kv.value = Buffer.from(kv.value, 'base64').toString('utf-8');
      }
      return kv;
    });
    return decodedKeyValues;
  }

  fetchKeyValues = async (min_tx_num) => {
    const {navigation, dispatch, keyValueList, reactions} = this.props;
    let {namespaceId, shortCode} = navigation.state.params;

    let nsData;
    if (!namespaceId && shortCode) {
      // We are here because user clicks on the short code.
      // There is no namespaceId yet.
      nsData = await getNamespaceInfoFromShortCode(BlueElectrum, shortCode);
      if (!nsData) {
        return;
      }
      namespaceId = nsData.namespaceId;
      this.namespaceId = namespaceId;
      this.displayName = nsData.displayName;
    } else if (namespaceId) {
      nsData = await getNamespaceInfo(BlueElectrum, namespaceId, false);
      if (!nsData) {
        return;
      }
    }

    if (nsData && nsData.shortCode && nsData.shortCode !== shortCode) {
      shortCode = nsData.shortCode;
      navigation.setParams({ shortCode });
      this.prepareGeneratedAvatar(shortCode);
    }

    if (nsData.value) {
      const value = JSON.parse(nsData.value);
      const {price, desc, addr} = value;
      this.setState({
        price, desc, addr, saleTx: nsData.tx,
      });
    }

    const history = await BlueElectrum.blockchainKeva_getKeyValues(getNamespaceScriptHash(namespaceId), min_tx_num);
    if (history.keyvalues.length == 0) {
      return;
    }

    const keyValues = this.decodeKeyValueList(history.keyvalues);
    // Check if it is a favorite.
    for (let kv of keyValues) {
      const reaction = reactions[kv.tx_hash];
      kv.favorite = reaction && !!reaction['like'];
    }

    if (history.min_tx_num < this.min_tx_num) {
      const combined = keyValueList.keyValues[namespaceId].concat(keyValues);
      dispatch(setKeyValueList(namespaceId, combined));
    } else {
      dispatch(setKeyValueList(namespaceId, keyValues));
    }
    this.min_tx_num = history.min_tx_num;
  }

  updateLatestBlockHeight = async () => {
    try {
      const height = await BlueElectrum.blockchainBlock_count();
      if (this._isMounted && Number.isFinite(height)) {
        this.setState({ latestBlockHeight: height });
      }
    } catch (err) {
      console.warn('KeyValues: failed to fetch latest block height', err);
    }
  }

  refreshKeyValues = async (min_tx_num) => {
    try {
      this.setState({isRefreshing: true});
      await BlueElectrum.ping();
      await this.fetchKeyValues(min_tx_num);
      await this.updateLatestBlockHeight();
      this.setState({isRefreshing: false});
    } catch (err) {
      this.setState({isRefreshing: false});
      console.warn(err);
      Toast.show('Failed to fetch key values');
    }
  }

  loadMoreKeyValues = async () => {
    if(this.onEndReachedCalledDuringMomentum) {
      return;
    }
    try {
      this.setState({isLoadingMore: true});
      await BlueElectrum.ping();
      await this.fetchKeyValues(this.min_tx_num);
      this.setState({isLoadingMore: false});
      this.onEndReachedCalledDuringMomentum = true;
    } catch (err) {
      this.onEndReachedCalledDuringMomentum = true;
      this.setState({isLoadingMore: false});
      console.warn(err);
      Toast.show('Failed to fetch key values');
    }
  }

  getCurrentWallet = () => {
    const walletId = this.props.navigation.getParam('walletId');
    const wallets = BlueApp.getWallets();
    const wallet = wallets.find(w => w.getID() == walletId);
    return wallet;
  }

  prepareGeneratedAvatar = shortCode => {
    if (this._avatarHandle && typeof this._avatarHandle.cancel === 'function') {
      this._avatarHandle.cancel();
    }

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
        const prevCandidateUris = prevState.avatarCandidateUris || [];
        const sameCandidates =
          prevCandidateUris.length === candidateUris.length &&
          prevCandidateUris.every((uri, idx) => uri === candidateUris[idx]);
        return {
          avatarCandidateUris: candidateUris,
          avatarCandidateRequestId: requestId,
          avatarFailedUris: sameCandidates ? prevState.avatarFailedUris || [] : [],
          generatedAvatarUri: sameCandidates ? prevState.generatedAvatarUri : null,
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
    this.setState({
      generatedAvatarUri: uri,
      avatarFailedUris: [],
    });
  }

  onAvatarLoadError = (uri, requestId) => {
    if (!this._isMounted || requestId !== this._avatarRequestId) {
      return;
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

  async componentDidMount() {
    this._isMounted = true;
    await this.refreshNamespaceUiLanguage(true);
    // NFT sale info.
    let {price, desc, addr, txid} = this.props.navigation.state.params;
    this.setState({price, desc, addr, saleTx: txid});

    // Check the version of redux store KeyValue list version.
    // If not matched, nuke it and start over again.
    let {keyValueList, dispatch} = this.props;
    if (keyValueList.version != CURRENT_KEYVALUE_LIST_VERSION) {
      // Older version data, remove all of them.
      dispatch(setKeyValueList());
    }

    try {
      await this.refreshKeyValues(-1);
    } catch (err) {
      Toast.show("Cannot fetch key-values");
    }
    this.isBiometricUseCapableAndEnabled = await Biometric.isBiometricUseCapableAndEnabled();

    this.props.navigation.setParams({
      onBarCodeRead: this.onBarCodeRead,
    });

    const focusKey = String((this.props.navigation.state.params || {}).focusKey || '').trim();
    if (focusKey) {
      InteractionManager.runAfterInteractions(() => {
        const namespaceId = this.props.navigation?.state?.params?.namespaceId;
        const displayName = this.props.navigation?.state?.params?.displayName;
        const list = this.props?.keyValueList?.keyValues?.[namespaceId] || [];
        const target = list.find(item => String(item?.key || '').trim() === focusKey);
        if (target) {
          this.onShow(namespaceId, displayName, target.key, target.value, target.tx_hash, target.shares, target.likes, target.height, target.favorite);
        }
      });
    }

    const params = this.props.navigation.state.params || {};
    this.prepareGeneratedAvatar(params.shortCode);
    this.loadLocalAvatar(params.shortCode);
    this.loadResolvedAlphaValue(params.shortCode);
    this._focusSub = this.props.navigation?.addListener?.('didFocus', () => {
      const shortCode = this.getShortCode();
      this.refreshNamespaceUiLanguage(true);
      this.loadLocalAvatar(shortCode);
      this.prepareGeneratedAvatar(shortCode);
      this.loadResolvedAlphaValue(shortCode);
    });
  }

  componentDidUpdate(prevProps) {
    const prevParams = (prevProps.navigation && prevProps.navigation.state && prevProps.navigation.state.params) || {};
    const currentParams = this.props.navigation.state.params || {};
    if (prevParams.shortCode !== currentParams.shortCode) {
      this.setState({ resolvedAlphaValue: null, resolvedAlphaLoaded: false });
      this.prepareGeneratedAvatar(currentParams.shortCode);
      this.loadLocalAvatar(currentParams.shortCode);
      this.loadResolvedAlphaValue(currentParams.shortCode);
    }
    if (
      prevParams.shortCode !== currentParams.shortCode ||
      prevParams.namespaceId !== currentParams.namespaceId ||
      prevParams.agentId !== currentParams.agentId
    ) {
      this.refreshNamespaceUiLanguage(true);
    }
  }

  loadResolvedAlphaValue = async shortCode => {
    const normalizedShortCode = normalizeShortCode(shortCode || this.getShortCode());
    if (!normalizedShortCode) {
      if (this._isMounted) {
        this.setState({ resolvedAlphaValue: null, resolvedAlphaLoaded: true });
      }
      return;
    }
    const alphaValue = await primeNamespaceAlphaValue(normalizedShortCode);
    if (this._isMounted && normalizeShortCode(this.getShortCode()) === normalizedShortCode) {
      this.setState({ resolvedAlphaValue: alphaValue, resolvedAlphaLoaded: true });
    }
  }

  onBarCodeRead = data => {
    const navigation = this.props.navigation;
    InteractionManager.runAfterInteractions(() => {
      let dataJSON;
      try {
        dataJSON = JSON.parse(data);
      } catch (e) {
        alert(loc.namespaces.qr_json_error);
        return;
      }
      const {key, value} = dataJSON;
      // Check the content, it must have both key and value field.
      if (!key || !value) {
        alert(loc.namespaces.qr_error);
        return;
      }
      navigation.navigate('AddKeyValue', {
        walletId: navigation.state.params.walletId,
        namespaceId: navigation.state.params.namespaceId,
        key, value: (typeof value === 'string') ? value : JSON.stringify(value),
      })
    });
  };

  componentWillUnmount() {
    this._isMounted = false;
    if (this._focusSub && typeof this._focusSub.remove === 'function') {
      this._focusSub.remove();
    }
    if (this._avatarHandle && typeof this._avatarHandle.cancel === 'function') {
      this._avatarHandle.cancel();
    }
    this._avatarHandle = null;
    if (this.subs) {
      this.subs.forEach(sub => sub.remove());
    }
  }

  keyDeleteFinish = () => {
    return this.setState({showDeleteModal: false});
  }

  keyDeleteCancel = () => {
    return this.setState({showDeleteModal: false});
  }

  keyDeleteNext = () => {
    return this.setState({
      currentPage: this.state.currentPage + 1
    });
  }

  getDeleteModal = () => {
    if (!this.state.showDeleteModal) {
      return null;
    }

    let deleteKeyPage = (
      <View style={styles.modalDelete}>
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
                  this.setState({showDeleteModal: false, createTransactionErr: null});
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
      <View style={styles.modalDelete}>
        <Text style={styles.modalText}>{"Transaction fee:  "}
          <Text style={styles.modalFee}>{this.state.fee + ' KVA'}</Text>
        </Text>
        <KevaButton
          type='secondary'
          style={{margin:10, marginTop: 40}}
          caption={loc.namespaces.confirm}
          onPress={async () => {
            this.setState({currentPage: 2, isBroadcasting: true});
            try {
              await BlueElectrum.ping();
              await BlueElectrum.waitTillConnected();
              if (this.isBiometricUseCapableAndEnabled) {
                if (!(await Biometric.unlockWithBiometrics())) {
                  this.setState({isBroadcasting: false});
                  return;
                }
              }
              let result = await BlueElectrum.broadcast(this.deleteKeyTx);
              if (result.code) {
                // Error.
                return this.setState({
                  isBroadcasting: false,
                  broadcastErr: result.message,
                });
              }
              await BlueApp.saveToDisk();
              this.setState({isBroadcasting: false, showSkip: false});
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
        <View style={styles.modalDelete}>
          <Text style={styles.modalText}>{"Broadcasting Transaction ..."}</Text>
          <BlueLoading style={{paddingTop: 30}}/>
        </View>
      );
    } else if (this.state.broadcastErr) {
      broadcastPage = (
        <View style={styles.modalDelete}>
          <Text style={[styles.modalText, {color: KevaColors.errColor, fontWeight: 'bold'}]}>{"Error"}</Text>
          <Text style={styles.modalErr}>{this.state.broadcastErr}</Text>
          <KevaButton
            type='secondary'
            style={{margin:10, marginTop: 30}}
            caption={'Cancel'}
            onPress={async () => {
              this.setState({showDeleteModal: false});
            }}
          />
        </View>
      );
    } else {
      broadcastPage = (
        <View style={styles.modalDelete}>
          <BlueBigCheckmark style={{marginHorizontal: 50}}/>
          <KevaButton
            type='secondary'
            style={{margin:10, marginTop: 30}}
            caption={'Done'}
            onPress={async () => {
              this.setState({
                showDeleteModal: false,
              });
              await this.refreshKeyValues(-1);
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
          stepComponents={[deleteKeyPage, confirmPage, broadcastPage]}
          onFinish={this.keyDeleteFinish}
          onNext={this.keyDeleteNext}
          onCancel={this.keyDeleteCancel}/>
      </View>
    );
  }

  onShow = (namespaceId, displayName, key, value, tx, shares, likes, height, favorite) => {
    const {dispatch, navigation, keyValueList} = this.props;
    const isOther = navigation.getParam('isOther');
    const shortCode = navigation.getParam('shortCode');
    const index = findTxIndex(keyValueList.keyValues[namespaceId], tx);
    navigation.push('ShowKeyValue', {
      namespaceId,
      index,
      type: 'keyvalue',
      shortCode,
      displayName,
      replyTxid: tx,
      shareTxid: tx,
      rewardTxid: tx,
      isOther,
      height,
    });
  }

  onReply = (replyTxid) => {
    const {navigation, namespaceList, keyValueList} = this.props;
    let {namespaceId} = navigation.state.params;
    if (!namespaceId) {
      // Try the resolved one.
      namespaceId = this.namespaceId;
    }
    // Must have a namespace.
    if (Object.keys(namespaceList).length == 0) {
      toastError(loc.namespaces.create_namespace_first);
      return;
    }

    const index = findTxIndex(keyValueList.keyValues[namespaceId], replyTxid);
    if (index < 0) {
      return;
    }

    navigation.navigate('ReplyKeyValue', {
      namespaceId,
      index,
      type: 'keyvalue',
      replyTxid,
    })
  }

  onShare = (shareTxid, key, value) => {
    const {navigation, namespaceList, keyValueList} = this.props;
    let {namespaceId} = navigation.state.params;
    if (!namespaceId) {
      // Try the resolved one.
      namespaceId = this.namespaceId;
    }
    // Must have a namespace.
    if (Object.keys(namespaceList).length == 0) {
      toastError(loc.namespaces.create_namespace_first);
      return;
    }

    const index = findTxIndex(keyValueList.keyValues[namespaceId], shareTxid);
    if (index < 0) {
      return;
    }

    navigation.navigate('ShareKeyValue', {
      namespaceId,
      index,
      type: 'keyvalue',
      shareTxid,
      origKey: key,
      origValue: value
    })
  }

  onReward = (rewardTxid, key, value, height) => {
    const {navigation, namespaceList, keyValueList} = this.props;
    let {namespaceId} = navigation.state.params;
    if (!namespaceId) {
      // Try the resolved one.
      namespaceId = this.namespaceId;
    }
    // Must have a namespace.
    if (Object.keys(namespaceList).length == 0) {
      toastError(loc.namespaces.create_namespace_first);
      return;
    }

    const index = findTxIndex(keyValueList.keyValues[namespaceId], rewardTxid);
    if (index < 0) {
      return;
    }

    const shortCode = navigation.getParam('shortCode');
    navigation.navigate('RewardKeyValue', {
      namespaceId,
      index,
      type: 'keyvalue',
      rewardTxid,
      origKey: key,
      origValue: value,
      origShortCode: shortCode,
      height,
    });
  }

  onEditProfile = (namespaceId, namespaceInfo) => {
    const {navigation} = this.props;
    const {walletId} = navigation.state.params;
    navigation.navigate('EditProfile', {
      walletId,
      namespaceId,
      namespaceInfo,
    });
  }

  onOpenNamespaceProfile = (namespaceId, namespaceInfo) => {
    const {navigation} = this.props;
    if (!navigation || !namespaceId) {
      return;
    }
    const isOther = navigation.getParam('isOther');
    navigation.navigate('Namespaces', {
      initialTab: isOther ? 'following' : 'me',
      openNamespaceInfo: {
        ...namespaceInfo,
        id: namespaceId,
        namespaceId,
      },
    });
  }

  onUnfollow = (namespaceId) => {
    const {dispatch} = this.props;
    dispatch(deleteOtherNamespace(namespaceId));
    removeConversationMetadataForPeer(namespaceId);
  }

  onFollow = (namespaceId, namespaceInfo) => {
    const {otherNamespaceList, dispatch} = this.props;
    let order = [...otherNamespaceList.order];
    if (!order.find(nsid => nsid == namespaceId)) {
      order.unshift(namespaceId);
    }
    dispatch(setOtherNamespaceList(namespaceInfo, order));
  }

  copyString = str => {
    Clipboard.setString(str);
    Toast.show(loc.general.copiedToClipboard, {
      position: Toast.positions.TOP,
      backgroundColor: "#53DD6C",
    });
  }

  processKeyValueList = (origkeyValues) => {
    // Merge the results.
    let keyValues = [];
    const reverseKV = origkeyValues.slice().reverse();
    for (let kv of reverseKV) {
      if (kv.type === 'PUT') {
        // Override the existing one.
        const i = keyValues.findIndex(e => e.key == kv.key);
        if (i >= 0 && keyValues[i].type != 'REG') {
          keyValues[i] = kv;
        } else {
          keyValues.push(kv);
        }
      } else if (kv.type === 'DEL') {
        keyValues = keyValues.filter(e => {
          if (e.type == 'REG') {
            return true;
          }
          if ((typeof e.key) != (typeof kv.key)) {
            return true;
          }
          if ((typeof e.key) == 'string') {
            return e.key != kv.key;
          } else if ((typeof e.key) == 'object') {
            return JSON.stringify(e.key.data) != JSON.stringify(kv.key.data);
          }
          return false;
        });
      } else if (kv.type === 'REG') {
        // Special treatment for namespace creation.
        keyValues.push({key: kv.displayName, value: loc.namespaces.created, ...kv});
      }
    }
    return keyValues.reverse();
  }

  onSaleCreated = () => {
    setTimeout(() => {
      this.refreshKeyValues(-1);
    }, 1000);
  }

  onSellNFT = (namespaceId, namespaceInfo) => {
    const {navigation} = this.props;
    const {walletId} = navigation.state.params;
    navigation.navigate('SellNFT', {
      walletId,
      namespaceId,
      namespaceInfo,
      onSaleCreated: this.onSaleCreated,
    });
  }

  onCancelSale = () => {
    setTimeout(() => {
      this.refreshKeyValues(-1);
    }, 1000);
  }

  onBuy = (namespaceId, displayName, saleTx, price, desc, addr, profile) => {
    const {navigation, keyValueList} = this.props;
    const {isOther, shortCode, walletId, onSoldorOffer} = navigation.state.params;
    const index = findTxIndex(keyValueList.keyValues[namespaceId], saleTx);
    navigation.push('BuyNFT', {
      walletId,
      namespaceId,
      index,
      type: 'keyvalue',
      displayName,
      shortCode,
      replyTxid: saleTx,
      isOther,
      price,
      desc,
      addr,
      profile,
      onCancelSale: this.onCancelSale,
      onSoldorOffer,
    });
  }

  render() {
    let {navigation, dispatch, keyValueList, mediaInfoList, namespaceList, otherNamespaceList} = this.props;
    let {isOther, namespaceId, displayName, shortCode, profile, walletId, txid, rootAddress, price, desc, addr} = navigation.state.params;
    if (!namespaceId) {
      namespaceId = this.namespaceId;
    }

    let namespace;
    if (!isOther) {
      namespace = namespaceList.namespaces[namespaceId];
      if (namespace) {
        displayName = namespace.displayName;
      }
    }

    if (!displayName) {
      displayName = this.displayName;
    }

    const list = keyValueList.keyValues[namespaceId] || [];
    const mergeListAll = this.processKeyValueList(list);
    let mergeList;
    if (isOther) {
      mergeList = mergeListAll.filter(m => {
        const {keyType} = parseSpecialKey(m.key);
        return !keyType || keyType === 'share';
      });
    } else {
      mergeList = mergeListAll;
    }

    const mode = this.state.filterMode || 'TEXT';
    const filteredList = (mergeList || []).filter(m => {
      if (mode === 'ALL') return true;

      const { keyType } = parseSpecialKey(m.key) || {};
      const isTransfer = (typeof m.key === 'string') && m.key.startsWith('__WALLET_TRANSFER__');
      const isReg = m.type === 'REG';

      if (mode === 'TEXT') {
        return !keyType && !isTransfer && !isReg && !isRoleKeyValueEntry(m) && !isStoryKeyValueEntry(m);
      }

      if (mode === 'ROLE') {
        return !isReg && !isTransfer && isRoleKeyValueEntry(m);
      }

      if (mode === 'STORY') {
        return !isReg && !isTransfer && isStoryKeyValueEntry(m);
      }

      if (mode === 'COMMENT') {
        return keyType === 'comment';
      }

      if (mode === 'SHARE') {
        return keyType === 'share';
      }

      return true;
    });

    const buyNFTBtn = (
      <Button
        type='solid'
        buttonStyle={{marginLeft: 5, borderRadius: 30, height: 26, width: 80, padding: 0, borderColor: KevaColors.okColor, backgroundColor: KevaColors.okColor}}
        title={ isOther ? loc.namespaces.buy_it : loc.namespaces.manage}
        titleStyle={{fontSize: 11, color: '#fff', marginLeft: 2}}
        onPress={()=>{this.onBuy(namespaceId, displayName, this.state.saleTx, this.state.price, this.state.desc, this.state.addr, profile)}}
        icon={
          <Icon
            name="ios-cart"
            size={14}
            color="#fff"
          />
        }
      />
    );
    const filterButton = (
      <Button
        type='solid'
        buttonStyle={{borderRadius: 30, height: 26, width: 88, padding: 0, borderColor: KevaColors.actionText, backgroundColor: KevaColors.actionText}}
        title={this.getFilterModeLabel(this.state.filterMode || 'TEXT')}
        titleStyle={{fontSize: 12, color: '#fff'}}
        onPress={this.cycleFilterMode}
      />
    );

    const {
      avatarCandidateUris,
      avatarCandidateRequestId,
      avatarFailedUris,
      generatedAvatarUri,
      localAvatarUri,
    } = this.state;

    const fallbackInitials = getInitials(displayName);
    const fallbackColor = stringToColor(displayName);
    const avatarSource = localAvatarUri ? { uri: localAvatarUri } : (generatedAvatarUri ? { uri: generatedAvatarUri } : undefined);
    let avatarContent;
    if (avatarSource) {
      avatarContent = (
        <View style={styles.generatedAvatarContainer}>
          <Image
            source={avatarSource}
            style={styles.generatedAvatarImage}
          />
        </View>
      );
    } else {
      avatarContent = (
        <View style={[styles.fallbackAvatar, { backgroundColor: fallbackColor }]}>
          <Text style={styles.fallbackAvatarLabel}>{fallbackInitials}</Text>
        </View>
      );
    }
    const avatarCandidateUri = selectAvatarCandidateUri(avatarCandidateUris, avatarFailedUris, generatedAvatarUri);
    const shouldProbeAvatar = !localAvatarUri && !!(avatarCandidateUri && avatarCandidateRequestId === this._avatarRequestId);
    const canEditProfile = !isOther && !this.state.price;

    let listHeader = null;
    if (mergeList) {
      const isFollowing = !!otherNamespaceList.namespaces[namespaceId];
      const namespaceInfo = {}
      namespaceInfo[namespaceId] = {
        ...(namespace || {}),
        id: namespaceId,
        namespaceId,
        displayName,
        shortCode,
        walletId: (namespace && namespace.walletId) || walletId,
        txId: (namespace && namespace.txId) || txid,
        rootAddress: (namespace && namespace.rootAddress) || rootAddress,
        price: (namespace && namespace.price) || price,
        desc: (namespace && namespace.desc) || desc,
        addr: (namespace && namespace.addr) || addr,
        profile: (namespace && namespace.profile) || profile,
      }
      const shortCodeLevel = calculateLevelFromShortcode(shortCode, {
        currentBlockHeight: this.props.latestBlockHeight,
      });
      const alphaValue = shortCode
        ? (this.state.resolvedAlphaLoaded ? this.state.resolvedAlphaValue : resolveNamespaceAlphaValue(shortCode))
        : null;
      const { frameColor: alphaGlowColor, frameSoftColor: alphaGlowSoftColor } = getAlphaAvatarFrameDetails(alphaValue);
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
      const levelLabelText = null;
      listHeader = (
        <View style={styles.container}>
          <LinearGradient
            colors={['#0b1224', '#0f162b', '#0b1224']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.keyContainer}
          >
            <View style={[styles.avatarWrapper, alphaGlowStyle]}>
              {alphaNeonHaloStyle ? <View pointerEvents="none" style={[styles.avatarNeonHalo, alphaNeonHaloStyle]} /> : null}
              {canEditProfile ? (
                <TouchableOpacity
                  onPress={() => this.onOpenNamespaceProfile(namespaceId, namespaceInfo[namespaceId])}
                  activeOpacity={0.7}
                >
                  {localAvatarUri ? (
                    <View style={styles.generatedAvatarContainer}>
                      <Image source={{ uri: localAvatarUri }} style={styles.generatedAvatarImage} />
                    </View>
                  ) : (
                    <>
                      {shouldProbeAvatar && (
                        <Image
                          source={{ uri: avatarCandidateUri }}
                          style={styles.avatarProbe}
                          onLoad={() => this.onAvatarLoadSuccess(avatarCandidateUri, avatarCandidateRequestId)}
                          onError={() => this.onAvatarLoadError(avatarCandidateUri, avatarCandidateRequestId)}
                        />
                      )}
                      {avatarContent}
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <>
                  {localAvatarUri ? (
                    <View style={styles.generatedAvatarContainer}>
                      <Image source={{ uri: localAvatarUri }} style={styles.generatedAvatarImage} />
                    </View>
                  ) : (
                    <>
                      {shouldProbeAvatar && (
                        <Image
                          source={{ uri: avatarCandidateUri }}
                          style={styles.avatarProbe}
                          onLoad={() => this.onAvatarLoadSuccess(avatarCandidateUri, avatarCandidateRequestId)}
                          onError={() => this.onAvatarLoadError(avatarCandidateUri, avatarCandidateRequestId)}
                        />
                      )}
                      {avatarContent}
                    </>
                  )}
                </>
              )}
            </View>
            <View style={{paddingRight: 10, flex: 1, flexShrink: 1, minWidth: 0}}>
              <View style={{flexDirection: 'row', marginBottom: 5}}>
                <Text
                  style={[styles.sender, styles.headerReadableName]}
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {displayName + ' '}
                </Text>
                <TouchableOpacity onPress={() => this.copyString(shortCode)}>
                  <Text style={[styles.shortCode, styles.headerReadableShortCode]}>
                    {`@${shortCode}`}
                  </Text>
                </TouchableOpacity>
              </View>
              {levelLabelText && (
                <Text style={[styles.levelLabel, styles.headerReadableMeta]}>{levelLabelText}</Text>
              )}
              {
                isOther ?
                (isFollowing ?
                  <View style={{flexDirection: 'row', alignItems: 'center', flexShrink: 1}}>
                    {filterButton}
                    <Button
                      type='solid'
                      buttonStyle={{marginLeft: 6, borderRadius: 30, height: 26, width: 92, padding: 0, borderColor: KevaColors.actionText, backgroundColor: KevaColors.actionText}}
                      title={loc.namespaces.following}
                      titleStyle={{fontSize: 12, color: '#fff'}}
                      onPress={()=>{this.onUnfollow(namespaceId)}}
                    />
                    { this.state.price && buyNFTBtn }
                  </View>
                  :
                  <View style={{flexDirection: 'row', alignItems: 'center', flexShrink: 1}}>
                    {filterButton}
                    <Button
                      type='outline'
                      buttonStyle={{marginLeft: 6, borderRadius: 30, height: 26, width: 92, padding: 0, borderColor: KevaColors.actionText}}
                      title={loc.namespaces.follow}
                      titleStyle={{fontSize: 12, color: KevaColors.actionText}}
                      onPress={()=>{this.onFollow(namespaceId, namespaceInfo)}}
                    />
                    { this.state.price && buyNFTBtn }
                  </View>
                )
                :
                (
                <View style={{flexDirection: 'row', alignItems: 'center', flexShrink: 1}}>
                  <Button
                    type='solid'
                    buttonStyle={{borderRadius: 30, height: 26, width: 88, padding: 0, borderColor: KevaColors.actionText, backgroundColor: KevaColors.actionText}}
                    title={this.getFilterModeLabel(this.state.filterMode || 'TEXT')}
                    titleStyle={{fontSize: 12, color: '#fff'}}
                    onPress={this.cycleFilterMode}
                  />
                  {this.state.price ? buyNFTBtn : null}
                </View>
                )
            }
            </View>
          </LinearGradient>
        </View>
      );
    }

    const footerLoader = this.state.isLoadingMore ? <BlueLoading style={{paddingTop: 30, paddingBottom: 400}} /> : null;
    return (
      <LinearGradient
        colors={['#050915', '#061025', '#050915']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.screenBackground}
      >
        <View style={styles.container}>
          <ActionSheet
             ref={ref => this._actionDelete = ref}
             title={'Delete this key?'}
             options={[loc.general.delete, loc.general.cancel]}
             cancelButtonIndex={1}
             destructiveButtonIndex={0}
             onPress={this.onDeleteConfirm}
          />
          {this.getDeleteModal()}
          {
            (list.length == 0) &&
            <Text style={{paddingTop: 20, alignSelf: 'center', color: KevaColors.okColor, fontSize: 16}}>
              {loc.namespaces.scanning_block} {/* this.state.fetched + ' / ' + this.state.totalToFetch */} ...
            </Text>
          }
          {
            mergeList &&
            <FlatList
              style={styles.listStyle}
              contentContainerStyle={styles.listContent}
              ListHeaderComponent={listHeader}
              data={filteredList}
              extraData={`${this.state.latestBlockHeight || ''}-${this.state.filterMode || ''}`}
              onEndReached={() => {this.loadMoreKeyValues()}}
              onEndReachedThreshold={0.5}
              onMomentumScrollBegin={() => { this.onEndReachedCalledDuringMomentum = false; }}
              onRefresh={() => this.refreshKeyValues(-1)}
              refreshing={this.state.isRefreshing}
              keyExtractor={(item, index) => item.key + index}
              ListFooterComponent={footerLoader}
              renderItem={({item, index}) =>
                <Item item={item} key={index} dispatch={dispatch} onDelete={this.onDelete}
                  onShow={this.onShow} namespaceId={namespaceId}
                  displayName={displayName}
                  onReply={this.onReply}
                  onShare={this.onShare}
                  onReward={this.onReward}
                  navigation={navigation}
                  mediaInfoList={mediaInfoList}
                  latestBlockHeight={this.state.latestBlockHeight}
                />
              }
            />
          }
        </View>
      </LinearGradient>
    );
  }

}

function mapStateToProps(state) {
  return {
    keyValueList: state.keyValueList,
    namespaceList: state.namespaceList,
    otherNamespaceList: state.otherNamespaceList,
    mediaInfoList: state.mediaInfoList,
    reactions: state.reactions,
  }
}

export default KeyValuesScreen = connect(mapStateToProps)(KeyValues);

var styles = StyleSheet.create({
  screenBackground: {
    flex: 1,
  },
  container: {
    flex:1,
    backgroundColor: 'transparent',
  },
  avatarWrapper: {
    marginRight: 20,
    alignSelf: 'center',
    width: 66,
    height: 66,
    borderRadius: 33,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'visible',
  },
  avatarNeonHalo: {
    position: 'absolute',
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 1,
    opacity: 0.85,
  },
  feedAvatarWrapper: {
    paddingRight: 10,
    paddingTop: 10,
    paddingBottom: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  generatedAvatarImage: {
    width: 46,
    height: 46,
    borderRadius: 23,
    resizeMode: 'cover',
  },
  generatedAvatarContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  feedGeneratedAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    resizeMode: 'cover',
  },
  feedGeneratedAvatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  fallbackAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedFallbackAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hiddenAvatar: {
    display: 'none',
  },
  fallbackAvatarLabel: {
    color: '#E0F2FE',
    fontSize: 18,
    fontWeight: '700',
  },
  feedFallbackAvatarLabel: {
    color: '#E0F2FE',
    fontSize: 17,
    fontWeight: '700',
  },
  avatarProbe: {
    width: 1,
    height: 1,
    position: 'absolute',
    opacity: 0,
  },
  listStyle: {
    flex: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.2)',
    backgroundColor: '#050915',
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 400,
  },
  card: {
    marginVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.32)',
    backgroundColor: 'transparent',
    shadowColor: '#7dd3fc',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    overflow: 'hidden',
  },
  cardInner: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  keyDesc: {
    flex: 1,
    fontSize:17,
    color: '#E5E7EB',
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  valueDesc: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    marginBottom: 12,
    color: '#CBD5E1'
  },
  headerRow: {
    flexDirection:'row',
    alignItems:'center',
    justifyContent:'space-between',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems:'center',
    justifyContent:'flex-start',
  },
  hiddenAction: {
    height: 40,
  },
  actionIcon: {
    color: '#93C5FD',
    paddingHorizontal: 12,
    paddingVertical: 7
  },
  talkIcon: {
    color: '#93C5FD',
    paddingRight: 4,
    paddingVertical: 7,
  },
  shareIcon: {
    color: '#93C5FD',
    paddingRight: 4,
    paddingVertical: 7
  },
  count: {
    color: '#E0F2FE',
    paddingVertical: 7,
    fontWeight: '600',
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingBottom: 10,
    paddingTop: 2,
  },
  footerActionButton: {
    flexDirection: 'row',
    marginRight: 4,
  },
  modal: {
    borderRadius:10,
    backgroundColor: KevaColors.backgroundLight,
    zIndex:999999,
    flexDirection: 'column',
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
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalDelete: {
    height: 300,
    alignSelf: 'center',
    justifyContent: 'flex-start'
  },
  modalText: {
    fontSize: 18,
    color: KevaColors.lightText,
  },
  waitText: {
    fontSize: 16,
    color: KevaColors.lightText,
    paddingTop: 10,
  },
  modalFee: {
    fontSize: 18,
    color: KevaColors.statusColor,
  },
  modalErr: {
    fontSize: 16,
    marginTop: 20,
  },
  codeErr: {
    marginTop: 10,
    marginHorizontal: 7,
    flexDirection: 'row'
  },
  codeErrText: {
    color: KevaColors.errColor
  },
  action: {
    fontSize: 17,
    paddingVertical: 10
  },
  inAction: {
    fontSize: 17,
    paddingVertical: 10,
    paddingHorizontal: 7,
    color: KevaColors.inactiveText
  },
  timestamp: {
    color: '#9CA3AF',
    fontSize: 13,
    position: 'relative',
    top: -2,
    letterSpacing: 0.2,
  },
  previewImage: {
    width: 90,
    height:90,
    alignSelf: 'flex-start',
    borderRadius: 6,
  },
  previewVideo: {
    width: 160,
    height: 120,
    alignSelf: 'flex-start',
    borderRadius: 8,
  },
  previewVideoWrapper: {
    width: 160,
    height: 120,
    marginBottom: 5,
    borderRadius: 10,
    overflow: 'hidden',
  },
  playIcon: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center'
  },
  nftAccentLine: {
    height: 2,
    marginHorizontal: 12,
    borderRadius: 20,
  },
  keyContainer: {
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.32)',
    backgroundColor: 'transparent',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    shadowColor: '#7dd3fc',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    overflow: 'hidden',
  },
  key: {
    fontSize: 16,
    color: KevaColors.darkText,
    flex: 1,
    flexWrap: 'wrap',
  },
  sender: {
    fontSize: 16,
    fontWeight: '700',
    color: KevaColors.darkText,
    lineHeight: 25,
    paddingBottom: 5,
    maxWidth: 220,
  },
  shortCode: {
    fontSize: 16,
    fontWeight: '700',
    color: KevaColors.actionText,
    lineHeight: 25,
    paddingBottom: 5,
  },
  levelLabel: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 6,
  },
  headerReadableName: {
    color: '#E5E7EB',
  },
  headerReadableShortCode: {
    color: '#93C5FD',
  },
  headerReadableMeta: {
    color: '#93C5FD',
  },
});
