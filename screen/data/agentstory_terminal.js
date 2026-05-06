import React from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  SafeAreaView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

const StyleSheet = require('../../PlatformStyleSheet');

const COMMAND_TOKEN_REGEX =
  /\/(?:r|welcome|m)\b(?:\s+<[^>\n]+>)?(?:\s+(?!—)[^\/\n—,]+)?|\/(?:d|h|block|a|linkstart)\b/gi;
const COMMAND_DISPLAY_TOKEN_REGEX = /\[\[([^\]|]+)\|([^\]]+)\]\]/gi;
const STORY_CHOICE_PREFIX_RE =
  /^\s*(?:\[\s*([A-Za-z]|\d{1,2})\s*\]|【\s*([A-Za-z]|\d{1,2})\s*】|\(\s*([A-Za-z]|\d{1,2})\s*\)|（\s*([A-Za-z]|\d{1,2})\s*）|([A-Za-z]|\d{1,2})\s*[).:：、．])\s*(.+)$/;

const stripMarkdownWrap = s => {
  let t = String(s || '').trim();
  if ((t.startsWith('**') && t.endsWith('**')) || (t.startsWith('__') && t.endsWith('__'))) {
    t = t.slice(2, -2).trim();
  }
  return t;
};

class AgentStoryTerminal extends React.PureComponent {
  constructor(props) {
    super(props);
    this.listRef = null;
    this.didInitialScroll = false;
    this.isNearBottom = true;
    this.lastContentHeight = 0;
    this.forceScrollToBottomOnce = false;
    this.pendingScrollBottomTimeouts = [];
    this.lastHandledScrollRequestId = props.terminalScrollRequestId || 0;
  }

  componentDidUpdate(prevProps) {
    const prevRequestId = prevProps.terminalScrollRequestId || 0;
    const nextRequestId = this.props.terminalScrollRequestId || 0;
    if (nextRequestId !== prevRequestId && nextRequestId !== this.lastHandledScrollRequestId) {
      this.lastHandledScrollRequestId = nextRequestId;
      this.forceScrollToBottomOnce = true;
      this.scheduleBottomFollow();
    }
    if (prevProps.messages !== this.props.messages && (this.props.messages || []).length > 0 && !this.didInitialScroll) {
      this.forceScrollToBottomOnce = true;
    }
  }

  componentWillUnmount() {
    if (Array.isArray(this.pendingScrollBottomTimeouts)) {
      this.pendingScrollBottomTimeouts.forEach(timer => clearTimeout(timer));
      this.pendingScrollBottomTimeouts = [];
    }
  }

  emitIntent = (type, payload = {}) => {
    this.props.onIntent?.({ type, ...payload });
  };

