import React from 'react';
import {
  Linking,
  DeviceEventEmitter,
  AppState,
  Clipboard,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  View,
  Text,
} from 'react-native';
import Modal from 'react-native-modal';
import { NavigationActions } from 'react-navigation';
import MainBottomTabs from './MainBottomTabs';
import NavigationService from './NavigationService';
import { BlueTextCentered, BlueButton } from './BlueComponents';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { Chain } from './models/bitcoinUnits';
import QuickActions from 'react-native-quick-actions';
import OnAppLaunch from './class/onAppLaunch';
import DeeplinkSchemaMatch from './class/deeplink-schema-match';
import BitcoinBIP70TransactionDecode from './bip70/bip70';
import { Provider } from 'react-redux';
import { configureStore } from './reducers';

const bitcoinModalString = 'Kevacoin address';
const lightningModalString = 'Lightning Invoice';
const loc = require('./loc');
const BlueApp = require('./BlueApp');

export default class App extends React.Component {
  navigator = null;

  constructor() {
    super();
    this.state = {
      appState: AppState.currentState,
      isClipboardContentModalVisible: false,
      clipboardContentModalAddressType: bitcoinModalString,
      clipboardContent: '',
      bootStatusLines: [],
      isBooting: true,
      store: configureStore(),
    };
  }

  bootTicker = null;
  bootExitTimeout = null;
  bootSequenceIndex = 0;
  bootSequenceMessages = [
    '启动序列就绪，准备加载组件…',
    '正在校验存储状态，确保数据安全…',
    '检查钱包索引并建立会话…',
    '载入链上数据缓存…',
    '同步节点与账户信息…',
  ];

  appendBootLine = message => {
    this.setState(prevState => ({
      bootStatusLines: [...prevState.bootStatusLines, { message, id: `${Date.now()}-${prevState.bootStatusLines.length}` }],
    }));
  };

  startBootTicker = () => {
    this.appendBootLine('启动 Kevacoin 桌面组件…');
    this.bootTicker = setInterval(() => {
      if (this.bootSequenceIndex < this.bootSequenceMessages.length) {
        this.appendBootLine(this.bootSequenceMessages[this.bootSequenceIndex]);
        this.bootSequenceIndex += 1;
      } else {
        this.stopBootTicker();
      }
    }, 700);
  };

  stopBootTicker = () => {
    if (this.bootTicker) {
      clearInterval(this.bootTicker);
      this.bootTicker = null;
    }
  };

  async componentDidMount() {
    Linking.addEventListener('url', this.handleOpenURL);
    AppState.addEventListener('change', this._handleAppStateChange);
    QuickActions.popInitialAction().then(this.popInitialAction);
    DeviceEventEmitter.addListener('quickActionShortcut', this.walletQuickActions);

    this.startBootTicker();
    this.appendBootLine('正在解锁应用并加载资源…');

    try {
      await BlueApp.startAndDecrypt();
      this.appendBootLine('本地钱包数据加载完成');
    } catch (error) {
      console.warn('Failed to load wallets from disk', error);
      this.appendBootLine('加载钱包数据遇到问题，正在尝试继续启动');
    }

    this.appendBootLine('界面初始化完成，准备进入应用');
    this.stopBootTicker();
    this.bootExitTimeout = setTimeout(() => this.setState({ isBooting: false }), 800);

    this._handleAppStateChange(undefined);
  }

