import React from 'react';
import {
  Text,
  View,
  Image as RNImage,
  Dimensions,
  TouchableOpacity,
  FlatList,
  Modal,
  StatusBar,
  InteractionManager,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import HTMLView from 'react-native-htmlview';
import { createThumbnail } from "react-native-create-thumbnail";
const BlueElectrum = require('../../BlueElectrum');
import MIcon from 'react-native-vector-icons/MaterialIcons';
import Icon from 'react-native-vector-icons/Ionicons';
const StyleSheet = require('../../PlatformStyleSheet');
const KevaColors = require('../../common/KevaColors');
const KevaButton = require('../../common/KevaButton');
import { THIN_BORDER, timeConverter, toastError, getInitials, stringToColor } from "../../util";
import {
  parseSpecialKey,
  getSpecialKeyText,
} from '../../class/keva-ops';
import { setMediaInfo, setKeyValue } from '../../actions'
import {
  BlueNavigationStyle,
  BlueLoading,
} from '../../BlueComponents';
import VideoPlayer from 'react-native-video-player';
import ImageViewer from 'react-native-image-zoom-viewer';
import { Image } from 'react-native-elements';
import RNFS from 'react-native-fs';
import LinearGradient from 'react-native-linear-gradient';
const loc = require('../../loc');
import { connect } from 'react-redux';
import { extractMedia, getImageGatewayURL, removeMedia, replaceMedia } from './mediaManager';
import { buildHeadAssetUriCandidates } from '../../common/namespaceAvatar';
import { getAlphaAvatarFrameDetails } from '../../common/alphaVisuals';
const createHash = require('create-hash');

const MAX_TIME = 3147483647;
const LOCAL_NAMESPACE_AVATAR_DIR = `${RNFS.DocumentDirectoryPath}/namespace_avatars`;
const getNamespaceAvatarPath = namespaceId => `${LOCAL_NAMESPACE_AVATAR_DIR}/${encodeURIComponent(String(namespaceId || 'unknown'))}.jpg`;

const selectAvatarCandidateUri = (candidateUris = [], failedUris = [], generatedUri = null) => {
  if (generatedUri) return null;
  for (const candidate of candidateUris) {
    if (!candidate) continue;
    if (failedUris && failedUris.includes(candidate)) continue;
    return candidate;
  }
  return null;
};

const computeAlphaValue = id => {
  try {
    const seed0 = Buffer.from(createHash('sha256').update(`${id || ''}projectkeva`).digest());
    const attrBytes = Buffer.from(':alpha');
    const seedBytes = Buffer.from(createHash('sha256').update(Buffer.concat([seed0, attrBytes])).digest());
    const hi = seedBytes.readUInt32BE(0);
    const lo = seedBytes.readUInt32BE(4);
    return -99 + (((hi ^ lo) >>> 0) % 199);
  } catch (err) {
    console.warn(err);
    return null;
  }
};

class NamespaceAvatar extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = {
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
    this.loadLocalAvatar(this.props.shortCode);
    this.prepareGeneratedAvatar(this.props.shortCode);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.shortCode !== this.props.shortCode) {
      this.loadLocalAvatar(this.props.shortCode);
      this.prepareGeneratedAvatar(this.props.shortCode);
    }
  }

  componentWillUnmount() {
    this._isMounted = false;
    if (this._avatarHandle && typeof this._avatarHandle.cancel === 'function') {
      this._avatarHandle.cancel();
    }
    this._avatarHandle = null;
  }

  loadLocalAvatar = async shortCode => {
    try {
      if (!shortCode) {
        if (this._isMounted) this.setState({ localAvatarUri: null });
        return;
      }
      const path = getNamespaceAvatarPath(shortCode);
      const exists = await RNFS.exists(path);
      if (this._isMounted) {
        this.setState({ localAvatarUri: exists ? `file://${path}?t=${Date.now()}` : null });
      }
    } catch (error) {
      console.warn('Failed to load showkeyvalue local avatar', error);
    }
  };

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
  };

  onAvatarLoadSuccess = (uri, requestId) => {
    if (!this._isMounted || requestId !== this._avatarRequestId) {
      return;
    }
    this.setState({
      generatedAvatarUri: uri,
      avatarFailedUris: [],
    });
  };

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
  };

  render() {
    const {
      displayName,
      shortCode,
      size = 40,
      containerStyle,
      touchableStyle,
      onPress,
      textStyle,
    } = this.props;

    const { avatarCandidateUris, avatarCandidateRequestId, avatarFailedUris, generatedAvatarUri, localAvatarUri } = this.state;
    const avatarCandidateUri = selectAvatarCandidateUri(avatarCandidateUris, avatarFailedUris, generatedAvatarUri);
    const shouldProbeAvatar = !localAvatarUri && !!(avatarCandidateUri && avatarCandidateRequestId === this._avatarRequestId);
    const fallbackInitials = getInitials(displayName);
    const fallbackColor = stringToColor(displayName);
    const borderRadius = size / 2;
    const fallbackFontSize = Math.max(12, Math.round(size * 0.45));
    const avatarSource = localAvatarUri ? { uri: localAvatarUri } : (generatedAvatarUri ? { uri: generatedAvatarUri } : undefined);
    const { frameColor: glowColor, frameSoftColor: glowSoftColor } = getAlphaAvatarFrameDetails(computeAlphaValue(shortCode));
    const haloSize = size + 22;
    const haloStyle = {
      width: haloSize,
      height: haloSize,
      borderRadius: haloSize / 2,
      shadowColor: glowColor,
      shadowOpacity: 0.95,
      shadowRadius: 15,
      shadowOffset: { width: 0, height: 0 },
      elevation: 10,
    };
    const neonHaloStyle = {
      width: size + 18,
      height: size + 18,
      borderRadius: (size + 18) / 2,
      borderColor: glowColor,
      backgroundColor: glowSoftColor,
      shadowColor: glowColor,
      shadowOpacity: 0.75,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 0 },
      elevation: 8,
    };

    const avatarContent = avatarSource ? (
      <View style={[styles.avatarGeneratedContainer, { borderRadius }]}>
        <RNImage source={avatarSource} style={[styles.avatarGeneratedImage, { borderRadius }]} />
      </View>
    ) : (
      <View style={[styles.avatarFallbackBase, { backgroundColor: fallbackColor, borderRadius }]}>
        <Text style={[styles.avatarFallbackLabel, { fontSize: fallbackFontSize }, textStyle]}>{fallbackInitials}</Text>
      </View>
    );

    const content = (
      <View style={[styles.avatarNeonWrapper, haloStyle, containerStyle]}>
        <View pointerEvents="none" style={[styles.avatarNeonHalo, neonHaloStyle]} />
        <View style={[styles.avatarWrapperBase, { width: size, height: size, borderRadius }]}>
          {shouldProbeAvatar && (
            <RNImage
              source={{ uri: avatarCandidateUri }}
              style={styles.avatarProbe}
              onLoad={() => this.onAvatarLoadSuccess(avatarCandidateUri, avatarCandidateRequestId)}
              onError={() => this.onAvatarLoadError(avatarCandidateUri, avatarCandidateRequestId)}
            />
          )}
          {avatarContent}
        </View>
      </View>
    );

    if (onPress) {
      return (
        <TouchableOpacity onPress={onPress} style={touchableStyle} activeOpacity={0.7}>
          {content}
        </TouchableOpacity>
      );
    }

    if (touchableStyle) {
      return <View style={touchableStyle}>{content}</View>;
    }

    return content;
  }
}

