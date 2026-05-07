import { PermissionsAndroid, Platform } from 'react-native';
import Voice from '@react-native-voice/voice';

export const ROLE_TALK_STATES = {
  OFF: 'off',
  IDLE: 'idle',
  REQUESTING_PERMISSION: 'requesting_permission',
  STARTING: 'starting',
  LISTENING: 'listening',
  RECOGNIZING: 'recognizing',
  SUBMITTING: 'submitting',
  ERROR: 'error',
};

const normalizeSpeechError = error => {
  const raw = error?.error || error?.message || error?.code || error || 'unknown_error';
  if (typeof raw === 'string') return raw;
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
};

export const ensureRoleTalkPermission = async () => {
  if (Platform.OS !== 'android') {
    return true;
  }
  const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Microphone permission',
    message: 'Role talk needs microphone access to turn your voice into text.',
    buttonPositive: 'Allow',
    buttonNegative: 'Deny',
  });
  return granted === PermissionsAndroid.RESULTS.GRANTED;
};

export const isRoleTalkAvailable = async () => {
  try {
    return !!(await Voice.isAvailable());
  } catch {
    return false;
  }
};

export const bindRoleTalkEvents = handlers => {
  const safe = handlers || {};
  Voice.onSpeechStart = event => safe.onStart?.(event);
  Voice.onSpeechRecognized = event => safe.onRecognized?.(event);
  Voice.onSpeechEnd = event => safe.onEnd?.(event);
  Voice.onSpeechError = event => safe.onError?.(normalizeSpeechError(event));
  Voice.onSpeechPartialResults = event => {
    const value = Array.isArray(event?.value) ? String(event.value[0] || '').trim() : '';
    if (value) safe.onPartial?.(value, event);
  };
  Voice.onSpeechResults = event => {
    const value = Array.isArray(event?.value) ? String(event.value[0] || '').trim() : '';
    if (value) safe.onFinal?.(value, event);
  };
};

export const unbindRoleTalkEvents = () => {
  Voice.onSpeechStart = null;
  Voice.onSpeechRecognized = null;
  Voice.onSpeechEnd = null;
  Voice.onSpeechError = null;
  Voice.onSpeechPartialResults = null;
  Voice.onSpeechResults = null;
};

export const startRoleTalkRecognition = async locale => {
  try {
    await Voice.cancel();
  } catch {}
  await Voice.start(locale || 'zh-CN', {
    EXTRA_LANGUAGE_MODEL: 'LANGUAGE_MODEL_FREE_FORM',
    EXTRA_MAX_RESULTS: 5,
    EXTRA_PARTIAL_RESULTS: true,
    REQUEST_PERMISSIONS_AUTO: false,
  });
};

export const stopRoleTalkRecognition = async () => {
  try {
    await Voice.stop();
  } catch {}
};

export const cancelRoleTalkRecognition = async () => {
  try {
    await Voice.cancel();
  } catch {}
};

export const destroyRoleTalkRecognition = async () => {
  try {
    await Voice.destroy();
  } catch {}
  try {
    await Voice.removeAllListeners();
  } catch {}
  unbindRoleTalkEvents();
};
