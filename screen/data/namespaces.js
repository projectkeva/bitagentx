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
import { Button } from 'react-native-elements';
import { buildHeadAssetUriCandidates } from '../../common/namespaceAvatar';
const { calculateLevelFromShortcode } = require('../../common/shortcodeLevel');
const createHash = require('create-hash');

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

const COPY_ICON = (<Icon name="ios-copy" size={22} color={KevaColors.extraLightText}
                         style={{ paddingVertical: 5, paddingHorizontal: 5, position: 'relative', left: -3 }}
                  />)

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
    };

    this._avatarRequestId = 0;
    this._avatarHandle = null;
    this._isMounted = false;

    this._active = new Animated.Value(0);
    this._style = {
      ...Platform.select({
        ios: {
          transform: [{
            rotate: this._active.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -0.04],
            }),
          }],
          shadowRadius: this._active.interpolate({
            inputRange: [0, 1],
            outputRange: [2, 10],
          }),
        },

        android: {
          transform: [{
            rotate: this._active.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '-5deg'],
            }),
          }],
          elevation: this._active.interpolate({
            inputRange: [0, 1],
            outputRange: [2, 6],
          }),
        },
      }),
      opacity: this._active.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 0.7],
      }),
    };
  }

  componentDidMount() {
    this._isMounted = true;
    this.prepareGeneratedAvatar(this.props.data);
  }

  componentDidUpdate(prevProps) {
    const prevData = prevProps.data || {};
    const currentData = this.props.data || {};
    if (prevData.shortCode !== currentData.shortCode || prevData.id !== currentData.id) {
      this.prepareGeneratedAvatar(currentData);
    }
  }

  componentWillUnmount() {
    this._isMounted = false;
    if (this._avatarHandle && typeof this._avatarHandle.cancel === 'function') {
      this._avatarHandle.cancel();
    }
    this._avatarHandle = null;
  }

  onInfo = () => {
    let namespace = this.props.data;
    this.props.onInfo(namespace, this.props.isOther);
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
      Animated.timing(this._active, {
        duration: 100,
        easing: Easing.bounce,
        toValue: Number(nextProps.active),
      }).start();
    }
  }

  onWait = () => {
    const {data, onWait, refresh} = this.props;
    onWait(data.id, data.displayName, refresh);
  }

  getAvatar = name => {
    return {titleAvatar: getInitials(name), colorAvatar: stringToColor(name)}
  }

  prepareGeneratedAvatar = namespace => {
    if (this._avatarHandle && typeof this._avatarHandle.cancel === 'function') {
      this._avatarHandle.cancel();
    }

    const shortCode = namespace && namespace.shortCode;
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

  onChat = () => {
    const { data, navigation, isMutual, isOther } = this.props;
    if (!navigation || typeof navigation.push !== 'function') {
      return;
    }
    if (!this.props.canChat) {
      return;
    }
    const namespaceId = data.id || data.namespaceId;

    if (!isOther) {
      navigation.push('AgentChat', {
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
    const displayNameWithShortcode = namespace.shortCode
      ? `${namespace.displayName} @${namespace.shortCode}`
      : namespace.displayName;
    const shortCodeLevel = calculateLevelFromShortcode(namespace.shortCode, {
      currentBlockHeight: this.props.latestBlockHeight,
    });
    const alphaValue = namespace.shortCode ? computeAlphaValue(namespace.shortCode) : null;
    const alphaLabelText = Number.isFinite(alphaValue)
      ? `[ α${alphaValue > 0 ? `+${alphaValue}` : alphaValue} ]`
      : '';
    const levelLabelText = Number.isFinite(shortCodeLevel)
      ? `[ Lv.${shortCodeLevel} ]${alphaLabelText ? ` ${alphaLabelText}` : ''}`
      : null;
    const canChat = this.props.canChat;
    const {
      avatarCandidateUris,
      avatarCandidateRequestId,
      avatarFailedUris,
      generatedAvatarUri,
    } = this.state;

    const avatarCandidateUri = selectAvatarCandidateUri(avatarCandidateUris, avatarFailedUris, generatedAvatarUri);
    const shouldProbeAvatar = !!(avatarCandidateUri && avatarCandidateRequestId === this._avatarRequestId);
    const avatarSource = generatedAvatarUri ? { uri: generatedAvatarUri } : undefined;

    const avatarContent = avatarSource ? (
      <View style={styles.generatedAvatarContainer}>
        <Image source={avatarSource} style={styles.generatedAvatarImage} />
      </View>
    ) : (
      <View style={[styles.fallbackAvatar, { backgroundColor: colorAvatar }]}>
        <Text style={styles.fallbackAvatarLabel}>{titleAvatar}</Text>
      </View>
    );

    return (
      <Animated.View style={[this._style, styles.cardContainer]}>
        <LinearGradient
          colors={['#0b1224', '#0f162b', '#0b1224']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.neonCard}
        >
          <View style={styles.cardInner}>
            <View style={styles.headerRow}>
              <TouchableOpacity style={[styles.avatarWrapper, styles.neonAvatarWrapper]} onPress={this.onInfo}>
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
                <View style={styles.titleBlock}>
                  <Text
                    style={[styles.cardTitleText, isForSale && styles.saleTitle]}
                    numberOfLines={1}
                    ellipsizeMode="tail"
                  >
                    {displayNameWithShortcode}
                  </Text>
                  <View style={styles.levelRow}>
                    {levelLabelText && (
                      <Text style={styles.levelLabel}>{levelLabelText}</Text>
                    )}
                  </View>
                </View>
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
            <LinearGradient
              colors={['transparent', 'rgba(125, 211, 252, 0.65)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.accentLine}
            />
            <View style={styles.spaceActionRow}>
              <View style={[styles.spaceActionButton, styles.spaceActionButtonDisabled]}>
                <Text style={[styles.spaceActionText, styles.spaceActionTextDisabled]}>Room</Text>
              </View>
              {canChat ? (
                <TouchableOpacity style={styles.spaceActionButton} onPress={this.onChat}>
                  <Text style={styles.spaceActionText}>Chat</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.spaceActionButton, styles.spaceActionButtonDisabled]}>
                  <Text style={[styles.spaceActionText, styles.spaceActionTextDisabled]}>Chat</Text>
                </View>
              )}
              <View style={[styles.spaceActionButton, styles.spaceActionButtonDisabled]}>
                <Text style={[styles.spaceActionText, styles.spaceActionTextDisabled]}>Task</Text>
              </View>
              <View style={[styles.spaceActionButton, styles.spaceActionButtonDisabled]}>
                <Text style={[styles.spaceActionText, styles.spaceActionTextDisabled]}>Game</Text>
              </View>
              <View style={[styles.spaceActionButton, styles.spaceActionButtonDisabled]}>
                <Text style={[styles.spaceActionText, styles.spaceActionTextDisabled]}>Wallet</Text>
              </View>
            </View>
          </View>
        </LinearGradient>
      </Animated.View>
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
    <Animated.View style={[styles.cardContainer]}>
      <TouchableOpacity activeOpacity={0.9} onPress={handleOpenGuestChat}>
        <LinearGradient
          colors={['#0b1224', '#0f162b', '#0b1224']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.neonCard}
        >
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
            <LinearGradient
              colors={['transparent', 'rgba(125, 211, 252, 0.65)', 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.accentLine}
            />
          </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
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
    this.isBiometricUseCapableAndEnabled = await Biometric.isBiometricUseCapableAndEnabled();
  }

  refreshNamespaces = async () => {
    this.setState({isRefreshing: true});
    try {
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
    const { navigation, namespaceList, onInfo, onWait } = this.props;
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
    const { navigation, otherNamespaceList, onInfo, namespaceList } = this.props;
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
    if (navigation.getParam('openGuest')) {
      navigation.setParams({ openGuest: false });
      navigation.push('GuestChat', { mode: 'guest' });
    }
  };

  onNSInfo = (nsData, isOther = false) => {
    this.setState({
      nsData: nsData,
      codeErr: null,
      isModalVisible: true,
      nsIsOther: !!isOther,
    });
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

  getNSModal() {
    const nsData = this.state.nsData;
    if (!nsData) {
      return null;
    }

    const titleStyle ={
      fontSize: 17,
      fontWeight: '700',
      marginTop: 15,
      marginBottom: 0,
      color: KevaColors.darkText,
    };
    const contentStyle ={
      fontSize: 16,
      color: KevaColors.lightText,
      paddingTop: 5,
    };
    const container = {
      flexDirection: 'column',
      justifyContent: 'flex-start',
    }
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
          <Text style={{color: '#fff', fontSize: 16}}>
              {loc.general.close}
          </Text>
        </View>
        <View style={{ marginHorizontal: 10}}>
          <Text style={[titleStyle, {marginTop: 5}]}>{'Name'}</Text>
          <Text style={contentStyle}>{nsData.displayName}</Text>

          <Text style={titleStyle}>{'ID'}</Text>
          <View style={container}>
            <Text style={contentStyle}>{nsData.id}</Text>
            <TouchableOpacity onPress={() => {this.copyString(nsData.id)}}>
              {COPY_ICON}
            </TouchableOpacity>
          </View>

          <Text style={titleStyle}>{loc.namespaces.shortcode}</Text>
          <View style={container}>
            {nsData.shortCode ?
              <>
                <Text style={contentStyle}>{nsData.shortCode}</Text>
                <TouchableOpacity onPress={() => {this.copyString(nsData.shortCode)}}>
                  {COPY_ICON}
                </TouchableOpacity>
              </>
              :
              <Text style={contentStyle}>{loc.general.unconfirmed}</Text>
            }
          </View>
          {nsData.walletId && (
            <KevaButton
              type='secondary'
              caption={loc.namespaces.transfer}
              style={styles.transferAction}
              onPress={() => this.openTransfer(nsData)}
            />
          )}
          {this.state.nsIsOther && (
            <KevaButton
              type='secondary'
              caption={loc.namespaces.hide}
              style={styles.transferAction}
              onPress={() => this.onUnfollowFromModal(nsData)}
            />
          )}
        </View>
      </Modal>
    )
  }

  closeModal = () => {
    this.setState({ codeErr: null, isModalVisible: false, nsIsOther: false });
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
      <LinearGradient
        colors={['#050915', '#061025', '#050915']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.screenBackground}
      >
        <SafeAreaView style={styles.topContainer}>
          {this.getNSModal()}
          {this.getPendingModal()}
          <TabView
            navigationState={this.state}
            renderScene={({ route }) => {
              switch (route.key) {
                case 'first':
                  return <MyNamespaces dispatch={dispatch} navigation={navigation} namespaceList={namespaceList} onInfo={this.onNSInfo} onWait={this.onWait}/>;
                case 'second':
                  return (
                    <OtherNamespaces
                      dispatch={dispatch}
                      navigation={navigation}
                      otherNamespaceList={otherNamespaceList}
                      namespaceList={namespaceList}
                      onInfo={this.onNSInfo}
                    />
                  );
              }
            }}
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
      </LinearGradient>
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
  },
  avatarWrapper: {
    padding: 5,
    justifyContent: 'center',
    alignItems: 'center',
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
  },
  neonCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.4)',
    shadowColor: '#7dd3fc',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
    overflow: 'hidden',
  },
  cardInner: {
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  neonAvatarWrapper: {
    paddingVertical: 6,
    paddingRight: 12,
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
    backgroundColor: 'white',
    borderBottomWidth: 1 / PixelRatio.get(),
    borderBottomColor: '#e8e8e8',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10
  },
  detail: {
    color: '#5E5959',
    fontSize: 13,
    paddingTop: 3
  },
  sectionText: {
    color: '#5E5959',
    fontSize: 16,
  },
  resultText: {
    color: '#918C8C',
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
    backgroundColor: '#fff',
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
    height: 2,
    marginTop: 12,
    borderRadius: 20,
  },
  spaceActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: 6,
    marginTop: 8,
    paddingBottom: 2,
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
    backgroundColor: 'rgba(125, 211, 252, 0.08)',
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  spaceActionText: {
    color: '#E0F2FE',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  spaceActionTextDisabled: {
    color: 'rgba(148, 163, 184, 0.7)',
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
    backgroundColor: '#fff',
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
    borderColor: KevaColors.cellBorder,
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
