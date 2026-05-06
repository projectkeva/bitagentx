import React, { useCallback, useEffect, useState } from "react";
import PropTypes from "prop-types";
import {
  Image,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import LinearGradient from "react-native-linear-gradient";
import Icon from "react-native-vector-icons/Ionicons";
import { BlueNavigationStyle, BlueLoading } from "../../BlueComponents";
import { getUserAvatarUri } from "../../common/userAvatar";
import { useNavigation } from "react-navigation-hooks";
import { getSettingsText, resolveSettingsUiLanguage } from "./settings_i18n";
const StyleSheet = require("../../PlatformStyleSheet");
const loc = require("../../loc");

const SETTINGS_ITEMS = [
  {
    key: "general",
    titleKey: "general",
    route: "GeneralSettings"
  },
  {
    key: "language",
    titleKey: "language",
    route: "Language"
  },
  {
    key: "security",
    titleKey: "security",
    route: "EncryptStorage",
    testID: "SecurityButton"
  },
  {
    key: "network",
    titleKey: "network",
    route: "NetworkSettings"
  },
  {
    key: "about",
    titleKey: "about",
    route: "About",
    testID: "AboutButton"
  }
];

const SettingsRow = ({ title, subtitle, onPress, isLast, testID }) => (
  <TouchableOpacity
    activeOpacity={0.82}
    onPress={onPress}
    style={[styles.row, !isLast && styles.rowDivider]}
    testID={testID}
  >
    <View style={styles.rowTextBlock}>
      <Text style={styles.rowTitle}>{title}</Text>
      {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
    </View>
    <Icon name="ios-arrow-forward" size={20} color="#7DD3FC" />
  </TouchableOpacity>
);

SettingsRow.propTypes = {
  title: PropTypes.string.isRequired,
  subtitle: PropTypes.string,
  onPress: PropTypes.func.isRequired,
  isLast: PropTypes.bool,
  testID: PropTypes.string
};

SettingsRow.defaultProps = {
  subtitle: undefined,
  isLast: false,
  testID: undefined
};

const Settings = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [avatarUri, setAvatarUri] = useState(null);
  const [settingsUiLang, setSettingsUiLang] = useState("en");
  const { navigate, addListener } = useNavigation();

  const refreshAvatar = useCallback(async () => {
    const uri = await getUserAvatarUri();
    setAvatarUri(uri);
  }, []);

  const refreshSettingsUiLang = useCallback(async () => {
    try {
      setSettingsUiLang(await resolveSettingsUiLanguage());
    } catch (_) {
      setSettingsUiLang("en");
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      await Promise.all([refreshAvatar(), refreshSettingsUiLang()]);
      if (isMounted) setIsLoading(false);
    };

    init();

    const refreshAll = () => {
      refreshAvatar();
      refreshSettingsUiLang();
    };

    const listener = addListener?.("didFocus", refreshAll);
    return () => {
      isMounted = false;
      if (listener && typeof listener.remove === "function") {
        listener.remove();
      }
    };
  }, [addListener, refreshAvatar, refreshSettingsUiLang]);

  if (isLoading) {
    return <BlueLoading />;
  }

  return (
    <LinearGradient
      colors={["#050915", "#061025", "#050915"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.screenBackground}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerBlock}>
            <Text style={styles.eyebrowText}>SYSTEM</Text>
            <Text style={styles.headerTitle}>
              {getSettingsText("header", settingsUiLang)}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.avatarCard}
            onPress={() => navigate("UserAvatarSettings")}
            activeOpacity={0.9}
          >
            <View style={styles.avatarShell}>
              {avatarUri ? (
                <Image
                  source={{ uri: avatarUri }}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.avatarFallback} />
              )}
            </View>
            <View style={styles.avatarTextBlock}>
              <Text style={styles.avatarTitle}>
                {loc?.settings?.user_avatar || "用户头像"}
              </Text>
              <Text style={styles.avatarSubtitle}>
                {loc?.settings?.tap_to_modify_avatar || "点击设置我的头像"}
              </Text>
            </View>
            <Icon name="ios-arrow-forward" size={22} color="#7DD3FC" />
          </TouchableOpacity>

          <View style={styles.groupCard}>
            {SETTINGS_ITEMS.map((item, index) => (
              <SettingsRow
                key={item.key}
                title={getSettingsText(item.titleKey, settingsUiLang)}
                onPress={() => navigate(item.route, item.params)}
                isLast={index === SETTINGS_ITEMS.length - 1}
                testID={item.testID}
              />
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
};

Settings.navigationOptions = {
  ...BlueNavigationStyle,
  headerShown: false
};

const styles = StyleSheet.create({
  screenBackground: {
    flex: 1
  },
  safeArea: {
    flex: 1,
    backgroundColor: "transparent"
  },
  scrollView: {
    flex: 1,
    backgroundColor: "transparent"
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 40,
    backgroundColor: "transparent"
  },
  headerBlock: {
    marginBottom: 14,
    paddingHorizontal: 2
  },
  eyebrowText: {
    color: "#7DD3FC",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: 6
  },
  headerTitle: {
    color: "#E8F5FF",
    fontSize: 30,
    fontWeight: "700",
    letterSpacing: 0.4
  },
  avatarCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(94, 234, 212, 0.32)",
    backgroundColor: "rgba(11, 18, 36, 0.92)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 14,
    shadowColor: "#7DD3FC",
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6
  },
  avatarShell: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "rgba(125, 211, 252, 0.25)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    marginRight: 14
  },
  avatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28
  },
  avatarFallback: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#7DD3FC",
    opacity: 0.7
  },
  avatarTextBlock: {
    flex: 1,
    marginRight: 10
  },
  avatarTitle: {
    color: "#E8F5FF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2
  },
  avatarSubtitle: {
    color: "#94A3B8",
    fontSize: 13,
    marginTop: 4
  },
  groupCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(94, 234, 212, 0.32)",
    backgroundColor: "rgba(11, 18, 36, 0.92)",
    overflow: "hidden",
    shadowColor: "#7DD3FC",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5
  },
  row: {
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  rowTextBlock: {
    flex: 1,
    marginRight: 12
  },
  rowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(125, 211, 252, 0.12)"
  },
  rowTitle: {
    color: "#E5E7EB",
    fontSize: 16,
    fontWeight: "600"
  },
  rowSubtitle: {
    color: "#94A3B8",
    fontSize: 12,
    marginTop: 4
  }
});

export default Settings;
