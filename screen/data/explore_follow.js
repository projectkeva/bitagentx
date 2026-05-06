import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image as RNImage,
  InteractionManager,
  RefreshControl,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { connect } from 'react-redux';
import { SCREEN_WIDTH, stringToColor, getInitials } from '../../util';
import { decodeBase64, getNamespaceScriptHash, parseSpecialKey } from '../../class/keva-ops';
import { setKeyValueList } from '../../actions';
import { extractMedia } from './mediaManager';
import cardStyles from './hashtagkeyvalues_template';
import { buildHeadAssetUriCandidates } from '../../common/namespaceAvatar';

let BlueElectrum = require('../../BlueElectrum');
const StyleSheet = require('../../PlatformStyleSheet');
const KevaColors = require('../../common/KevaColors');

const FOLLOW_LIMIT_PER_NAMESPACE = 5;

const selectAvatarCandidateUri = (candidateUris = [], failedUris = [], generatedUri = null) => {
  if (generatedUri) return null;
  for (const candidate of candidateUris) {
    if (!candidate) continue;
    if (failedUris && failedUris.includes(candidate)) continue;
    return candidate;
  }
  return null;
};

const decodeKvKey = key => {
  if (!key) return '';
  try {
    return decodeBase64(key);
  } catch (_) {
    return key;
  }
};

const safeText = value => {
  if (value === undefined || value === null) return '';
  if (Buffer.isBuffer(value)) return value.toString('utf-8');
  if (typeof value === 'string') return value;
  return String(value || '');
};

const decodeKvValue = value => {
  if (!value) return '';
  try {
    return Buffer.from(value, 'base64').toString('utf-8');
  } catch (_) {
    return safeText(value);
  }
};

const normalizeNamespaceId = (namespaceId, data) => String(namespaceId || data?.id || data?.namespaceId || '').trim();

const getStableItemKey = item => {
  const namespaceId = normalizeNamespaceId(item?.namespaceId, item);
  const tx = safeText(item?.tx || item?.tx_hash).trim();
  const key = safeText(item?.key).trim();
  const value = safeText(item?.value).trim();
  if (tx) {
    return `${namespaceId}::${tx}`;
  }
  return `${namespaceId}::${key}::${value}`;
};

const htmlMediaReg = /<(img|video|audio|iframe|source)\b/i;
const stripHtml = value => safeText(value).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();

const isTextKeyValue = item => {
  const key = item?.key;
  const value = safeText(item?.value).trim();
  if (!value) return false;
  if (htmlMediaReg.test(value)) return false;
  try {
    if (parseSpecialKey(key)) return false;
  } catch (_) {}
  try {
    const media = extractMedia(value);
    if (media?.mediaCID) return false;
  } catch (_) {}
  return stripHtml(value).length > 0;
};

class ExploreFollowItem extends React.PureComponent {
  constructor(props) {
    super(props);
    this.state = {
      avatarCandidateUris: [],
      avatarCandidateRequestId: 0,
      avatarFailedUris: [],
      generatedAvatarUri: null,
    };
    this._avatarRequestId = 0;
    this._avatarHandle = null;
    this._isMounted = false;
  }

