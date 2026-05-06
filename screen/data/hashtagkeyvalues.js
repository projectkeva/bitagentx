import React from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  FlatList,
  InteractionManager,
  SafeAreaView,
  TextInput,
  LayoutAnimation,
  Keyboard,
  Image as RNImage,
  ActivityIndicator,
} from 'react-native';
const KevaColors = require('../../common/KevaColors');
import { THIN_BORDER, toastError } from '../../util';
import {
  BlueNavigationStyle,
  BlueLoading,
} from '../../BlueComponents';
const loc = require('../../loc');
let BlueApp = require('../../BlueApp');
let BlueElectrum = require('../../BlueElectrum');

import MIcon from 'react-native-vector-icons/MaterialIcons';
import Icon from 'react-native-vector-icons/Ionicons';
import { connect } from 'react-redux'
import { createThumbnail } from "react-native-create-thumbnail";
import { Image } from 'react-native-elements';
import { setMediaInfo, } from '../../actions'
import {
  getHashtagScriptHash, parseSpecialKey, getSpecialKeyText, decodeBase64,
  findTxIndex,
} from '../../class/keva-ops';
import Toast from 'react-native-root-toast';
import { timeConverter, stringToColor, getInitials, SCREEN_WIDTH, } from "../../util";
import Biometric from '../../class/biometrics';
import { extractMedia, getImageGatewayURL, removeMedia } from './mediaManager';
import LinearGradient from 'react-native-linear-gradient';
import styles from './hashtagkeyvalues_template';
import { buildHeadAssetUriCandidates } from '../../common/namespaceAvatar';

const PLAY_ICON  = <MIcon name="play-arrow" size={50} color="#fff"/>;
const IMAGE_ICON = <Icon name="ios-image" size={50} color="#fff"/>;

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
    };
    this._avatarRequestId = 0;
    this._avatarHandle = null;
    this._isMounted = false;
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
    return str.replace(/(<([^>]+)>)/gi, "").replace(/(\r\n|\n|\r)/gm, "");
  }

  async componentDidMount() {
    this._isMounted = true;
    this.prepareGeneratedAvatar(this.getShortCode());
    InteractionManager.runAfterInteractions(async () => {
      await this._componentDidMount();
    });
  }

  componentDidUpdate(prevProps) {
    const prevShortCode = this.getShortCode(prevProps);
    const currentShortCode = this.getShortCode();
    if (prevShortCode !== currentShortCode) {
      this.prepareGeneratedAvatar(currentShortCode);
    }
  }

  componentWillUnmount() {
    this._isMounted = false;
    if (this._avatarHandle && typeof this._avatarHandle.cancel === 'function') {
      this._avatarHandle.cancel();
    }
    this._avatarHandle = null;
  }

  getShortCode = (props = this.props) => {
    const { item } = props;
    if (item && item.shortCode) {
      return item.shortCode;
    }
    return null;
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
    let {item, index = 0, onShow, onReply, onShare, onReward} = this.props;
    let {thumbnail, avatarCandidateUris, avatarCandidateRequestId, avatarFailedUris, generatedAvatarUri} = this.state;
    const {mediaCID, mimeType} = extractMedia(item.value);
    let displayKey = item.key;
    const {keyType} = parseSpecialKey(item.key);
    if (keyType) {
      displayKey = getSpecialKeyText(keyType);
    }

    const avatarCandidateUri = selectAvatarCandidateUri(avatarCandidateUris, avatarFailedUris, generatedAvatarUri);
    const shouldProbeAvatar = !!(avatarCandidateUri && avatarCandidateRequestId === this._avatarRequestId);
    const fallbackInitials = getInitials(item.displayName);
    const fallbackColor = stringToColor(item.displayName);
    const avatarSource = generatedAvatarUri ? { uri: generatedAvatarUri } : undefined;
    const avatarContent = avatarSource ? (
      <View style={styles.generatedAvatarContainer}>
        <RNImage source={avatarSource} style={styles.generatedAvatarImage} />
      </View>
    ) : (
      <View style={[styles.fallbackAvatar, { backgroundColor: fallbackColor }]}>
        <Text style={styles.fallbackAvatarLabel}>{fallbackInitials}</Text>
      </View>
    );

    return (
      <View style={[styles.card, styles.masonryCard, index % 2 === 0 ? styles.masonryCardLeft : styles.masonryCardRight]}>
        <TouchableOpacity onPress={() => onShow(item.tx, item.height, item.shortCode, item.displayName)}>
          <View style={styles.cardValueArea}>
            {
              mediaCID && (
                mimeType.startsWith('video') ?
                <View style={styles.previewVideoContainer}>
                  <Image source={{uri: thumbnail}}
                    style={styles.previewVideo}
                  />
                  <View style={styles.playIcon}>
                    {PLAY_ICON}
                  </View>
                </View>
                :
                <Image style={styles.previewImage}
                  source={{uri: getImageGatewayURL(mediaCID)}}
                  PlaceholderContent={IMAGE_ICON}
                  placeholderStyle={{backgroundColor: '#0b1224'}}
                />
              )
            }
            <Text style={styles.valueDesc} numberOfLines={mediaCID ? 4 : 9} ellipsizeMode="tail">{this.stripHtml(removeMedia(item.value))}</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.cardMetaArea}>
          <TouchableOpacity onPress={() => onShow(item.tx, item.height, item.shortCode, item.displayName)}>
            <Text style={styles.keyDesc} numberOfLines={2} ellipsizeMode="tail">{displayKey}</Text>
          </TouchableOpacity>
          <View style={styles.cardFooterRow}>
            <TouchableOpacity style={styles.cardAuthorRow} onPress={() => onShow(item.tx, item.height, item.shortCode, item.displayName)}>
              <View style={styles.avatarWrapper}>
                {shouldProbeAvatar && (
                  <Image
                    source={{ uri: avatarCandidateUri }}
                    style={styles.avatarProbe}
                    onLoad={() => this.onAvatarLoadSuccess(avatarCandidateUri, avatarCandidateRequestId)}
                    onError={() => this.onAvatarLoadError(avatarCandidateUri, avatarCandidateRequestId)}
                  />
                )}
                {avatarContent}
              </View>
              <Text style={styles.authorName} numberOfLines={1}>{item.displayName || item.shortCode}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onReward(item.tx, item.key, item.value, item.height)} style={styles.likeButton}>
              {
                item.favorite ?
                  <MIcon name="favorite" size={20} style={[styles.likeIcon, {color: KevaColors.favorite}]} />
                :
                  <MIcon name="favorite-border" size={20} style={styles.likeIcon} />
              }
              {(item.likes > 0) && <Text style={styles.count}>{item.likes}</Text> }
            </TouchableOpacity>
          </View>
        </View>
      </View>
    )
  }
}