class Reply extends React.Component {

  constructor(props) {
    super(props);
    this.state = { };
  }

  gotoShortCode = (shortCode) => {
    this.props.navigation.push('KeyValues', {
      namespaceId: null,
      shortCode,
      displayName: null,
      isOther: true,
    });
  }

  render() {
    let {item} = this.props;
    const displayName = item.sender.displayName;
    const shortCode = item.sender.shortCode;
    return (
      <View style={styles.reply}>
        <View style={styles.senderBar} />
        <View>
          <View style={{flexDirection: 'row'}}>
            <NamespaceAvatar
              displayName={displayName}
              shortCode={shortCode}
              size={32}
              touchableStyle={{marginRight: 5}}
              onPress={() => this.gotoShortCode(shortCode)}
            />
            <Text style={styles.sender} numberOfLines={1} ellipsizeMode="tail" onPress={() => this.gotoShortCode(item.sender.shortCode)}>
              {displayName + ' '}
            </Text>
            <TouchableOpacity onPress={() => this.gotoShortCode(item.sender.shortCode)} style={{alignSelf: 'center'}}>
              <Text style={styles.shortCodeReply}>
                {`@${item.sender.shortCode}`}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.replyValue} selectable={true}>{item.value}</Text>
          {(item.height > 0) ?
            <Text style={styles.timestampReply}>{timeConverter(item.time) + ' ' + item.height}</Text>
            :
            <Text style={styles.timestampReply}>{loc.general.unconfirmed}</Text>
          }
        </View>
      </View>
    )
  }
}

class ShowKeyValue extends React.Component {