  componentDidMount() {
    this._isMounted = true;
    this.prepareGeneratedAvatar(this.getShortCode());
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

  getShortCode = (props = this.props) => safeText(props?.item?.shortCode).trim() || null;

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

  renderAvatar = () => {
    const { item } = this.props;
    const { avatarCandidateUris, avatarCandidateRequestId, avatarFailedUris, generatedAvatarUri } = this.state;
    const avatarCandidateUri = selectAvatarCandidateUri(avatarCandidateUris, avatarFailedUris, generatedAvatarUri);
    const shouldProbeAvatar = !!(avatarCandidateUri && avatarCandidateRequestId === this._avatarRequestId);
    const avatarName = safeText(item.displayName || item.shortCode || 'A').trim();
    const fallbackInitials = getInitials(avatarName || 'A');
    const fallbackColor = stringToColor(avatarName || 'A');
    const avatarSource = generatedAvatarUri ? { uri: generatedAvatarUri } : undefined;
    return (
      <View style={cardStyles.avatarWrapper}>
        {shouldProbeAvatar && (
          <RNImage
            source={{ uri: avatarCandidateUri }}
            style={cardStyles.avatarProbe}
            onLoad={() => this.onAvatarLoadSuccess(avatarCandidateUri, avatarCandidateRequestId)}
            onError={() => this.onAvatarLoadError(avatarCandidateUri, avatarCandidateRequestId)}
          />
        )}
        {avatarSource ? (
          <View style={cardStyles.generatedAvatarContainer}>
            <RNImage source={avatarSource} style={cardStyles.generatedAvatarImage} />
          </View>
        ) : (
          <View style={[cardStyles.fallbackAvatar, { backgroundColor: fallbackColor }]}>
            <Text style={cardStyles.fallbackAvatarLabel}>{fallbackInitials}</Text>
          </View>
        )}
      </View>
    );
  };

  render() {
    const { item, index = 0, onShow, onOpenNamespace } = this.props;
    const shortCode = safeText(item.shortCode).trim();
    const displayName = safeText(item.displayName).trim();
    const keyText = stripHtml(item.key);
    const valueText = stripHtml(item.value);
    return (
      <View style={[cardStyles.card, cardStyles.masonryCard, index % 2 === 0 ? cardStyles.masonryCardLeft : cardStyles.masonryCardRight]}>
        <TouchableOpacity onPress={() => onShow(item)} activeOpacity={0.85}>
          <View style={cardStyles.cardValueArea}>
            <Text style={cardStyles.valueDesc} numberOfLines={9} ellipsizeMode="tail">{valueText}</Text>
          </View>
        </TouchableOpacity>
        <View style={cardStyles.cardMetaArea}>
          <TouchableOpacity onPress={() => onShow(item)} activeOpacity={0.85}>
            <Text style={cardStyles.keyDesc} numberOfLines={2} ellipsizeMode="tail">{keyText}</Text>
          </TouchableOpacity>
          <View style={cardStyles.cardFooterRow}>
            <TouchableOpacity style={cardStyles.cardAuthorRow} onPress={() => onOpenNamespace(item)} activeOpacity={0.85}>
              {this.renderAvatar()}
              <Text style={cardStyles.authorName} numberOfLines={1}>{displayName || shortCode || 'Agent'}</Text>
            </TouchableOpacity>
            <View style={cardStyles.likeButton}>
              <Icon name={item.favorite ? 'md-heart' : 'md-heart-empty'} size={20} style={cardStyles.likeIcon} />
              {(item.likes > 0) && <Text style={cardStyles.count}>{item.likes}</Text>}
            </View>
          </View>
        </View>
      </View>
    );
  }
}

class ExploreFollow extends React.Component {
  state = {
    loading: false,
    refreshing: false,
    loadingMore: false,
    items: [],
    searched: false,
  };

  constructor(props) {
    super(props);
    this.namespacePaging = {};
    this.onEndReachedCalledDuringMomentum = true;
  }

  componentDidMount() {
    this._isMounted = true;
    this.loadFollowItems({ initial: true });
  }

  componentWillUnmount() {
    this._isMounted = false;
  }

  safeSetState = state => {
    if (this._isMounted) {
      this.setState(state);
    }
  };

  componentDidUpdate(prevProps) {
    const prevOrder = (prevProps.otherNamespaceList?.order || []).join('|');
    const nextOrder = (this.props.otherNamespaceList?.order || []).join('|');
    const prevCount = Object.keys(prevProps.otherNamespaceList?.namespaces || {}).length;
    const nextCount = Object.keys(this.props.otherNamespaceList?.namespaces || {}).length;
    if (prevOrder !== nextOrder || prevCount !== nextCount) {
      this.namespacePaging = {};
      this.loadFollowItems({ initial: true });
    }
  }

