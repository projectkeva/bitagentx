import RNFS from 'react-native-fs';

export const USER_AVATAR_DIR = `${RNFS.DocumentDirectoryPath}/user_avatar`;
export const USER_AVATAR_PATH = `${USER_AVATAR_DIR}/user_avatar.jpg`;

export const getUserAvatarPath = () => USER_AVATAR_PATH;

export const ensureUserAvatarDir = async () => {
  try {
    const exists = await RNFS.exists(USER_AVATAR_DIR);
    if (!exists) {
      await RNFS.mkdir(USER_AVATAR_DIR);
    }
  } catch (e) {
    throw e;
  }
};

export const getUserAvatarUri = async () => {
  try {
    await ensureUserAvatarDir();
    const exists = await RNFS.exists(USER_AVATAR_PATH);
    if (!exists) {
      return null;
    }
    return `file://${USER_AVATAR_PATH}?t=${Date.now()}`;
  } catch (error) {
    console.warn('Failed to read user avatar', error);
    return null;
  }
};

export const saveUserAvatarFromSource = async sourcePath => {
  const src = String(sourcePath || '').replace('file://', '');
  await ensureUserAvatarDir();
  await RNFS.copyFile(src, USER_AVATAR_PATH);
};

export const removeUserAvatar = async () => {
  try {
    const exists = await RNFS.exists(USER_AVATAR_PATH);
    if (exists) {
      await RNFS.unlink(USER_AVATAR_PATH);
    }
  } catch (error) {
    console.warn('Failed to remove user avatar', error);
    throw error;
  }
};