  popInitialAction = async data => {
    if (data) {
      // eslint-disable-next-line no-unused-expressions
      this.navigator.dismiss;
      const wallet = BlueApp.getWallets().find(wallet => wallet.getID() === data.userInfo.url.split('wallet/')[1]);
      this.navigator.dispatch(
        NavigationActions.navigate({
          key: `WalletTransactions-${wallet.getID()}`,
          routeName: 'WalletTransactions',
          params: {
            wallet,
          },
        }),
      );
    } else {
      const url = await Linking.getInitialURL();
      if (url) {
        if (DeeplinkSchemaMatch.hasSchema(url)) {
          this.handleOpenURL({ url });
        }
      } else {
        const isViewAllWalletsEnabled = await OnAppLaunch.isViewAllWalletsEnabled();
        if (!isViewAllWalletsEnabled) {
          // eslint-disable-next-line no-unused-expressions
          this.navigator.dismiss;
          const selectedDefaultWallet = await OnAppLaunch.getSelectedDefaultWallet();
          const wallet = BlueApp.getWallets().find(wallet => wallet.getID() === selectedDefaultWallet.getID());
          if (wallet) {
            this.navigator.dispatch(
              NavigationActions.navigate({
                routeName: 'WalletTransactions',
                key: `WalletTransactions-${wallet.getID()}`,
                params: {
                  wallet,
                },
              }),
            );
          }
        }
      }
    }
  };

  walletQuickActions = data => {
    const wallet = BlueApp.getWallets().find(wallet => wallet.getID() === data.userInfo.url.split('wallet/')[1]);
    // eslint-disable-next-line no-unused-expressions
    this.navigator.dismiss;
    this.navigator.dispatch(
      NavigationActions.navigate({
        routeName: 'WalletTransactions',
        key: `WalletTransactions-${wallet.getID()}`,
        params: {
          wallet,
        },
      }),
    );
  };

  componentWillUnmount() {
    Linking.removeEventListener('url', this.handleOpenURL);
    AppState.removeEventListener('change', this._handleAppStateChange);
    this.stopBootTicker();
    if (this.bootExitTimeout) {
      clearTimeout(this.bootExitTimeout);
    }
  }

  _handleAppStateChange = async nextAppState => {
    if (BlueApp.getWallets().length > 0) {
      if ((this.state.appState.match(/background/) && nextAppState) === 'active' || nextAppState === undefined) {
        const clipboard = await Clipboard.getString();
        const isAddressFromStoredWallet = BlueApp.getWallets().some(wallet => {
          if (wallet.chain === Chain.ONCHAIN) {
            return wallet.weOwnAddress(clipboard);
          } else {
            return wallet.isInvoiceGeneratedByWallet(clipboard) || wallet.weOwnAddress(clipboard);
          }
        });
        const isBitcoinAddress =
          DeeplinkSchemaMatch.isBitcoinAddress(clipboard) || BitcoinBIP70TransactionDecode.matchesPaymentURL(clipboard);
        const isLightningInvoice = DeeplinkSchemaMatch.isLightningInvoice(clipboard);
        const isLNURL = DeeplinkSchemaMatch.isLnUrl(clipboard);
        const isBothBitcoinAndLightning = DeeplinkSchemaMatch.isBothBitcoinAndLightning(clipboard);
        if (
          !isAddressFromStoredWallet &&
          this.state.clipboardContent !== clipboard &&
          (isBitcoinAddress || isLightningInvoice || isLNURL || isBothBitcoinAndLightning)
        ) {
          if (isBitcoinAddress) {
            this.setState({ clipboardContentModalAddressType: bitcoinModalString });
          } else if (isLightningInvoice || isLNURL) {
            this.setState({ clipboardContentModalAddressType: lightningModalString });
          } else if (isBothBitcoinAndLightning) {
            this.setState({ clipboardContentModalAddressType: bitcoinModalString });
          }
          this.setState({ isClipboardContentModalVisible: true });
        }
        this.setState({ clipboardContent: clipboard });
      }
      if (nextAppState) {
        this.setState({ appState: nextAppState });
      }
    }
  };