  getFollowNamespaces = () => {
    const list = this.props.otherNamespaceList || {};
    const namespaces = list.namespaces || {};
    const orderedIds = Array.isArray(list.order) ? list.order : [];
    const seen = new Set();
    const ordered = orderedIds
      .map(id => [normalizeNamespaceId(id, namespaces[id]), namespaces[id]])
      .filter(([id, data]) => id && data)
      .map(([id, data]) => {
        seen.add(id);
        return { id, data };
      });
    Object.keys(namespaces).forEach(id => {
      const normalized = normalizeNamespaceId(id, namespaces[id]);
      if (normalized && !seen.has(normalized)) ordered.push({ id: normalized, data: namespaces[id] });
    });
    return ordered;
  };

  normalizeCachedItem = (item, namespaceMeta = {}) => {
    if (!item) return null;
    const namespaceId = normalizeNamespaceId(item.namespaceId || item.namespace || namespaceMeta.id, namespaceMeta);
    if (!namespaceId) return null;
    return {
      ...item,
      tx: item.tx || item.tx_hash,
      tx_hash: item.tx_hash || item.tx,
      namespaceId,
      namespace: namespaceId,
      displayName: safeText(item.displayName).trim() || safeText(namespaceMeta.displayName).trim(),
      shortCode: safeText(item.shortCode).trim() || safeText(namespaceMeta.shortCode).trim(),
      key: safeText(item.key),
      value: safeText(item.value),
    };
  };

  mapHistoryItem = (kv, namespaceMeta = {}) => {
    const namespaceId = normalizeNamespaceId(kv?.namespace || namespaceMeta.id, namespaceMeta);
    if (!namespaceId) return null;
    return {
      ...kv,
      displayName: kv.displayName ? String(decodeKvValue(kv.displayName)).trim() : String(namespaceMeta?.displayName || '').trim(),
      shortCode: kv.shortCode || namespaceMeta?.shortCode || '',
      tx: kv.tx_hash,
      tx_hash: kv.tx_hash,
      replies: kv.replies,
      shares: kv.shares,
      likes: kv.likes,
      height: kv.height,
      time: kv.time,
      namespaceId,
      namespace: namespaceId,
      key: decodeKvKey(kv.key),
      value: decodeKvValue(kv.value),
    };
  };

  getUniqueTextItems = (items = [], namespaceMeta = {}) => {
    const seen = new Set();
    return items
      .map(item => this.normalizeCachedItem(item, namespaceMeta))
      .filter(item => item && isTextKeyValue(item))
      .sort((a, b) => Number(b.time || 0) - Number(a.time || 0))
      .filter(item => {
        const stableKey = getStableItemKey(item);
        if (!stableKey || seen.has(stableKey)) {
          return false;
        }
        seen.add(stableKey);
        return true;
      });
  };

  mergeNamespaceCache = (namespaceId, existingItems = [], incomingItems = [], namespaceMeta = {}) => {
    const combined = [];
    const seen = new Set();
    [...existingItems, ...incomingItems].forEach(item => {
      const normalized = this.normalizeCachedItem(item, namespaceMeta);
      if (!normalized) return;
      const stableKey = getStableItemKey(normalized);
      if (!stableKey || seen.has(stableKey)) return;
      seen.add(stableKey);
      combined.push(normalized);
    });
    combined.sort((a, b) => Number(b.time || 0) - Number(a.time || 0));
    this.props.dispatch(setKeyValueList(namespaceId, combined));
    return combined;
  };