class HashtagKeyValues extends React.Component {

  constructor() {
    super();
    this.state = {
      loaded: false,
      isModalVisible: false,
      currentPage: 0,
      showDeleteModal: false,
      isRefreshing: false,
      loading: false,
      isLoadingMore: false,
      min_tx_num: -1,
      totalToFetch: 0,
      fetched: 0,
      inputMode: false,
      hashtag: '',
      searched: false,
      hashtags: [],
    };
    this.onEndReachedCalledDuringMomentum = true;
  }

  static navigationOptions = ({ navigation }) => ({
    ...BlueNavigationStyle(),
    title: '',
    tabBarVisible: false,
    headerStyle: { backgroundColor: '#050915', elevation:0, shadowColor: 'transparent', borderBottomWidth: THIN_BORDER, borderColor: 'rgba(125, 211, 252, 0.2)' },
  });

  progressCallback = (totalToFetch, fetched) => {
    this.setState({totalToFetch, fetched});
  }

  onSearchHashtag = async () => {
    Keyboard.dismiss();
    this.setState({min_tx_num: -1, loading: true, hashtags: []});
    await this.fetchHashtag(-1);
    this.setState({loading: false});
  }

  fetchHashtag = async (min_tx_num) => {
    const {reactions} = this.props;
    /*
      Data returned by ElectrumX API
      {
        hashtags: [{
          'tx_hash': hash_to_hex_str(tx_hash),
          'displayName': display_name,
          'height': height, 'shortCode': shortCode,
          'time': timestamp,
          'replies': replies, 'shares': shares, 'likes': likes,
          'namespace': namespaceId,
          'key': key,
          'value': value,
          'type': REG|PUT|DEL|UNK
        }],
        min_tx_num: 123
      }
    */
    const {hashtags} = this.state;
    const hashtag = this.state.hashtag.trim();
    let history = await BlueElectrum.blockchainKeva_getHashtag(getHashtagScriptHash(hashtag), min_tx_num);
    if (history.hashtags.length == 0) {
      this.setState({searched: true});
      return;
    }

    const keyValues = history.hashtags.map(h => {
      const reaction = reactions[h.tx_hash];
      const favorite = reaction && !!reaction['like'];
      return {
        displayName: h.displayName,
        shortCode: h.shortCode,
        tx: h.tx_hash,
        replies: h.replies,
        shares: h.shares,
        likes: h.likes,
        height: h.height,
        time: h.time,
        namespaceId: h.namespace,
        key: decodeBase64(h.key),
        value: h.value ? Buffer.from(h.value, 'base64').toString() : '',
        favorite,
      }
    });

    if (history.min_tx_num < this.state.min_tx_num) {
      // TODO: optimize this, add appendHashtags to avoid
      // duplicating twice.
      this.setState({
        hashtags: [...hashtags, ...keyValues],
        min_tx_num: history.min_tx_num,
      });
    } else {
      this.setState({
        hashtags: [...keyValues],
        min_tx_num: history.min_tx_num,
      });
    }
  }