  shouldShowTimestamp = index => {
    const messages = Array.isArray(this.props.messages) ? this.props.messages : [];
    const current = messages[index];
    if (!current) {
      return false;
    }
    if (index === 0) {
      return true;
    }
    const prev = messages[index - 1];
    const currentTs = current.timestamp || current.t || 0;
    const prevTs = prev.timestamp || prev.t || 0;
    return currentTs - prevTs > 30 * 60 * 1000;
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

  isInteractiveCommand = commandText => Boolean(String(commandText || '').trim());

  getCommandSegments = text => {
    if (!text) {
      return [];
    }
    const segments = [];
    const commandRegex = new RegExp(COMMAND_TOKEN_REGEX);
    const displayRegex = new RegExp(COMMAND_DISPLAY_TOKEN_REGEX);
    let lastIndex = 0;

    while (lastIndex < text.length) {
      commandRegex.lastIndex = lastIndex;
      displayRegex.lastIndex = lastIndex;
      const commandMatch = commandRegex.exec(text);
      const displayMatch = displayRegex.exec(text);
      let nextMatch = null;
      let matchType = null;

      if (commandMatch && displayMatch) {
        if (displayMatch.index <= commandMatch.index) {
          nextMatch = displayMatch;
          matchType = 'display';
        } else {
          nextMatch = commandMatch;
          matchType = 'command';
        }
      } else if (displayMatch) {
        nextMatch = displayMatch;
        matchType = 'display';
      } else if (commandMatch) {
        nextMatch = commandMatch;
        matchType = 'command';
      }

      if (!nextMatch) {
        segments.push({ text: text.slice(lastIndex), isCommand: false });
        break;
      }

      if (nextMatch.index > lastIndex) {
        segments.push({ text: text.slice(lastIndex, nextMatch.index), isCommand: false });
      }

      if (matchType === 'display') {
        const commandText = nextMatch[1];
        const displayText = nextMatch[2];
        segments.push({
          text: displayText,
          displayText,
          commandText,
          isCommand: this.isInteractiveCommand(commandText),
        });
        lastIndex = nextMatch.index + nextMatch[0].length;
      } else {
        const commandText = nextMatch[0];
        segments.push({ text: commandText, isCommand: this.isInteractiveCommand(commandText) });
        lastIndex = nextMatch.index + nextMatch[0].length;
      }
    }
    return segments;
  };

  parseStoryLineSegments = line => {
    const text = String(line || '');
    if (!text) {
      return [];
    }
    const chunks = text.split(/(\s*[\/|]\s*)/);
    const segments = [];
    chunks.forEach(chunk => {
      if (!chunk) {
        return;
      }
      const trimmed = stripMarkdownWrap(chunk);
      const isDivider = /^\s*[\/|]\s*$/.test(chunk);
      if (!trimmed || isDivider) {
        segments.push({ type: 'text', text: chunk });
        return;
      }
      const prefixMatch = trimmed.match(STORY_CHOICE_PREFIX_RE);
      if (prefixMatch) {
        const marker = (prefixMatch[1] || prefixMatch[2] || prefixMatch[3] || prefixMatch[4] || prefixMatch[5] || '').trim();
        const content = (prefixMatch[6] || '').trim();
        if (marker && content.length >= 1) {
          const send = /^\d+$/.test(marker) ? marker : marker.toUpperCase();
          segments.push({ type: 'choice', raw: chunk, send, display: content });
          return;
        }
      }
      const ynMatch = trimmed.match(/^(yes|no|y|n)\s*$/i);
      if (ynMatch) {
        const value = ynMatch[1].toLowerCase();
        const send = value === 'yes' || value === 'y' ? 'Y' : 'N';
        segments.push({ type: 'choice', raw: chunk, send, display: trimmed });
        return;
      }
      segments.push({ type: 'text', text: chunk });
    });
    return segments;
  };

  buildStoryInlineLines = text => {
    const raw = String(text || '');
    if (!raw) {
      return [];
    }
    return raw
      .split(/\r?\n/)
      .map(lineRaw => {
        const segments = this.parseStoryLineSegments(lineRaw);
        const normalizedSegments = segments.length > 0 ? segments : [{ type: 'text', text: lineRaw }];
        const hasChoice = normalizedSegments.some(segment => segment?.type === 'choice');
        if (hasChoice) {
          return { type: 'line', segments: normalizedSegments, rawLine: lineRaw };
        }
        const mergedText = normalizedSegments.map(segment => String(segment?.text || '')).join('').trim();
        if (!mergedText) {
          return null;
        }
        if (/^(?:input|select|choose|reply)\s+\d+(?:\s*[-~to]\s*\d+)?\b/i.test(mergedText)) {
          return null;
        }
        return { type: 'line', segments: [{ type: 'text', text: mergedText }], rawLine: lineRaw };
      })
      .filter(Boolean);
  };

  cleanStoryChoiceLabel = value =>
    String(value || '')
      .replace(/^\s*(?:\[\s*[A-Za-z0-9]{1,2}\s*\]|【\s*[A-Za-z0-9]{1,2}\s*】|\(\s*[A-Za-z0-9]{1,2}\s*\)|（\s*[A-Za-z0-9]{1,2}\s*）|[A-Za-z0-9]{1,2}\s*[).:：、．])\s*/, '')
      .trim();

  handleScroll = event => {
    const { contentOffset, layoutMeasurement, contentSize } = event.nativeEvent;
    if ((contentOffset?.y || 0) <= 20) {
      this.emitIntent('loadMoreHistory');
    }
    const paddingToBottom = 80;
    const layoutHeight = layoutMeasurement?.height || 0;
    const contentHeight = contentSize?.height || 0;
    const offsetY = contentOffset?.y || 0;
    this.isNearBottom = layoutHeight + offsetY >= contentHeight - paddingToBottom;
  };