  ensureNamespaceItems = async ({ id, data, targetCount, reset = false }) => {
    const namespaceId = normalizeNamespaceId(id, data);
    if (!namespaceId) return [];

    const paging = reset
      ? { minTxNum: -1, exhausted: false, visibleCount: 0 }
      : (this.namespacePaging[namespaceId] || { minTxNum: -1, exhausted: false, visibleCount: 0 });
    this.namespacePaging[namespaceId] = paging;

    let cachedItems = Array.isArray(this.props.keyValueList?.keyValues?.[namespaceId])
      ? this.props.keyValueList.keyValues[namespaceId]
      : [];
    let uniqueTextItems = this.getUniqueTextItems(cachedItems, data);

    while (!paging.exhausted && uniqueTextItems.length < targetCount) {
      const history = await BlueElectrum.blockchainKeva_getKeyValues(getNamespaceScriptHash(namespaceId), paging.minTxNum);
      const rawItems = Array.isArray(history?.keyvalues) ? history.keyvalues : [];
      if (rawItems.length === 0) {
        paging.exhausted = true;
        break;
      }

      const mappedItems = rawItems
        .map(kv => this.mapHistoryItem(kv, { ...data, id: namespaceId }))
        .filter(Boolean);

      const mergedCache = this.mergeNamespaceCache(namespaceId, cachedItems, mappedItems, { ...data, id: namespaceId });
      cachedItems = mergedCache;
      uniqueTextItems = this.getUniqueTextItems(mergedCache, data);

      const nextMinTxNum = Number(history?.min_tx_num);
      if (!Number.isFinite(nextMinTxNum) || (paging.minTxNum !== -1 && nextMinTxNum >= Number(paging.minTxNum))) {
        paging.exhausted = true;
      } else {
        paging.minTxNum = nextMinTxNum;
      }
    }

    paging.visibleCount = Math.max(paging.visibleCount || 0, Math.min(targetCount, uniqueTextItems.length));
    return uniqueTextItems.slice(0, paging.visibleCount);
  };

  rebuildVisibleItems = async ({ reset = false, increment = 0 } = {}) => {
    const followed = this.getFollowNamespaces();
    if (followed.length === 0) {
      this.safeSetState({ items: [], searched: true });
      return;
    }

    const batches = [];
    for (const entry of followed) {
      const namespaceId = normalizeNamespaceId(entry.id, entry.data);
      const prevVisibleCount = reset ? 0 : (this.namespacePaging[namespaceId]?.visibleCount || 0);
      const targetCount = Math.max(FOLLOW_LIMIT_PER_NAMESPACE, prevVisibleCount + increment);
      try {
        const items = await this.ensureNamespaceItems({
          id: namespaceId,
          data: entry.data,
          targetCount,
          reset,
        });
        batches.push(...items);
      } catch (error) {
        console.warn('ExploreFollow: failed to load followed namespace', namespaceId, error);
      }
    }

    batches.sort((a, b) => Number(b.time || 0) - Number(a.time || 0));
    this.safeSetState({ items: batches, searched: true });
  };

  loadFollowItems = async ({ initial = false } = {}) => {
    const followed = this.getFollowNamespaces();
    if (followed.length === 0) {
      this.safeSetState({ items: [], loading: false, refreshing: false, searched: true });
      return;
    }
    this.safeSetState(initial ? { loading: true } : { refreshing: true });
    try {
      await BlueElectrum.ping();
      await this.rebuildVisibleItems({ reset: true, increment: 0 });
    } catch (error) {
      console.warn('ExploreFollow: failed to load follow feed', error);
    } finally {
      this.safeSetState({ loading: false, refreshing: false });
    }
  };

  loadMoreFollowItems = async () => {
    if (this.onEndReachedCalledDuringMomentum || this.state.loadingMore || this.state.loading || this.state.refreshing) {
      return;
    }
    this.onEndReachedCalledDuringMomentum = true;
    this.safeSetState({ loadingMore: true });
    try {
      await BlueElectrum.ping();
      await this.rebuildVisibleItems({ reset: false, increment: FOLLOW_LIMIT_PER_NAMESPACE });
    } catch (error) {
      console.warn('ExploreFollow: failed to load more follow items', error);
    } finally {
      this.safeSetState({ loadingMore: false });
    }
  };

  onOpenNamespace = item => {
    const { navigation } = this.props;
    if (!item) {
      return;
    }

    navigation.push('KeyValues', {
      namespaceId: item.namespaceId || null,
      shortCode: item.shortCode || null,
      displayName: item.displayName || null,
      isOther: true,
    });
  };

