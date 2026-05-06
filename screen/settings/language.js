import React, { Component } from 'react';
import { ScrollView, View } from 'react-native';
import AsyncStorage from '@react-native-community/async-storage';
import { BlueLoading, BlueText, SafeBlueArea, BlueListItem, BlueCard, BlueNavigationStyle } from '../../BlueComponents';
import PropTypes from 'prop-types';
import { Icon } from 'react-native-elements';
import KevaColors from '../../common/KevaColors';
import { normalizeStoryLangCode } from '../data/agentstory_i18n';
import { getRoleLangStorageKey } from '../data/namespace_i18n';
import { getSettingsText, resolveSettingsUiLanguage } from './settings_i18n';
import { buildSettingsLanguageItems, findSettingsLanguageOption } from './language_catalog';
let loc = require('../../loc');

export default class Language extends Component {
  static navigationOptions = ({ navigation }) => ({
    ...BlueNavigationStyle(),
    title: navigation.getParam('title', loc.settings.language),
  });

  constructor(props) {
    super(props);
    this.state = {
      isLoading: true,
      language: loc.getLanguage(),
      settingsUiLang: 'en',
      availableLanguages: buildSettingsLanguageItems(),
    };
  }

  async componentDidMount() {
    let settingsUiLang = 'en';
    try {
      settingsUiLang = await resolveSettingsUiLanguage();
    } catch (_) {}

    this.props.navigation?.setParams?.({ title: getSettingsText('language', settingsUiLang) });
    this.setState({
      isLoading: false,
      settingsUiLang,
    });
  }

  getRoleLangTargetIds = () => {
    const params = this.props.navigation?.state?.params || {};
    const candidates = [params.shortCode, params.namespaceId, params.id, params.agentId, params.peerShortCode, params.peerNamespaceId]
      .map(value => String(value || '').trim())
      .filter(Boolean);
    return [...new Set(candidates.length ? candidates : ['default'])];
  };

  syncRoleLanguage = async item => {
    const option = findSettingsLanguageOption(item?.value) || item || {};
    const normalized = normalizeStoryLangCode(option.roleCode || item?.roleCode || item?.value || 'en');
    await Promise.all(this.getRoleLangTargetIds().map(targetId => AsyncStorage.setItem(getRoleLangStorageKey(targetId), normalized)));
    return normalized;
  };

  setInterfaceLanguage = async item => {
    loc.saveLanguage(item.value);
    await this.syncRoleLanguage(item);
    this.setState({ language: item.value });
  };

  renderAppLanguageItem = item => (
    <BlueListItem
      key={`app-${item.value}`}
      onPress={() => this.setInterfaceLanguage(item)}
      title={item.label}
      {...(this.state.language === item.value
        ? {
            rightIcon: <Icon name="check" type="font-awesome" color="#0c2550" />,
          }
        : { hideChevron: true })}
    />
  );

  render() {
    if (this.state.isLoading) {
      return <BlueLoading />;
    }

    return (
      <SafeBlueArea forceInset={{ horizontal: 'always' }} style={{ flex: 1 }}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
          <BlueCard>
            <BlueText style={{ color: KevaColors.actionText, fontWeight: '600' }}>{getSettingsText('language', this.state.settingsUiLang)}</BlueText>
          </BlueCard>
          <View>{this.state.availableLanguages.map(this.renderAppLanguageItem)}</View>
          <BlueCard>
            <BlueText style={{ color: KevaColors.actionText }}>{getSettingsText('languageRestart', this.state.settingsUiLang)}</BlueText>
          </BlueCard>

        </ScrollView>
      </SafeBlueArea>
    );
  }
}

Language.propTypes = {
  navigation: PropTypes.shape({
    navigate: PropTypes.func,
    goBack: PropTypes.func,
  }),
};