  isBothBitcoinAndLightningWalletSelect = wallet => {
    const clipboardContent = this.state.clipboardContent;
    if (wallet.chain === Chain.ONCHAIN) {
      this.navigator &&
        this.navigator.dispatch(
          NavigationActions.navigate({
            routeName: 'SendDetails',
            params: {
              uri: clipboardContent.bitcoin,
              fromWallet: wallet,
            },
          }),
        );
    } else if (wallet.chain === Chain.OFFCHAIN) {
      this.navigator &&
        this.navigator.dispatch(
          NavigationActions.navigate({
            routeName: 'ScanLndInvoice',
            params: {
              uri: clipboardContent.lndInvoice,
              fromSecret: wallet.getSecret(),
            },
          }),
        );
    }
  };

  handleOpenURL = event => {
    DeeplinkSchemaMatch.navigationRouteFor(event, value => this.navigator && this.navigator.dispatch(NavigationActions.navigate(value)));
  };

  renderClipboardContentModal = () => {
    return (
      <Modal
        onModalShow={() => ReactNativeHapticFeedback.trigger('impactLight', { ignoreAndroidSystemSettings: false })}
        isVisible={this.state.isClipboardContentModalVisible}
        style={styles.bottomModal}
        onBackdropPress={() => {
          this.setState({ isClipboardContentModalVisible: false });
        }}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'position' : null}>
          <View style={styles.modalContent}>
            <BlueTextCentered>
              You have a {this.state.clipboardContentModalAddressType} on your clipboard. Would you like to use it for a transaction?
            </BlueTextCentered>
            <View style={styles.modelContentButtonLayout}>
              <BlueButton
                noMinWidth
                title={loc.send.details.cancel}
                onPress={() => this.setState({ isClipboardContentModalVisible: false })}
              />
              <View style={{ marginHorizontal: 8 }} />
              <BlueButton
                noMinWidth
                title="OK"
                onPress={() => {
                  this.setState({ isClipboardContentModalVisible: false }, async () => {
                    const clipboard = await Clipboard.getString();
                    setTimeout(() => this.handleOpenURL({ url: clipboard }), 100);
                  });
                }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    );
  };

  renderStartupOverlay = () => {
    if (!this.state.isBooting) {
      return null;
    }

    const lastIndex = this.state.bootStatusLines.length - 1;

    return (
      <View pointerEvents="auto" style={styles.bootOverlay}>
        <View style={styles.bootCard}>
          <Text style={styles.bootTitle}>系统启动</Text>
          <View style={styles.bootLogContainer}>
            {this.state.bootStatusLines.map((line, index) => (
              <Text key={line.id} style={[styles.bootLine, index === lastIndex && styles.bootLineActive]}>
                {index === lastIndex ? '›' : '•'} {line.message}
              </Text>
            ))}
          </View>
          <Text style={styles.bootHint}>正在准备，请稍候…</Text>
        </View>
      </View>
    );
  };

  render() {
    return (
      <Provider store={this.state.store}>
        <View style={{ flex: 1 }}>
          <MainBottomTabs
            ref={nav => {
              this.navigator = nav;
              NavigationService.setTopLevelNavigator(nav);
            }}
          />
          {this.renderStartupOverlay()}
          {this.renderClipboardContentModal()}
        </View>
      </Provider>
    );
  }
}

const styles = StyleSheet.create({
  modalContent: {
    backgroundColor: '#FFFFFF',
    padding: 22,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    minHeight: 200,
    height: 200,
  },
  bottomModal: {
    justifyContent: 'flex-end',
    margin: 0,
  },
  modelContentButtonLayout: {
    flexDirection: 'row',
    margin: 16,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  bootOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(12, 37, 80, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  bootCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 20,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
  },
  bootTitle: {
    color: '#f5f7fb',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  bootLogContainer: {
    marginBottom: 8,
  },
  bootLine: {
    color: '#cdd4e0',
    fontSize: 14,
    marginBottom: 6,
    fontFamily: 'Menlo',
  },
  bootLineActive: {
    color: '#ffffff',
  },
  bootHint: {
    color: '#9fb3d1',
    fontSize: 12,
    marginTop: 4,
  },
});