  refreshKeyValues = async () => {
    try {
      this.setState({isRefreshing: true});
      await BlueElectrum.ping();
      await this.fetchHashtag(-1);
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
      await this.fetchHashtag(this.state.min_tx_num);
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

  async componentDidMount() {
    let hashtag = this.props.navigation.getParam('hashtag');
    if (hashtag.startsWith('#')) {
      hashtag = hashtag.substring(1);
    }
    this.setState({hashtag, hashtags: []});
    await this.refreshKeyValues();
    this.isBiometricUseCapableAndEnabled = await Biometric.isBiometricUseCapableAndEnabled();
  }

  onShow = (tx, height, shortCode, displayName) => {
    const {navigation} = this.props;
    const {hashtags} = this.state;
    const index = findTxIndex(hashtags, tx);
    if (index < 0) {
      return;
    }
    navigation.push('ShowKeyValue', {
      index,
      type: 'hashtag',
      shortCode,
      displayName,
      replyTxid: tx,
      shareTxid: tx,
      rewardTxid: tx,
      height,
      hashtags,
      updateHashtag: this.updateHashtag,
    });
  }

  updateHashtag = (index, keyValue) => {
    const {hashtags} = this.state;
    const newHashtags = [...hashtags];
    newHashtags[index] = keyValue;
    this.setState({
      hashtags: newHashtags
    })
  }

  onReply = (replyTxid) => {
    const {navigation, namespaceList} = this.props;
    const {hashtags} = this.state;
    // Must have a namespace.
    if (Object.keys(namespaceList).length == 0) {
      toastError(loc.namespaces.create_namespace_first);
      return;
    }

    const index = findTxIndex(hashtags, replyTxid);
    if (index < 0) {
      return;
    }

    navigation.navigate('ReplyKeyValue', {
      index,
      type: 'hashtag',
      replyTxid,
      hashtags,
      updateHashtag: this.updateHashtag,
    })
  }

  onShare = (shareTxid, key, value, blockHeight) => {
    const {navigation, namespaceList} = this.props;
    const {hashtags} = this.state;
    // Must have a namespace.
    if (Object.keys(namespaceList).length == 0) {
      toastError(loc.namespaces.create_namespace_first);
      return;
    }

    const index = findTxIndex(hashtags, shareTxid);
    if (index < 0) {
      return;
    }

    const shortCode = navigation.getParam('shortCode');
    navigation.navigate('ShareKeyValue', {
      index,
      type: 'hashtag',
      shareTxid,
      origKey: key,
      origValue: value,
      origShortCode: shortCode,
      height: blockHeight,
      hashtags,
      updateHashtag: this.updateHashtag,
    })
  }

  onReward = (rewardTxid, key, value, height) => {
    const {navigation, namespaceList} = this.props;
    const {hashtags} = this.state;
    // Must have a namespace.
    if (Object.keys(namespaceList).length == 0) {
      toastError(loc.namespaces.create_namespace_first);
      return;
    }

    const shortCode = navigation.getParam('shortCode');
    const index = findTxIndex(hashtags, rewardTxid);
    if (index < 0) {
      return;
    }
    navigation.navigate('RewardKeyValue', {
      index,
      type: 'hashtag',
      rewardTxid,
      origKey: key,
      origValue: value,
      origShortCode: shortCode,
      height,
      hashtags,
      updateHashtag: this.updateHashtag,
    })
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
    this.setState({inputMode: false, hashtag: '', searched: false});
    this._inputRef && this._inputRef.blur();
    this._inputRef && this._inputRef.clear();
  }

  render() {
    let {navigation, dispatch, mediaInfoList} = this.props;
    const {inputMode, hashtag, loading, searched, hashtags} = this.state;
    const mergeList = hashtags;
    const canSearch = hashtag && hashtag.length > 0;

    if (this.state.isRefreshing && (!mergeList || mergeList.length == 0)) {
      return <BlueLoading />
    }
    const footerLoader = this.state.isLoadingMore ? <BlueLoading style={{paddingTop: 30, paddingBottom: 400}} /> : null;

    return (
      <LinearGradient
        colors={['#050915', '#061025', '#050915']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.screenBackground}
      >
      <SafeAreaView style={styles.topContainer}>
        <View style={styles.inputContainer}>
          <TouchableOpacity onPress={this.closeItemAni}>
            <Text style={[{color: KevaColors.actionText, fontSize: 16, textAlign: 'left'}, inputMode && {paddingRight: 5}]}>
              {inputMode ? loc.general.cancel : ''}
            </Text>
          </TouchableOpacity>
          <TextInput
            onFocus={this.openItemAni}
            ref={ref => this._inputRef = ref}
            onChangeText={hashtag => this.setState({ hashtag: hashtag, searched: false })}
            value={hashtag}
            placeholder={loc.namespaces.search_hashtag}
            placeholderTextColor={'#94A3B8'}
            multiline={false}
            underlineColorAndroid='rgba(0,0,0,0)'
            returnKeyType='search'
            clearButtonMode='while-editing'
            onSubmitEditing={this.onSearchHashtag}
            style={styles.textInput}
            returnKeyType={ 'done' }
            clearButtonMode='while-editing'
          />
          {loading ?
            <ActivityIndicator size="small" color={KevaColors.actionText} style={{ width: 42, height: 42 }} />
            :
            <TouchableOpacity onPress={this.onSearchHashtag} disabled={!canSearch}>
              <Icon name={'md-search'}
                    style={[styles.searchIcon, !canSearch && {color: KevaColors.inactiveText}]}
                    size={25} />
            </TouchableOpacity>
          }
        </View>
        {
          (mergeList && mergeList.length > 0 ) ?
          <FlatList
            style={styles.listStyle}
            contentContainerStyle={styles.listContent}
            columnWrapperStyle={styles.masonryRow}
            numColumns={2}
            data={mergeList}
            onRefresh={() => this.refreshKeyValues()}
            onEndReached={() => {this.loadMoreKeyValues()}}
            onEndReachedThreshold={0.1}
            onMomentumScrollBegin={() => { this.onEndReachedCalledDuringMomentum = false; }}
            refreshing={this.state.isRefreshing}
            keyExtractor={(item, index) => item.key + index}
            ListFooterComponent={footerLoader}
            renderItem={({item, index}) =>
              <Item item={item} index={index} key={index} dispatch={dispatch} onDelete={this.onDelete}
                onShow={this.onShow}
                onReply={this.onReply}
                onShare={this.onShare}
                onReward={this.onReward}
                navigation={navigation}
                mediaInfoList={mediaInfoList}
              />
            }
          />
          :
          <View style={{justifyContent: 'center', alignItems: 'center'}}>
            <RNImage source={require('../../img/other_no_data.png')} style={{ width: SCREEN_WIDTH*0.33, height: SCREEN_WIDTH*0.33, marginTop: 50, marginBottom: 10 }} />
            <Text style={{padding: 20, fontSize: 20, textAlign: 'center', color: KevaColors.inactiveText}}>
              {(searched && hashtag.length > 0) ? (loc.namespaces.no_hashtag + hashtag) : loc.namespaces.hashtag_help}
            </Text>
          </View>
        }
      </SafeAreaView>
      </LinearGradient>
    );
  }

}

function mapStateToProps(state) {
  return {
    namespaceList: state.namespaceList,
    mediaInfoList: state.mediaInfoList,
    reactions: state.reactions,
  }
}

export default HashtagKeyValuesScreen = connect(mapStateToProps)(HashtagKeyValues);