  onShow = item => {
    const { navigation } = this.props;
    const { items } = this.state;
    const index = items.findIndex(row => row.tx === item.tx);
    navigation.push('ShowKeyValue', {
      index: index >= 0 ? index : 0,
      type: 'hashtag',
      shortCode: item.shortCode,
      displayName: item.displayName,
      replyTxid: item.tx,
      shareTxid: item.tx,
      rewardTxid: item.tx,
      height: item.height,
      hashtags: items,
      updateHashtag: this.updateFollowItem,
    });
  };

  updateFollowItem = (index, keyValue) => {
    this.setState(prevState => {
      const items = [...prevState.items];
      if (index >= 0 && index < items.length) {
        items[index] = { ...items[index], ...keyValue };
      }
      return { items };
    });
  };

  renderEmpty = () => {
    const followedCount = this.getFollowNamespaces().length;
    const text = followedCount === 0
      ? 'Follow namespaces first to see their latest text posts here.'
      : 'No text posts found from followed namespaces.';
    return (
      <View style={styles.emptyContainer}>
        <RNImage source={require('../../img/other_no_data.png')} style={styles.emptyImage} />
        <Text style={styles.emptyText}>{text}</Text>
      </View>
    );
  };

  render() {
    const { items, loading, refreshing, loadingMore } = this.state;
    if (loading && items.length === 0) {
      return (
        <SafeAreaView style={styles.container}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={KevaColors.actionText} />
            <Text style={styles.loadingText}>Loading Follow...</Text>
          </View>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView style={styles.container}>
        <FlatList
          style={styles.list}
          contentContainerStyle={items.length > 0 ? cardStyles.listContent : styles.emptyListContent}
          columnWrapperStyle={items.length > 0 ? cardStyles.masonryRow : null}
          numColumns={2}
          data={items}
          keyExtractor={item => getStableItemKey(item)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => this.loadFollowItems()} tintColor={KevaColors.actionText} />}
          onEndReached={() => this.loadMoreFollowItems()}
          onEndReachedThreshold={0.25}
          onMomentumScrollBegin={() => { this.onEndReachedCalledDuringMomentum = false; }}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={styles.loadMoreSpinner} color={KevaColors.actionText} /> : null}
          ListEmptyComponent={this.renderEmpty}
          renderItem={({ item, index }) => <ExploreFollowItem item={item} index={index} onShow={this.onShow} onOpenNamespace={this.onOpenNamespace} />}
        />
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050915',
  },
  list: {
    flex: 1,
    backgroundColor: '#050915',
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 400,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 160,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#94A3B8',
    fontSize: 15,
  },
  card: {
    marginVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.32)',
    shadowColor: '#7dd3fc',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    overflow: 'hidden',
  },
  cardInner: {
    padding: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  avatarWrapper: {
    width: 44,
    height: 44,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1a2336',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.28)',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  fallbackAvatar: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E3A5F',
  },
  fallbackAvatarText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  headerTextContainer: {
    flex: 1,
  },
  titleText: {
    color: '#E8F5FF',
    fontSize: 16,
    fontWeight: '700',
  },
  metaText: {
    color: '#94A3B8',
    fontSize: 12,
    marginTop: 3,
  },
  keyText: {
    color: '#7DD3FC',
    fontSize: 13,
    marginBottom: 6,
  },
  valueText: {
    color: '#D1E8FF',
    fontSize: 15,
    lineHeight: 21,
  },
  emptyContainer: {
    alignItems: 'center',
  },
  emptyImage: {
    width: SCREEN_WIDTH * 0.33,
    height: SCREEN_WIDTH * 0.33,
    marginBottom: 10,
  },
  emptyText: {
    padding: 20,
    fontSize: 17,
    textAlign: 'center',
    color: KevaColors.inactiveText,
  },
  loadMoreSpinner: {
    paddingVertical: 18,
  },
});

function mapStateToProps(state) {
  return {
    otherNamespaceList: state.otherNamespaceList,
    keyValueList: state.keyValueList,
  };
}

export default connect(mapStateToProps)(ExploreFollow);
