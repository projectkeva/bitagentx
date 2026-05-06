import React, { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-community/async-storage';
import ImagePicker from 'react-native-image-crop-picker';
import { BlueNavigationStyle, BlueLoading, SafeBlueArea, BlueHeaderDefaultSub, BlueListItem } from '../../BlueComponents';
import { showStatus, toastError } from '../../util';
import { getUserAvatarUri, removeUserAvatar, saveUserAvatarFromSource } from '../../common/userAvatar';
import { getRoleLangStorageKey } from '../data/agentrole_paths';
import { useNavigation } from 'react-navigation-hooks';

const loc = require('../../loc');

const AVATAR_I18N = {
  en: {
    title: 'User Avatar',
    pick: 'Change avatar',
    remove: 'Remove avatar',
    removeConfirm: 'Remove current avatar?',
    removeSuccess: 'Avatar removed',
    saveSuccess: 'Avatar updated',
    back: 'Back to settings',
    help: 'Tap the avatar or “Change avatar” to upload a local image as the user-side message avatar.',
    cancel: 'Cancel',
    ok: 'OK',
  },
  'zh-cn': {
    title: '用户头像',
    pick: '更换头像',
    remove: '移除头像',
    removeConfirm: '确定要移除当前头像吗？',
    removeSuccess: '头像已移除',
    saveSuccess: '头像已更新',
    back: '返回设置',
    help: '点击头像或“更换头像”，可以上传本地图像作为用户侧消息头像。',
    cancel: '取消',
    ok: '确定',
  },
  'zh-tw': {
    title: '使用者頭像',
    pick: '更換頭像',
    remove: '移除頭像',
    removeConfirm: '確定要移除目前頭像嗎？',
    removeSuccess: '頭像已移除',
    saveSuccess: '頭像已更新',
    back: '返回設定',
    help: '點擊頭像或「更換頭像」，可以上傳本機圖片作為使用者側訊息頭像。',
    cancel: '取消',
    ok: '確定',
  },
  ja: {
    title: 'ユーザーアバター',
    pick: 'アバターを変更',
    remove: 'アバターを削除',
    removeConfirm: '現在のアバターを削除しますか？',
    removeSuccess: 'アバターを削除しました',
    saveSuccess: 'アバターを更新しました',
    back: '設定に戻る',
    help: 'アバターまたは「アバターを変更」をタップすると、ローカル画像をユーザー側メッセージのアバターとしてアップロードできます。',
    cancel: 'キャンセル',
    ok: 'OK',
  },
  ko: {
    title: '사용자 아바타',
    pick: '아바타 변경',
    remove: '아바타 제거',
    removeConfirm: '현재 아바타를 제거할까요?',
    removeSuccess: '아바타가 제거되었습니다',
    saveSuccess: '아바타가 업데이트되었습니다',
    back: '설정으로 돌아가기',
    help: '아바타 또는 “아바타 변경”을 누르면 로컬 이미지를 사용자 메시지 아바타로 업로드할 수 있습니다.',
    cancel: '취소',
    ok: '확인',
  },
  es: {
    title: 'Avatar de usuario',
    pick: 'Cambiar avatar',
    remove: 'Eliminar avatar',
    removeConfirm: '¿Eliminar el avatar actual?',
    removeSuccess: 'Avatar eliminado',
    saveSuccess: 'Avatar actualizado',
    back: 'Volver a ajustes',
    help: 'Toca el avatar o “Cambiar avatar” para subir una imagen local como avatar de los mensajes del usuario.',
    cancel: 'Cancelar',
    ok: 'OK',
  },
  fr: {
    title: 'Avatar utilisateur',
    pick: 'Changer l’avatar',
    remove: 'Supprimer l’avatar',
    removeConfirm: 'Supprimer l’avatar actuel ?',
    removeSuccess: 'Avatar supprimé',
    saveSuccess: 'Avatar mis à jour',
    back: 'Retour aux réglages',
    help: 'Touchez l’avatar ou « Changer l’avatar » pour téléverser une image locale comme avatar des messages utilisateur.',
    cancel: 'Annuler',
    ok: 'OK',
  },
};

const normalizeRoleLang = lang => {
  const raw = String(lang || '').trim().toLowerCase();
  if (raw === 'zh' || raw === 'zh-hans') return 'zh-cn';
  if (raw === 'zh-hant') return 'zh-tw';
  if (raw === 'zh-cn' || raw === 'zh-tw' || raw === 'en' || raw === 'ja' || raw === 'ko' || raw === 'es' || raw === 'fr') return raw;
  return 'en';
};

const UserAvatarSettings = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [avatarUri, setAvatarUri] = useState(null);
  const [roleLang, setRoleLang] = useState('en');
  const navigation = useNavigation();
  const { navigate, goBack, addListener } = navigation;
  const t = AVATAR_I18N[roleLang] || AVATAR_I18N.en;

  const loadRoleLang = async () => {
    const agentId = navigation?.state?.params?.agentId || 'default';
    const stored = await AsyncStorage.getItem(getRoleLangStorageKey(agentId)).catch(() => null);
    const fallback = stored || (await AsyncStorage.getItem(getRoleLangStorageKey('default')).catch(() => null));
    setRoleLang(normalizeRoleLang(fallback));
  };

  const loadAvatar = async () => {
    const uri = await getUserAvatarUri();
    setAvatarUri(uri);
  };

  const refresh = async () => {
    setIsLoading(true);
    await Promise.all([loadAvatar(), loadRoleLang()]);
    setIsLoading(false);
  };

  useEffect(() => {
    refresh();
    const listener = addListener?.('didFocus', () => {
      refresh();
    });
    return () => {
      if (listener && typeof listener.remove === 'function') {
        listener.remove();
      }
    };
  }, []);

  const handlePick = async () => {
    try {
      const selected = await ImagePicker.openPicker({
        width: 512,
        height: 512,
        cropping: true,
        mediaType: 'photo',
      });
      const imagePath = selected?.path;
      if (!imagePath) {
        return;
      }
      await saveUserAvatarFromSource(imagePath);
      await loadAvatar();
      showStatus(t.saveSuccess);
    } catch (error) {
      if (error?.code === 'E_PICKER_CANCELLED' || error?.message?.includes('cancel')) {
        return;
      }
      toastError(error);
    }
  };

  const handleRemove = async () => {
    Alert.alert(
      t.remove,
      t.removeConfirm,
      [
        { text: t.cancel, style: 'cancel' },
        {
          text: t.ok,
          onPress: async () => {
            try {
              await removeUserAvatar();
              await loadAvatar();
              showStatus(t.removeSuccess);
                    } catch (error) {
              toastError(error);
            }
          },
        },
      ],
      { cancelable: true },
    );
  };

  return isLoading ? (
    <BlueLoading />
  ) : (
    <SafeBlueArea forceInset={{ horizontal: 'always' }} style={{ flex: 1 }}>
      <BlueHeaderDefaultSub
        leftText={t.title}
        rightComponent={null}
        leftComponent={(
          <TouchableOpacity style={styles.backButton} onPress={() => (goBack ? goBack() : navigate('Settings'))}>
            <Text style={styles.backButtonText}>‹</Text>
          </TouchableOpacity>
        )}
      />
      <ScrollView contentContainerStyle={styles.container}>
        <TouchableOpacity style={styles.avatarWrap} onPress={handlePick} activeOpacity={0.9}>
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatar} resizeMode="cover" />
          ) : (
            <View style={[styles.avatar, styles.placeholder]}>
              <View style={styles.placeholderDot} />
            </View>
          )}
          <BlueListItem
            title={t.pick}
            component={TouchableOpacity}
            onPress={handlePick}
            chevron
          />
          <Text style={styles.helpText}>{t.help}</Text>
        </TouchableOpacity>

        {avatarUri ? (
          <BlueListItem
            title={t.remove}
            component={TouchableOpacity}
            onPress={handleRemove}
            chevron
          />
        ) : null}

        <BlueListItem
          title={t.back}
          component={TouchableOpacity}
          onPress={() => navigate('Settings')}
          chevron
        />
      </ScrollView>
    </SafeBlueArea>
  );
};

const styles = StyleSheet.create({
  backButton: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  backButtonText: {
    fontSize: 28,
    lineHeight: 28,
    color: '#0c0c0c',
    fontWeight: '500',
  },
  container: {
    paddingTop: 16,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  avatarWrap: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 128,
    height: 128,
    borderRadius: 64,
    marginBottom: 12,
    backgroundColor: '#f0f0f0',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#9e9e9e',
  },
  helpText: {
    width: '100%',
    marginTop: -4,
    marginBottom: 8,
    paddingHorizontal: 8,
    color: '#6b7280',
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
});

UserAvatarSettings.navigationOptions = {
  ...BlueNavigationStyle,
  headerShown: false,
};

export default UserAvatarSettings;