  scheduleBottomFollow = () => {
    if (Array.isArray(this.pendingScrollBottomTimeouts)) {
      this.pendingScrollBottomTimeouts.forEach(timer => clearTimeout(timer));
      this.pendingScrollBottomTimeouts = [];
    }
    const run = () => this.scrollToBottomOffset(false);
    requestAnimationFrame(() => run());
    [80, 180].forEach(delay => {
      const timer = setTimeout(() => run(), delay);
      this.pendingScrollBottomTimeouts.push(timer);
    });
  };

  scrollToBottomOffset = (animated = false) => {
    if (!this.listRef) {
      return;
    }
    if (typeof this.listRef.scrollToEnd === 'function') {
      try {
        this.listRef.scrollToEnd({ animated });
        return;
      } catch {}
    }
    const offset = Math.max(0, (this.lastContentHeight || 0) + 200);
    this.listRef.scrollToOffset({ offset, animated });
  };

  handleContentSizeChange = (width, height) => {
    const prevHeight = this.lastContentHeight || 0;
    this.lastContentHeight = height || 0;
    const heightChanged = Math.abs(this.lastContentHeight - prevHeight) > 2;
    const shouldFollow = this.forceScrollToBottomOnce || this.isNearBottom;
    if (shouldFollow && this.lastContentHeight > 0 && heightChanged) {
      this.scheduleBottomFollow();
    }
    this.forceScrollToBottomOnce = false;
  };

  renderAvatar = sender => {
    const isUser = sender === 'user';
    if (isUser) {
      const userAvatar = this.props.userAvatar;
      if (userAvatar?.type === 'image') {
        return (
          <View style={[styles.avatarWrapper, styles.userAvatarWrapper]}>
            <Image source={{ uri: userAvatar.uri }} style={styles.avatarImage} resizeMode="cover" />
          </View>
        );
      }
      if (userAvatar?.type === 'fallback') {
        return (
          <View style={[styles.avatarWrapper, styles.userAvatarWrapper, styles.userAvatarFallback, { backgroundColor: userAvatar.color }]}>
            <Text style={styles.userAvatarText}>{userAvatar.initials}</Text>
          </View>
        );
      }
      return <View style={[styles.avatarWrapper, styles.userAvatarWrapper, styles.userAvatarBlank]} />;
    }
    const source = this.props.agentAvatarSource || require('../../img/bluebeast.png');
    return (
      <View style={[styles.avatarWrapper, styles.agentAvatarWrapper]}>
        <Image source={source} style={styles.avatarImage} resizeMode="cover" />
      </View>
    );
  };

