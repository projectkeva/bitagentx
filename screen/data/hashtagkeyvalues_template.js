const StyleSheet = require('../../PlatformStyleSheet');
const KevaColors = require('../../common/KevaColors');
import { THIN_BORDER } from '../../util';

const styles = StyleSheet.create({
  screenBackground: {
    flex: 1,
  },
  topContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex:1,
  },
  listStyle: {
    flex: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(125, 211, 252, 0.2)',
    backgroundColor: '#050915',
  },
  listContent: {
    paddingHorizontal: 10,
    paddingTop: 14,
    paddingBottom: 400,
  },
  masonryRow: {
    alignItems: 'flex-start',
  },
  card: {
    marginVertical: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(94, 234, 212, 0.32)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    shadowColor: '#7dd3fc',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
    overflow: 'hidden',
  },
  masonryCard: {
    flex: 1,
    marginHorizontal: 5,
  },
  masonryCardLeft: {
    marginTop: 8,
  },
  masonryCardRight: {
    marginTop: 8,
  },
  cardValueArea: {
    height: 240,
    marginHorizontal: 10,
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#0b1224',
    overflow: 'hidden',
  },
  cardMetaArea: {
    marginHorizontal: 10,
    marginTop: 8,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderRadius: 12,
    backgroundColor: '#0b1224',
  },
  keyDesc: {
    fontSize:15,
    color: '#E5E7EB',
    fontWeight: '700',
    lineHeight: 20,
    minHeight: 40,
  },
  valueDesc: {
    width: '100%',
    flexShrink: 1,
    fontSize:16,
    lineHeight: 22,
    color: '#CBD5E1'
  },
  actionIcon: {
    color: KevaColors.arrowIcon,
    paddingHorizontal: 15,
    paddingVertical: 7
  },
  talkIcon: {
    color: '#93C5FD',
    paddingLeft: 15,
    paddingRight: 2,
    paddingVertical: 7
  },
  shareIcon: {
    color: '#93C5FD',
    paddingLeft: 15,
    paddingRight: 2,
    paddingVertical: 7
  },
  count: {
    color: '#E0F2FE',
    paddingVertical: 7,
    fontWeight: '600',
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
    color: '#93C5FD',
    fontSize: 13,
    position: 'relative',
    top: -5,
  },
  previewImage: {
    width: '100%',
    height: 130,
    alignSelf: 'flex-start',
    borderRadius: 10,
    marginBottom: 6,
  },
  previewVideoContainer: {
    width: '100%',
    height: 130,
    marginBottom: 6,
  },
  previewVideo: {
    width: '100%',
    height: 130,
    alignSelf: 'flex-start',
    borderRadius: 10,
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  cardAuthorRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  avatarWrapper: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  generatedAvatarContainer: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  generatedAvatarImage: {
    width: 30,
    height: 30,
    borderRadius: 15,
    resizeMode: 'cover',
  },
  fallbackAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fallbackAvatarLabel: {
    color: '#E0F2FE',
    fontSize: 12,
    fontWeight: '700',
  },
  avatarProbe: {
    width: 1,
    height: 1,
    position: 'absolute',
    opacity: 0,
  },
  authorName: {
    flex: 1,
    color: '#E5E7EB',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 7,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 34,
  },
  likeIcon: {
    color: '#93C5FD',
  },
  cardActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingBottom: 4,
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
  inputContainer: {
    paddingBottom: 8,
    paddingTop: 5,
    paddingLeft: 8,
    backgroundColor: 'rgba(11, 18, 36, 0.92)',
    borderBottomWidth: THIN_BORDER,
    borderColor: 'rgba(125, 211, 252, 0.35)',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  textInput:
  {
    flex: 1,
    borderRadius: 10,
    backgroundColor: '#0b1224',
    color: '#E5E7EB',
    android: {
      paddingTop: 3,
      paddingBottom: 3,
    },
    ios: {
      paddingTop: 8,
      paddingBottom: 8,
    },
    paddingLeft: 7,
    paddingRight: 36,
    fontSize: 15,
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
});


export default styles;
