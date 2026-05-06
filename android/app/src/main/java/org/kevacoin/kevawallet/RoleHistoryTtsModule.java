package org.kevacoin.kevawallet;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;
import java.util.Locale;
import java.util.UUID;

public class RoleHistoryTtsModule extends ReactContextBaseJavaModule implements TextToSpeech.OnInitListener {
  private static final String EVENT_NAME = "roleHistoryTtsEvent";
  private TextToSpeech textToSpeech;
  private boolean ready = false;
  private String activeUtteranceId = null;

  public RoleHistoryTtsModule(ReactApplicationContext reactContext) {
    super(reactContext);
    createTts();
  }

  private void emitEvent(String type, String utteranceId, String error) {
    try {
      WritableMap map = Arguments.createMap();
      map.putString("type", type == null ? "" : type);
      map.putString("utteranceId", utteranceId == null ? "" : utteranceId);
      if (error != null) {
        map.putString("error", error);
      }
      getReactApplicationContext()
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
        .emit(EVENT_NAME, map);
    } catch (Exception ignored) {}
  }

  private void attachProgressListener() {
    if (textToSpeech == null) return;
    textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
      @Override
      public void onStart(String utteranceId) {
        emitEvent("start", utteranceId, null);
      }

      @Override
      public void onDone(String utteranceId) {
        if (utteranceId != null && utteranceId.equals(activeUtteranceId)) {
          activeUtteranceId = null;
        }
        emitEvent("done", utteranceId, null);
      }

      @Override
      public void onError(String utteranceId) {
        if (utteranceId != null && utteranceId.equals(activeUtteranceId)) {
          activeUtteranceId = null;
        }
        emitEvent("error", utteranceId, "tts_error");
      }

      @Override
      public void onError(String utteranceId, int errorCode) {
        if (utteranceId != null && utteranceId.equals(activeUtteranceId)) {
          activeUtteranceId = null;
        }
        emitEvent("error", utteranceId, String.valueOf(errorCode));
      }
    });
  }

  private void createTts() {
    ready = false;
    activeUtteranceId = null;
    if (textToSpeech != null) {
      try {
        textToSpeech.stop();
      } catch (Exception ignored) {}
      try {
        textToSpeech.shutdown();
      } catch (Exception ignored) {}
      textToSpeech = null;
    }
    textToSpeech = new TextToSpeech(getReactApplicationContext(), this);
  }

  @Override
  public String getName() {
    return "RoleHistoryTts";
  }

  @Override
  public void onInit(int status) {
    ready = status == TextToSpeech.SUCCESS;
    if (ready && textToSpeech != null) {
      textToSpeech.setLanguage(Locale.CHINA);
      textToSpeech.setSpeechRate(1.0f);
      attachProgressListener();
    }
  }

  @ReactMethod
  public void reinitialize(Promise promise) {
    try {
      createTts();
      promise.resolve(true);
    } catch (Exception e) {
      promise.reject("tts_reinit_failed", e);
    }
  }

  @ReactMethod
  public void speak(String text, Promise promise) {
    if (!ready || textToSpeech == null) {
      promise.reject("tts_not_ready", "TTS not ready");
      return;
    }
    String safeText = text == null ? "" : text.trim();
    if (safeText.isEmpty()) {
      promise.reject("tts_empty", "Nothing to speak");
      return;
    }
    if (activeUtteranceId != null) {
      try {
        textToSpeech.stop();
        emitEvent("stop", activeUtteranceId, null);
      } catch (Exception ignored) {}
      activeUtteranceId = null;
    }
    String utteranceId = "role-history-tts-" + UUID.randomUUID().toString();
    activeUtteranceId = utteranceId;
    Bundle params = new Bundle();
    params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
    int result = textToSpeech.speak(safeText, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
    if (result == TextToSpeech.ERROR) {
      activeUtteranceId = null;
      promise.reject("tts_error", "Failed to start TTS");
      return;
    }
    promise.resolve(utteranceId);
  }

  @ReactMethod
  public void stop(Promise promise) {
    if (textToSpeech != null) {
      textToSpeech.stop();
    }
    if (activeUtteranceId != null) {
      emitEvent("stop", activeUtteranceId, null);
      activeUtteranceId = null;
    }
    promise.resolve(true);
  }

  @Override
  public void invalidate() {
    if (textToSpeech != null) {
      textToSpeech.stop();
      textToSpeech.shutdown();
      textToSpeech = null;
    }
    activeUtteranceId = null;
    super.invalidate();
  }
}
