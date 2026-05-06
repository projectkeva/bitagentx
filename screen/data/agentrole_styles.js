const StyleSheet = require('../../PlatformStyleSheet');
const KevaColors = require('../../common/KevaColors');

export default StyleSheet.create({
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
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAction: {
    paddingHorizontal: 16,
  },
  chatContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  warningContainer: {
    backgroundColor: '#120000',
  },
  warningChatContainer: {
    backgroundColor: '#120000',
  },
  historyModeBanner: {
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#101726',
    borderWidth: 1,
    borderColor: '#24304a',
    alignItems: 'center',
  },
  historyModeBannerText: {
    color: '#9fb2d9',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  warningHistoryModeBanner: {
    backgroundColor: '#1a0000',
    borderColor: '#ffd24a',
    borderWidth: 2,
    shadowColor: '#ff3b30',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  warningHistoryModeTitle: {
    color: '#ffd24a',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  historySpeakActions: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  historySpeakSpacer: {
    flex: 1,
  },
  historyBackButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#24304a',
  },
  warningHistoryBackButton: {
    backgroundColor: '#2a0000',
    borderWidth: 1,
    borderColor: '#ffd24a',
  },
  historyPagerActions: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyPagerActionsBottom: {
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyPagerButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#24304a',
  },
  historyPagerEdgeButton: {
    minWidth: 48,
    alignItems: 'center',
  },
  historyPagerStepButton: {
    minWidth: 58,
    alignItems: 'center',
    marginLeft: 6,
  },
  historyPagerButtonText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  historyPagerSliderWrap: {
    flex: 1,
    marginHorizontal: 8,
    justifyContent: 'center',
  },
  historyPagerSlider: {
    width: '100%',
    height: 34,
  },
  historyPagerText: {
    marginHorizontal: 12,
    color: '#9fb2d9',
    fontSize: 13,
    fontWeight: '600',
  },
  warningHistoryPagerActionsBottom: {
    marginTop: 12,
  },
  warningHistoryPagerButton: {
    backgroundColor: '#2a0000',
    borderWidth: 1,
    borderColor: '#ffd24a',
  },
  warningHistoryPagerButtonText: {
    color: '#ffd24a',
  },
  warningHistoryPagerText: {
    color: '#ffb300',
  },
  historySpeakButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#24304a',
  },
  historySpeakStopButton: {
    marginLeft: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#6a2430',
  },
  warningHistorySpeakButton: {
    backgroundColor: '#2a0000',
    borderWidth: 1,
    borderColor: '#ffd24a',
  },
  warningHistorySpeakStopButton: {
    backgroundColor: '#5a0000',
    borderWidth: 1,
    borderColor: '#ff6b57',
  },
  historySpeakButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
  },
  warningHistorySpeakButtonText: {
    color: '#ffd24a',
  },
  historyReaderBlock: {
    marginBottom: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#121826',
    borderWidth: 1,
    borderColor: '#24304a',
  },
  historyReaderText: {
    color: '#eef3ff',
    fontSize: 16,
    lineHeight: 24,
  },
  warningHistoryReaderBlock: {
    backgroundColor: '#160000',
    borderColor: '#ffcc33',
    borderWidth: 1.5,
  },
  warningHistoryReaderText: {
    color: '#ffe082',
  },
  switchWorldlineRewindButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#ffcc33',
  },
  switchWorldlineRewindButtonText: {
    color: '#2a1600',
    fontSize: 13,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 96,
  },
  historyReaderListContent: {
    paddingBottom: 4,
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
  systemCallBubble: {
    backgroundColor: '#b83246',
    borderColor: '#ff8b98',
    borderWidth: 1,
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
  storyChoiceWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  storyChoiceBtn: {
    marginRight: 8,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2f4d8f',
    backgroundColor: '#162441',
  },
  storyChoiceText: {
    color: '#d6e8ff',
    fontSize: 13,
    fontWeight: '600',
  },
  storyChoiceInline: {
    color: '#d6e8ff',
    backgroundColor: '#162441',
    borderRadius: 4,
    overflow: 'hidden',
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
  talkStatusContainer: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#11192e',
    borderWidth: 1,
    borderColor: '#24304a',
  },
  talkStatusText: {
    color: '#8ea6d8',
    fontSize: 13,
  },
  talkButton: {
    marginLeft: 10,
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#33415f',
  },
  talkButtonListening: {
    backgroundColor: '#5a2323',
  },
  talkButtonBusy: {
    backgroundColor: '#44557d',
  },
  talkButtonError: {
    backgroundColor: '#6b3340',
  },
  talkButtonLetter: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    lineHeight: 19,
  },
  talkButtonLetterRecording: {
    color: '#ff7a72',
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
