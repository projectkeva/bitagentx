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
      bootPhase: 'log',
      isBooting: true,
      store: configureStore(),
    };
  }

  bootTicker = null;
  bootExitTimeout = null;
  bootSequenceIndex = 0;
  bootSequenceMessages = [
    'Agent manifest loaded // staging subsystems…',
    'Validating local storage integrity…',
    'Indexing wallets and establishing session…',
    'Priming on-chain cache…',
    'Syncing nodes and account telemetry…',
  ];

  appendBootLine = message => {
    this.setState(prevState => ({
      bootStatusLines: [...prevState.bootStatusLines, { message, id: `${Date.now()}-${prevState.bootStatusLines.length}` }],
    }));
  };

  startBootTicker = () => {
    this.appendBootLine('AGENT ID // Kevacoin runtime initializing…');
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
    this.appendBootLine('Unlocking vault and loading assets…');

    try {
      await BlueApp.startAndDecrypt();
      this.appendBootLine('Wallet payload loaded from disk');
    } catch (error) {
      console.warn('Failed to load wallets from disk', error);
      this.appendBootLine('Encountered an issue loading wallets // continuing startup');
    }

    this.appendBootLine('UI surface ready // handing off control');
    this.stopBootTicker();
    this.setState({ bootPhase: 'blackout' });
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

    if (this.state.bootPhase === 'blackout') {
      return <View pointerEvents="auto" style={[styles.bootOverlay, styles.bootOverlayBlackout]} />;
    }

    const lastIndex = this.state.bootStatusLines.length - 1;

    return (
      <View pointerEvents="auto" style={styles.bootOverlay}>
        <View style={styles.bootCard}>
          <Text style={styles.bootTitle}>AGENT BOOT LOG</Text>
          <View style={styles.bootLogContainer}>
            {this.state.bootStatusLines.map((line, index) => (
              <Text key={line.id} style={[styles.bootLine, index === lastIndex && styles.bootLineActive]}>
                {index === lastIndex ? '›' : '•'} {line.message}
              </Text>
            ))}
          </View>
          <Text style={styles.bootHint}>Booting services // please stand by</Text>
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
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  bootOverlayBlackout: {
    backgroundColor: 'black',
  },
  bootCard: {
    width: '100%',
    maxWidth: 420,
    padding: 20,
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