  constructor() {
    super();
    this.state = {
      isRefreshing: false,
      key: '',
      value: '',
      isRaw: false,
      CIDHeight: 1,
      CIDWidth: 1,
      showPicModal: false,
      thumbnail: null,
      opacity: 0,
      replyCount: 0,
      replies: [],
      showFragmentNamespaceModal: false,
      pendingFragmentText: '',
      fragmentNamespaceId: '',
    };

    this.LARGE_IMAGE_ICON = (
      <View style={{alignItems: 'center'}}>
        <Text style={{textAlign: 'center', fontSize: 16, color: '#fff', fontWeight: '700'}}>{loc.settings.ipfs_error_0}</Text>
        <Text style={{textAlign: 'center', fontSize: 16, color: '#fff', fontWeight: '700'}}>{loc.settings.ipfs_error_1}</Text>
        <Text style={{textAlign: 'center', fontSize: 16, color: '#fff', marginBottom: 10}}>
        {loc.settings.ipfs_error_2}
        </Text>
        <Icon name="ios-image" size={90} color="#fff"/>
      </View>
    );
  }

  static navigationOptions = ({ navigation }) => ({
    ...BlueNavigationStyle(),
    title: '',
    tabBarVisible: false,
  });

  maybeHTML = value => {
    return /<(?=.*? .*?\/ ?>|br|hr|input|!--|wbr)[a-z]+.*?>|<([a-z]+).*?<\/\1>/i.test(value);
  }

  sortReplies = replies => {
    if (!replies) {
      return;
    }
    return replies.sort((a, b) => {
      const btime = b.time || MAX_TIME;
      const atime = a.time || MAX_TIME;
      return (btime - atime)
    });
  }

  async componentDidMount() {
    const {keyValueList} = this.props;
    const {shortCode, displayName, namespaceId, index, type, hashtags} = this.props.navigation.state.params;
    this.setState({
      shortCode, displayName, namespaceId, index, type
    });

    let key;
    let value;

    if (type == 'keyvalue') {
      const keyValue = (keyValueList.keyValues[namespaceId])[index];
      key = keyValue.key;
      value = keyValue.value;
    } else if (type == 'hashtag') {
      const keyValue = hashtags[index];
      key = keyValue.key;
      value = keyValue.value;
    }

    this.setState({ key: key || '', value: value || '' });

    const {mediaCID, mimeType} = extractMedia(value);
    const {mediaInfoList, dispatch} = this.props;

    if (mediaCID) {
      const mediaInfo = mediaInfoList[mediaCID];
      if (mediaInfo) {
        if (mimeType.startsWith('image')) {
          this.setState({CIDHeight: mediaInfo.height, CIDWidth: mediaInfo.width});
        } else if (mimeType.startsWith('video')) {
          this.setState({thumbnail: mediaInfo.thumbnail, CIDWidth: mediaInfo.width, CIDHeight: mediaInfo.height});
        }
      } else {
        InteractionManager.runAfterInteractions(async () => {
          if (mimeType.startsWith('image')) {
            RNImage.getSize(getImageGatewayURL(mediaCID), (width, height) => {
              this.setState({CIDHeight: height, CIDWidth: width});
            });
          } else if (mimeType.startsWith('video')) {
            try {
              let response = await createThumbnail({
                url: getImageGatewayURL(mediaCID),
                timeStamp: 2000,
              });

              dispatch(setMediaInfo(mediaCID, {thumbnail: response.path, width: response.width, height: response.height}));
              this.setState({thumbnail: response.path, CIDHeight: response.height, CIDWidth: response.width});
            } catch (err) {
              console.warn(err);
            }
          }
        });
      }
    }

    await this.fetchReplies();

    // Check if it is a shared post.
    const {partialTxId, keyType} = parseSpecialKey(key);
    if (keyType != 'share' && keyType != 'comment') {
      return;
    }

    try {
      const {result} = await BlueElectrum.blockchainKeva_getKeyValueReactions(partialTxId);
      const value = Buffer.from(result.value, 'base64').toString('utf-8');
      this.setState({
        shareKey: result.value,
        shareValue: Buffer.from(result.value, 'base64').toString('utf-8'),
        shareTime: result.time,
        origShortCode: result.shortCode,
        origName: result.displayName,
      });

      const {mediaCID, mimeType} = extractMedia(value);
      if (mediaCID) {
        if (mimeType.startsWith('image')) {
          RNImage.getSize(getImageGatewayURL(mediaCID), (width, height) => {
            this.setState({CIDHeight: height, CIDWidth: width});
          });
        } else if (mimeType.startsWith('video')) {
          const mediaInfo = mediaInfoList[mediaCID];
          if (mediaInfo) {
            this.setState({thumbnail: mediaInfo.thumbnail, CIDWidth: mediaInfo.width, CIDHeight: mediaInfo.height});
            return;
          }

          try {
            let response = await createThumbnail({
              url: getImageGatewayURL(mediaCID),
              timeStamp: 2000,
            });
            dispatch(setMediaInfo(mediaCID, {thumbnail: response.path, width: response.width, height: response.height}));
            this.setState({thumbnail: response.path, CIDHeight: response.height, CIDWidth: response.width});
          } catch (err) {
            console.warn(err);
          }
        }
      }

    } catch (err) {
      console.warn(err);
    }
  }