  renderStoryChoiceDock = () => {
    const {
      currentStoryChoices,
      dockDisplayState,
      storyLinkStartFeedbackActive,
      storyMenuText,
    } = this.props;
    const choices = Array.isArray(currentStoryChoices) ? currentStoryChoices : [];
    const isChoiceState = dockDisplayState === 'choices';
    const isDisconnectedState = dockDisplayState === 'start';
    const isWaitingSignalState = dockDisplayState === 'awaiting';
    const isRoleRequiredState = String(this.props.storyLinkStatus || '') === String(storyMenuText.roleRequired || '');
    const panelTitle = isRoleRequiredState ? storyMenuText.roleRequired : isDisconnectedState ? storyMenuText.establishLink : isWaitingSignalState ? storyMenuText.awaitingSignal : 'A.G.U Comm';
    const panelMode = isRoleRequiredState ? 'ROLE CHECK' : isDisconnectedState ? 'LINK START' : isWaitingSignalState ? 'SIGNAL WAIT' : 'CHOICE GRID';
    const showLinkStartFeedback = isDisconnectedState && storyLinkStartFeedbackActive;
    const lightColor = isDisconnectedState ? '#596172' : isWaitingSignalState ? '#ffd84d' : '#6dff97';

    return (
      <View style={styles.storyChoiceDock}>
        <View style={styles.storyChoicePanelFrame}>
          <View style={styles.storyChoicePanelHeader}>
            <View style={styles.storyChoicePanelHeaderTextBlock}>
              <Text style={styles.storyChoicePanelLabel}>{panelTitle}</Text>
            </View>
            <View style={styles.storyChoicePanelHeaderCenter}>
              <View style={styles.storyChoicePanelLightsCentered}>
                <View style={[styles.storyChoicePanelLight, { backgroundColor: lightColor }]} />
                <View style={[styles.storyChoicePanelLight, { backgroundColor: lightColor }]} />
                <View style={[styles.storyChoicePanelLight, { backgroundColor: lightColor }]} />
              </View>
            </View>
            <Text style={styles.storyChoicePanelMode}>{panelMode}</Text>
          </View>
          <View style={styles.storyChoicePanelScreen}>
            {isDisconnectedState ? (
              <TouchableOpacity
                style={[styles.storyChoiceIdleCard, showLinkStartFeedback && styles.storyChoiceIdleCardPressed]}
                activeOpacity={0.85}
                hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
                onPress={() => this.emitIntent('linkStart')}
              >
                <Text style={[styles.storyChoiceIdleText, showLinkStartFeedback && styles.storyChoiceIdleTextPressed]}>
                  {isRoleRequiredState ? (storyMenuText.roleRequiredDetail || 'Role does not exist. Connection aborted.') : showLinkStartFeedback ? (storyMenuText.linkStartDetected || 'Link Start detected…') : storyMenuText.establishLink}
                </Text>
              </TouchableOpacity>
            ) : isWaitingSignalState ? (
              <View style={styles.storyChoiceIdleCard}>
                <Text style={styles.storyChoiceIdleText}>{storyMenuText.awaitingSignal}</Text>
              </View>
            ) : (
              choices.map((choice, index) => {
                const cleanLabel = this.cleanStoryChoiceLabel(choice.label || choice.send);
                const isIdleButton = choice?.variant === 'idle';
                return (
                  <TouchableOpacity
                    key={`${choice.key || choice.send || 'choice'}-${index}`}
                    style={[styles.storyChoiceButton, isIdleButton && styles.storyChoiceButtonIdle]}
                    activeOpacity={0.85}
                    onPress={() => this.emitIntent('storyChoice', { send: choice.send, display: cleanLabel, raw: choice.label, choice })}
                  >
                    <Text style={[styles.storyChoiceButtonText, isIdleButton && styles.storyChoiceIdleTextPressed]}>{cleanLabel}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>
      </View>
    );
  };

  renderMessage = ({ item, index }) => {
    const {
      isStoryScope,
      storyShortMode,
      latestSubmittedChoiceAt,
      shouldSuppressStoryChoiceState,
      currentStoryMessages,
      stripStoryChoiceLines,
      isValidCommandText,
      storyUiText,
    } = this.props;
    const showDigest = isStoryScope && storyShortMode && item?._isHistory === true;
    const isStoryDigest = isStoryScope && Boolean(item?.ref) && showDigest;
    const isUser = item?.sender === 'user' || item?.role === 'user';
    const rawText = showDigest ? item?.digest || item?.summary || item?.text || '' : item?.text || '';
    const forceCommandRender = item?._renderMode === 'commands';
    const shouldSuppressChoiceText = isStoryScope && !isUser && !isStoryDigest && !forceCommandRender;
    const text = shouldSuppressChoiceText ? stripStoryChoiceLines(rawText) : rawText;
    if (isStoryScope && !isUser && !isStoryDigest && !forceCommandRender && !String(text || '').trim()) {
      return null;
    }
    const hasCopyLink = Boolean(item.copyText && item.linkLabel) && !isStoryDigest;
    const commandSegments = isUser && !isStoryDigest && isValidCommandText(text) ? [{ text, isCommand: true }] : this.getCommandSegments(text);
    const hasCommand = Array.isArray(commandSegments) && commandSegments.some(segment => segment.isCommand || segment.commandText);
    const inlineLines = isStoryScope && !forceCommandRender && !isUser && !isStoryDigest && !hasCommand ? this.buildStoryInlineLines(text) : null;
    const hasCommandTokens = commandSegments.some(segment => segment.isCommand);
    const messageTextStyle = [styles.messageText, isUser ? styles.userText : styles.agentText];
    const commandTextStyle = isUser ? styles.commandTextUser : styles.commandText;
    const isSubmittedChoiceEcho = isStoryScope && isUser && item?._choiceMeta && Number(item?.timestamp || item?.t || 0) <= latestSubmittedChoiceAt && /UPLINK SENT/i.test(String(this.props.storyLinkStatus || ''));

    return (
      <>
        {this.shouldShowTimestamp(index) && (
          <View style={styles.timestampContainer}>
            <Text style={styles.timestampText}>{this.formatTimestamp(item.timestamp || item.t)}</Text>
          </View>
        )}
        <View style={[styles.messageRow, isUser ? styles.userRow : styles.agentRow]}>
          {!isUser && (
            <TouchableOpacity activeOpacity={0.7} onPress={() => this.emitIntent('avatarPress', { text })} style={styles.avatarPressable}>
              {this.renderAvatar('agent')}
            </TouchableOpacity>
          )}
          <View style={[styles.bubbleColumn, isUser ? styles.userBubbleColumn : styles.agentBubbleColumn]}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={hasCopyLink || hasCommandTokens ? undefined : () => (isStoryDigest ? this.emitIntent('digestPress', { item }) : this.emitIntent('messagePress', { text: showDigest ? item?.text || '' : text }))}
              onLongPress={hasCopyLink || hasCommandTokens || isStoryDigest ? undefined : () => this.emitIntent('messageLongPress', { text: showDigest ? item?.text || '' : text })}
              style={[styles.messageBubble, isUser ? styles.userBubble : styles.agentBubble]}
            >
              <Text suppressHighlighting={isSubmittedChoiceEcho} style={messageTextStyle}>
                {inlineLines
                  ? inlineLines.map((lineItem, lineIndex) => (
                      <Text key={`${item.id}-ln-${lineIndex}`}>
                        {lineItem.segments.map((segment, segmentIndex) =>
                          segment.type === 'choice' ? (
                            <Text
                              key={`${item.id}-ln-${lineIndex}-seg-${segmentIndex}`}
                              style={[messageTextStyle, styles.storyChoiceInline]}
                              onPress={() => this.emitIntent('storyChoice', { send: segment.send, display: segment.display, raw: segment.raw })}
                              suppressHighlighting
                            >
                              {segment.raw}
                            </Text>
                          ) : (
                            <Text key={`${item.id}-ln-${lineIndex}-seg-${segmentIndex}`} style={messageTextStyle}>
                              {segment.text}
                            </Text>
                          ),
                        )}
                        {(() => {
                          if (lineIndex === inlineLines.length - 1) {
                            return '';
                          }
                          const lineHasChoice =
                            lineItem?.type === 'choice' || lineItem?.segments?.some(segment => segment?.type === 'choice');
                          return lineHasChoice ? '\n\n' : '\n';
                        })()}
                      </Text>
                    ))
                  : commandSegments.length === 0
                    ? text
                    : commandSegments.map((segment, segmentIndex) =>
                        segment.isCommand ? (
                          <Text
                            key={`${item.id}-command-${segmentIndex}`}
                            style={[messageTextStyle, commandTextStyle]}
                            onPress={() => this.emitIntent('command', { commandText: segment.commandText || segment.text })}
                          >
                            {segment.displayText || segment.text}
                          </Text>
                        ) : (
                          <Text key={`${item.id}-text-${segmentIndex}`} style={messageTextStyle}>
                            {segment.text}
                          </Text>
                        ),
                      )}
              </Text>
              {hasCopyLink && (
                <TouchableOpacity activeOpacity={0.7} onPress={() => this.emitIntent('messagePress', { text: item.copyText })}>
                  <Text style={[styles.messageText, styles.linkText]}>{item.linkLabel}</Text>
                </TouchableOpacity>
              )}
            </TouchableOpacity>
            {isStoryDigest && item.regen === 1 && (
              <TouchableOpacity activeOpacity={0.7} style={styles.regenButton} onPress={() => this.emitIntent('regenDigest', { item })}>
                <Text style={styles.regenButtonText}>{storyUiText.regenDigest}</Text>
              </TouchableOpacity>
            )}
          </View>
          {isUser && (
            <TouchableOpacity activeOpacity={0.7} onPress={() => this.emitIntent('avatarPress', { text })} style={styles.avatarPressable}>
              {this.renderAvatar('user')}
            </TouchableOpacity>
          )}
        </View>
      </>
    );
  };

  render() {
    const { messages, storyMenuText } = this.props;
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
              data={messages}
              keyExtractor={item => item.id}
              renderItem={this.renderMessage}
              contentContainerStyle={(messages || []).length === 0 ? styles.emptyContainer : styles.listContent}
              ListEmptyComponent={() => (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>{storyMenuText.commTerminalPreparing}</Text>
                </View>
              )}
              onContentSizeChange={this.handleContentSizeChange}
              onLayout={() => {
                if (!this.didInitialScroll && (messages || []).length > 0) {
                  this.forceScrollToBottomOnce = true;
                  this.didInitialScroll = true;
                  requestAnimationFrame(() => this.scrollToBottomOffset(false));
                }
              }}
              onScroll={this.handleScroll}
              scrollEventThrottle={16}
              keyboardShouldPersistTaps="handled"
            />
          </View>
          {this.renderStoryChoiceDock()}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }
}

export default AgentStoryTerminal;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a0d15',
  },
  chatContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  listContent: {
    paddingBottom: 12,
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
  commandText: {
    color: '#0b1224',
    backgroundColor: '#d6e8ff',
    textDecorationLine: 'none',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  commandTextUser: {
    color: '#0b1224',
    backgroundColor: '#d6e8ff',
    textDecorationLine: 'none',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  linkText: {
    color: '#0b1224',
    backgroundColor: '#d6e8ff',
    textDecorationLine: 'none',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 6,
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
  regenButton: {
    marginTop: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4f78ff',
  },
  regenButtonText: {
    color: '#4f78ff',
    fontSize: 12,
    fontWeight: '600',
  },
  storyChoiceInline: {
    color: '#d6e8ff',
    backgroundColor: '#162441',
    borderRadius: 4,
    overflow: 'hidden',
  },
  storyChoiceDock: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderTopColor: '#1b2336',
    backgroundColor: '#0a0f18',
    minHeight: 118,
  },
  storyChoicePanelFrame: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2d3a55',
    backgroundColor: '#0d1420',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    shadowColor: '#000000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -2 },
    elevation: 8,
  },
  storyChoicePanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  storyChoicePanelHeaderTextBlock: {
    flex: 1,
    alignItems: 'flex-start',
    marginRight: 8,
  },
  storyChoicePanelHeaderCenter: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  storyChoicePanelLightsCentered: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 5,
  },
  storyChoicePanelLight: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    marginRight: 6,
  },
  storyChoicePanelMode: {
    color: '#7fe7ff',
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.1,
    fontWeight: '700',
    textShadowColor: 'rgba(102, 255, 245, 0.28)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 5,
  },
  storyChoicePanelLabel: {
    color: '#9fc2ff',
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: 1.1,
    fontWeight: '700',
    textShadowColor: 'rgba(118, 191, 255, 0.35)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  storyChoicePanelScreen: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#182233',
    backgroundColor: '#0a111b',
    padding: 10,
  },
  storyChoiceButton: {
    borderRadius: 12,
    backgroundColor: '#111b2b',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#29476f',
  },
  storyChoiceButtonText: {
    color: '#d7f0ff',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
  },
  storyChoiceButtonIdle: {
    backgroundColor: '#2c3442',
    borderColor: '#5d6472',
  },
  storyChoiceIdleCard: {
    borderRadius: 12,
    backgroundColor: '#2c3442',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#4c586f',
  },
  storyChoiceIdleText: {
    color: '#eef3fb',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  storyChoiceIdleCardPressed: {
    backgroundColor: '#1d5f58',
    borderColor: '#78d7c4',
  },
  storyChoiceIdleTextPressed: {
    color: '#d9fff5',
  },
});