  componentWillUnmount () {
    if (this.subs) {
      this.subs.forEach(sub => sub.remove());
    }
  }

  onToggleRaw = () => {
    this.setState({isRaw: !this.state.isRaw});
  }

  showModal = () => {
    this.setState({showPicModal: true});
    StatusBar.setHidden(true);
  }

  closeModal = () => {
    StatusBar.setHidden(false);
    this.setState({showPicModal: false});
  }

  onLoadStart = () => {
    this.setState({opacity: 1});
  }

  onLoad = () => {
    this.setState({opacity: 0});
  }

  onBuffer = ({isBuffering}) => {
    this.setState({opacity: isBuffering ? 1 : 0});
  }

  onHashtag = hashtag => {
    const {navigation, dispatch} = this.props;
    navigation.push('HashtagKeyValues', {hashtag});
  }

  renderText = (text) => {
    const textList = text.split(/(#(?:\[[^\]]+\]|[\p{L}\p{N}\p{Pc}\p{M}]+))/u);
    return textList.map((t, i) => {
      if (t.startsWith('#')) {
        return (
          <Text selectable key={i} style={styles.htmlLink} onPress={() => this.onHashtag(t.toLowerCase())}>
            {t}
          </Text>
        )
      }

      return (
        <Text selectable key={i} style={styles.htmlText}>{t}</Text>
      )
    });
  }

  renderNode = (node, index) => {
    const isNewline = node.type == 'text' && node.data && node.data.trim().length === 0;
    if (isNewline) {
      return <Text key={index} selectable></Text>;
    }
    const isLink = node.parent && node.parent.name == 'a';
    if (isLink) {
      return;
    }

    if (node.type == 'text') {
      return <Text key={index} selectable>{this.renderText(unescape(node.data), index)}</Text>;
    } else if (node.name == 'img') {
      const a = node.attribs;
      const width = Dimensions.get('window').width * 0.9;
      const height = (a.height && a.width) ? (a.height / a.width) * width : width;
      const images = [{
        url: a.src,
        width: width/0.9,
        height: height/0.9,
      }];
      return (
        <View key={index}>
          <Modal visible={this.state.showPicModal} transparent={true} onRequestClose={this.closeModal}>
            <ImageViewer key={index} imageUrls={images} onCancel={this.closeModal} enableSwipeDown={true} swipeDownThreshold={100}/>
          </Modal>
          <TouchableOpacity onPress={this.showModal}>
            <Image style={{ width, height, alignSelf: 'center'}}
              source={{ uri: a.src }}
              resizeMode="contain"
              PlaceholderContent={this.LARGE_IMAGE_ICON}
              placeholderStyle={{backgroundColor: '#ddd', borderRadius: 10}}
            />
          </TouchableOpacity>
        </View>
      );
    } else if (node.name == 'video') {
      const { width, height, poster } = node.attribs; // <video width="320" height="240" poster="http://link.com/image.jpg">...</video>

      // Check if node has children
      if (node.children.length === 0) return;

      // Get all children <source> nodes
      // <video><source src="movie.mp4" type="video/mp4"><source src="movie.ogg" type="video/ogg"></video>
      const sourceNodes = node.children.filter((node) => node.type === 'tag' && node.name === 'source')
      // Get a list of source URLs (<source src="movie.mp4">)
      const sources = sourceNodes.map((node) => node.attribs.src);
      let displayWidth = Dimensions.get('window').width;
      let displayHeight;
      if (height && width) {
        displayHeight = (Number(height) / Number(width)) * displayWidth;
      } else {
        displayHeight = (225/400)*displayWidth;
      }
      return (
        <View key={index}>
          <VideoPlayer
            disableFullscreen={false}
            fullScreenOnLongPress={true}
            resizeMode="contain"
            video={{ uri: sources[0] }} // Select one of the video sources
            videoWidth={displayWidth}
            videoHeight={displayHeight}
            thumbnail={{uri: poster}}
            onBuffer={this.onBuffer}
            onLoadStart={this.onLoadStart}
            onLoad={this.onLoad}
            customStyles={{
              video : {backgroundColor: 'black'},
            }}
          />
          <View pointerEvents="none" style={styles.videoContainer}>
            <ActivityIndicator
              animating
              size="large"
              color="#ddd"
              style={[styles.activityIndicator, {opacity: this.state.opacity}]}
            />
          </View>
        </View>
      );
    }
  }

  updateReplies = (reply) => {
    const {index, type, hashtags, updateHashtag} = this.props.navigation.state.params;
    let currentLength = this.state.replies.length;
    this.setState({
      replies: [reply, ...this.state.replies]
    });

    if (type == 'hashtag' && updateHashtag) {
      let keyValue = hashtags[index];
      keyValue.replies = currentLength + 1;
      updateHashtag(index, keyValue);
    }
  }

  onReply = () => {
    const {navigation, namespaceList} = this.props;
    const {replyTxid, namespaceId, index, type, hashtags} = navigation.state.params;
    // Must have a namespace.
    if (Object.keys(namespaceList).length == 0) {
      toastError('Create a namespace first');
      return;
    }

    navigation.navigate('ReplyKeyValue', {
      replyTxid,
      namespaceId,
      index,
      type,
      updateReplies: this.updateReplies,
      hashtags,
    })
  }

  onRewardDone = () => {
    // Force refresh.
    this.setState({type: this.state.type});
  }

  onReward = () => {
    const {navigation, namespaceList} = this.props;
    const {rewardTxid, namespaceId, index, type, hashtags, updateHashtag} = navigation.state.params;
    // Must have a namespace.
    if (Object.keys(namespaceList).length == 0) {
      toastError('Create a namespace first');
      return;
    }

    navigation.navigate('RewardKeyValue', {
      namespaceId,
      rewardTxid,
      index,
      type,
      updateHashtag,
      hashtags,
      onRewardDone: this.onRewardDone,
    })
  }

  fetchReplies = async () => {
    const {dispatch, navigation, keyValueList, reactions} = this.props;
    const {replyTxid, namespaceId, index, type, hashtags} = navigation.state.params;

    try {
      this.setState({isRefreshing: true});
      const results = await BlueElectrum.blockchainKeva_getKeyValueReactions(replyTxid);
      const totalReactions = results.result;
      /*
        totalReactions format:
        {
          "key": "<key>",
          "value": "<value>",
          "displayName": <>,
          "shortCode": <>,
          "likes": <likes>,
          "replies": [{
            "height": <>,
            "type": <>,
            "key": <>,
            "value": <>,
            "time": <>,
            "sender": {
              shortCode: <>,
              displayName: <>
            }
          }],
          "shares": <shares>
          ...
        }
      */


      // Decode replies base64
      const replies = totalReactions.replies.filter(r => r.type !== 'DEL').map(r => {
        r.value = Buffer.from(r.value, 'base64').toString('utf-8');
        return r;
      });
      this.setState({replies});

      // Check if it is a favorite.
      const reaction = reactions[replyTxid];
      const favorite = reaction && !!reaction['like'] && totalReactions.likes > 0;

      // Update the replies, shares and favorite.
      if (type == 'keyvalue') {
        const keyValues = keyValueList.keyValues[namespaceId];
        let keyValue = keyValues[index];
        keyValue.favorite = favorite;
        keyValue.likes = totalReactions.likes;
        keyValue.shares = totalReactions.shares;
        keyValue.replies = totalReactions.replies.length;
        dispatch(setKeyValue(namespaceId, index, keyValue));
      } else if (type == 'hashtag') {
        let keyValue = hashtags[index];
        keyValue.favorite = favorite;
        keyValue.likes = totalReactions.likes;
        keyValue.shares = totalReactions.shares;
        keyValue.replies = totalReactions.replies.length;
        const newHashtags = [...hashtags];
        newHashtags[index] = keyValue;
        this.setState({
          hashtags: newHashtags,
        });
      }

      this.setState({
        isRefreshing: false
      });
    } catch(err) {
      console.warn(err);
      this.setState({isRefreshing: false});
      toastError('Cannot fetch replies');
    }
  }

  gotoShortCode = (shortCode) => {
    this.props.navigation.push('KeyValues', {
      namespaceId: null,
      shortCode,
      displayName: null,
      isOther: true,
    });
  }

  getShareContent = (key) => {
    const {keyType} = parseSpecialKey(key);
    if (keyType != 'share' && keyType != 'comment') {
      return null;
    }

    if (!this.state.shareValue) {
      return <BlueLoading style={{paddingTop: 30}}/>;
    }

    const {shareValue, shareTime, origName, origShortCode, CIDHeight, CIDWidth, thumbnail} = this.state;
    let displayValue = replaceMedia(shareValue, CIDHeight, CIDWidth, thumbnail);

    return (
      <View style={{backgroundColor: '#fff'}}>
        <View style={styles.shareContainer}>
          <View>
            <View style={{flexDirection: 'row'}}>
              <NamespaceAvatar
                displayName={origName}
                shortCode={origShortCode}
                size={32}
                touchableStyle={{marginRight: 5}}
                onPress={() => this.gotoShortCode(origShortCode)}
              />
              <View style={{flexDirection: 'row'}}>
                <Text style={styles.sender} numberOfLines={1} ellipsizeMode="tail" onPress={() => this.gotoShortCode(origShortCode)}>
                  {origName + ' '}
                </Text>
              </View>
              {(shareTime > 0) ?
                <Text style={styles.timestamp}>{'  ' + timeConverter(shareTime)}</Text>
                :
                <Text style={styles.timestamp}>{loc.general.unconfirmed}</Text>
              }
            </View>
          </View>
          <HTMLView value={`${displayValue}`}
            addLineBreaks={false}
            stylesheet={htmlStyles}
            nodeComponentProps={{selectable: true}}
            renderNode={this.renderNode}
          />
        </View>
      </View>
    );
  }

  onShareDone = () => {
    // Force refresh.
    this.setState({type: this.state.type});
  }

  onShare = (key, value) => {
    const {namespaceList} = this.props;
    const fragmentText = String(value || this.state.value || '').trim();
    if (!fragmentText) {
      toastError('No readable content available.');
      return;
    }
    const namespaces = namespaceList?.namespaces || {};
    const ids = Object.keys(namespaces);
    if (!ids.length) {
      toastError(loc.namespaces.create_namespace_first);
      return;
    }
    this.setState({
      showFragmentNamespaceModal: true,
      pendingFragmentText: fragmentText,
      fragmentNamespaceId: this.state.fragmentNamespaceId || namespaces[ids[0]].id,
    });
  }

  openFragmentWithNamespace = () => {
    const {navigation, namespaceList} = this.props;
    const namespaces = namespaceList?.namespaces || {};
    const namespaceId = this.state.fragmentNamespaceId;
    const namespace = namespaces[namespaceId];
    const fragmentText = String(this.state.pendingFragmentText || '').trim();
    if (!namespace || !fragmentText) {
      toastError('No readable content available.');
      return;
    }
    this.setState({ showFragmentNamespaceModal: false, pendingFragmentText: '' });
    navigation.push('AgentRole', {
      namespaceId: namespace.id,
      shortCode: namespace.shortCode,
      displayName: namespace.displayName,
      walletId: namespace.walletId,
      txid: namespace.txid || namespace.txId,
      rootAddress: namespace.rootAddress,
      price: namespace.price,
      desc: namespace.desc,
      addr: namespace.addr,
      profile: namespace.profile,
      autoStoryFragmentText: fragmentText,
      roleEntrySource: 'keyvalue-forward-quote-fragment',
      suppressAutoLinkStart: true,
    });
  }

  renderFragmentNamespaceModal = () => {
    const namespaces = this.props.namespaceList?.namespaces || {};
    const items = Object.keys(namespaces).map(id => ({ label: namespaces[id].displayName || namespaces[id].shortCode || id, value: namespaces[id].id, shortCode: namespaces[id].shortCode }));
    if (!this.state.showFragmentNamespaceModal) {
      return null;
    }
    return (
      <Modal visible transparent animationType="fade" onRequestClose={() => this.setState({ showFragmentNamespaceModal: false })}>
        <View style={styles.modalBackdrop}>
          <View style={styles.fragmentModalCard}>
            <Text style={styles.fragmentModalTitle}>Choose a namespace</Text>
            <ScrollView style={styles.fragmentNamespaceList} nestedScrollEnabled>
              {items.map(item => {
                const selected = item.value === this.state.fragmentNamespaceId;
                return (
                  <TouchableOpacity
                    key={item.value}
                    style={[styles.fragmentNamespaceOption, selected ? styles.fragmentNamespaceOptionSelected : null]}
                    onPress={() => this.setState({ fragmentNamespaceId: item.value })}
                  >
                    <Text style={[styles.fragmentNamespaceOptionText, selected ? styles.fragmentNamespaceOptionTextSelected : null]} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {!!item.shortCode && <Text style={styles.fragmentNamespaceOptionShortCode}>@{item.shortCode}</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <KevaButton type="secondary" style={styles.fragmentModalButton} caption="Next" onPress={this.openFragmentWithNamespace} />
            <KevaButton type="secondary" style={styles.fragmentModalButton} caption="Cancel" onPress={() => this.setState({ showFragmentNamespaceModal: false, pendingFragmentText: '' })} />
          </View>
        </View>
      </Modal>
    );
  }

  render() {
    const {keyValueList} = this.props;
    const {hashtags} = this.props.navigation.state.params;
    let {replies, isRaw, CIDHeight, CIDWidth, thumbnail} = this.state;
    const {shortCode, displayName, namespaceId, index, type} = this.state;
    if (!type) {
      return null;
    }

    let keyValue;
    if (type == 'keyvalue') {
      keyValue = (keyValueList.keyValues[namespaceId])[index];
    } else if (type == 'hashtag') {
      keyValue = hashtags[index];
    }

    const key = keyValue.key;
    let value = keyValue.value;
    const favorite = keyValue.favorite;
    const replyCount = keyValue.replies;
    const shareCount = keyValue.shares;
    const likeCount = keyValue.likes;

    const shareInfo = parseSpecialKey(key);
    if (shareInfo) {
      // The shareValue contains the shared media for preview.
      // We should remove it here otherwise it will be shown twice.
      value = removeMedia(value);
    }
    value = replaceMedia(value, CIDHeight, CIDWidth, thumbnail);

    let displayKey = key;
    const {keyType} = parseSpecialKey(key);
    if (keyType) {
      displayKey = getSpecialKeyText(keyType);
    }

    const listHeader = (
      <View style={styles.container}>
        {this.renderFragmentNamespaceModal()}
        <LinearGradient
          colors={['#0b1224', '#0f162b', '#0b1224']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.keyContainer}
        >
          <NamespaceAvatar
            displayName={displayName}
            shortCode={shortCode}
            size={40}
            touchableStyle={{paddingRight: 10}}
            onPress={() => this.gotoShortCode(shortCode)}
          />
          <View style={{paddingRight: 10, flexShrink: 1}}>
            <View style={{flexDirection: 'row'}}>
              <Text style={styles.sender} numberOfLines={1} ellipsizeMode="tail" onPress={() => this.gotoShortCode(shortCode)}>
                {displayName + ' '}
              </Text>
              <TouchableOpacity onPress={() => this.gotoShortCode(shortCode)}>
                <Text style={styles.shortCode}>
                  {`@${shortCode}`}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.key} selectable>{displayKey}</Text>
          </View>
        </LinearGradient>
        <LinearGradient
          colors={['#0b1224', '#0f162b', '#0b1224']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.valueContainer}
        >
          { isRaw ?
            <Text style={styles.value} selectable>{value}</Text>
          :
            <HTMLView value={`${value}`}
              addLineBreaks={false}
              stylesheet={htmlStyles}
              nodeComponentProps={{selectable: true}}
              renderNode={this.renderNode}
            />
          }
        </LinearGradient>
        { this.getShareContent(key) }
        <LinearGradient
          colors={['#0b1224', '#0f162b', '#0b1224']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.actionContainer}
        >
          <View style={{flexDirection: 'row'}}>
            <TouchableOpacity onPress={() => this.onReply()} style={{flexDirection: 'row'}}>
              <MIcon name="chat-bubble-outline" size={22} style={styles.talkIcon} />
              {(replyCount > 0) && <Text style={styles.count}>{replyCount}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => this.onShare(key, value)} style={{flexDirection: 'row'}}>
              <MIcon name="cached" size={22} style={styles.shareIcon} />
              {(shareCount > 0) && <Text style={styles.count}>{shareCount}</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => this.onReward()} style={{flexDirection: 'row'}}>
              {
                favorite ?
                  <MIcon name="favorite" size={22} style={[styles.shareIcon, {color: KevaColors.favorite}]} />
                :
                  <MIcon name="favorite-border" size={22} style={styles.shareIcon} />
              }
              {(likeCount > 0) && <Text style={styles.count}>{likeCount}</Text>}
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => this.onToggleRaw()}>
            <MIcon name="format-clear" size={22} style={this.state.isRaw ? styles.rawIcon : styles.actionIcon} />
          </TouchableOpacity>
        </LinearGradient>
      </View>
    );
    return (
      <FlatList
        style={styles.listStyle}
        ListHeaderComponent={listHeader}
        removeClippedSubviews={false}
        contentContainerStyle={styles.listContent}
        data={replies}
        onRefresh={() => this.fetchReplies()}
        refreshing={this.state.isRefreshing}
        keyExtractor={(item, index) => item.key + index}
        renderItem={({item, index}) => <Reply item={item} navigation={this.props.navigation} />}
      />
    )
  }

}

function mapStateToProps(state) {
  return {
    keyValueList: state.keyValueList,
    namespaceList: state.namespaceList,
    mediaInfoList: state.mediaInfoList,
    reactions: state.reactions,
  }
}

export default ShowKeyValueScreen = connect(mapStateToProps)(ShowKeyValue);

var styles = StyleSheet.create({
  avatarNeonWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  avatarNeonHalo: {
    position: 'absolute',
    borderWidth: 1,
    opacity: 0.85,
  },
  avatarWrapperBase: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarFallbackBase: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  avatarGeneratedContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  avatarGeneratedImage: {
    width: '100%',
    height: '100%',
  },
  avatarProbe: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  container: {
    backgroundColor: 'transparent',
  },
  listStyle: {
    flex: 1,
    backgroundColor: '#050915',
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 120,
  },
  keyContainer: {
    marginBottom: 10,
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
    color: '#E5E7EB',
    flex: 1,
    flexWrap: 'wrap',
    lineHeight: 24,
  },
  value: {
    fontSize: 16,
    color: '#CBD5E1',
    lineHeight: 25,
  },
  valueContainer: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.32)',
    backgroundColor: 'transparent',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 14,
    shadowColor: '#7dd3fc',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    overflow: 'hidden',
  },
  actionContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.32)',
    backgroundColor: 'transparent',
    borderRadius: 18,
    paddingHorizontal: 10,
    paddingVertical: 10,
    overflow: 'hidden',
  },
  talkIcon: {
    color: '#93C5FD',
    paddingLeft: 15,
    paddingRight: 2,
    paddingVertical: 2
  },
  shareIcon: {
    color: '#93C5FD',
    paddingLeft: 15,
    paddingRight: 2,
    paddingVertical: 2
  },
  actionIcon: {
    color: '#93C5FD',
    paddingHorizontal: 15,
    paddingVertical: 2
  },
  rawIcon: {
    color: '#7DD3FC',
    paddingHorizontal: 15,
    paddingVertical: 2
  },
  count: {
    color: '#E0F2FE',
    paddingVertical: 2,
    fontWeight: '600',
  },
  reply: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginVertical: 6,
    borderRadius: 16,
    backgroundColor:'#0b1224',
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.25)',
  },
  replyValue: {
    fontSize: 16,
    color: '#CBD5E1',
    paddingVertical: 5,
    lineHeight: 25,
  },
  timestamp: {
    color: '#9CA3AF',
    alignSelf: 'center',
    fontSize: 13,
  },
  timestampReply: {
    color: '#9CA3AF',
    alignSelf: 'flex-start',
    fontSize: 13,
  },
  sender: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E5E7EB',
    alignSelf: 'center',
    maxWidth: 220,
  },
  shortCode: {
    fontSize: 16,
    fontWeight: '700',
    color: '#7DD3FC',
  },
  shortCodeReply: {
    fontSize: 16,
    fontWeight: '700',
    color: '#7DD3FC',
  },
  senderBar: {
    borderLeftWidth: 4,
    borderColor: 'rgba(125, 211, 252, 0.55)',
    width: 0,
    paddingLeft: 3,
    paddingRight: 7,
    height: '100%',
  },
  shareContainer: {
    flexDirection: 'column',
    justifyContent: 'flex-start',
    backgroundColor: '#0b1224',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.25)',
    borderRadius: 16,
    marginVertical: 8,
  },
  videoContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activityIndicator: {
    position: 'absolute',
    top: 70,
    left: 70,
    right: 70,
    height: 50,
  },
  htmlText: {
    fontSize: 16,
    color: '#CBD5E1',
    lineHeight: 23
  },
  htmlLink: {
    fontSize: 16,
    color: '#7DD3FC',
    lineHeight: 23
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  fragmentModalCard: {
    backgroundColor: '#0b1224',
    borderColor: 'rgba(94, 234, 212, 0.35)',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  fragmentModalTitle: {
    color: '#E5E7EB',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 18,
  },
  fragmentModalButton: {
    marginTop: 14,
  },
  fragmentNamespaceList: {
    maxHeight: 260,
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.35)',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#111827',
  },
  fragmentNamespaceOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(94, 234, 212, 0.18)',
  },
  fragmentNamespaceOptionSelected: {
    backgroundColor: '#164E63',
  },
  fragmentNamespaceOptionText: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '700',
  },
  fragmentNamespaceOptionTextSelected: {
    color: '#FFFFFF',
  },
  fragmentNamespaceOptionShortCode: {
    color: '#7DD3FC',
    fontSize: 13,
    marginTop: 3,
  }
});

export const htmlStyles = StyleSheet.create({
  div: {
    fontSize: 16,
    color: '#CBD5E1',
    lineHeight: 25,
    padding: 0,
    marginBottom: 0,
  },
  p: {
    fontSize: 16,
    color: '#CBD5E1',
    lineHeight: 25,
    padding: 0,
    margin: 0,
  },
  a: {
    fontSize: 16,
    color: '#7DD3FC',
    lineHeight: 25,
    padding: 0,
    margin: 0,
  },
  h3: {
    fontSize: 20,
    fontWeight: '700',
    alignSelf: 'center',
    color: '#E5E7EB',
    lineHeight: 25,
    paddingVertical: 20,
    textAlign: 'center',
  },
});
