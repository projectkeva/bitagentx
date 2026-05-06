package org.kevacoin.kevawallet;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import java.io.File;

public class RoleExportOpenModule extends ReactContextBaseJavaModule {
  public RoleExportOpenModule(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return "RoleExportOpen";
  }

  private Uri getFileUri(File file) {
    return FileProvider.getUriForFile(
      getReactApplicationContext(),
      getReactApplicationContext().getPackageName() + ".provider",
      file
    );
  }

  @ReactMethod
  public void openFile(String path, Promise promise) {
    try {
      String safePath = path == null ? "" : path.trim();
      if (safePath.isEmpty()) {
        promise.reject("open_file_empty", "path is empty");
        return;
      }
      File file = new File(safePath);
      if (!file.exists() || !file.isFile()) {
        promise.reject("open_file_missing", "file does not exist");
        return;
      }
      Uri uri = getFileUri(file);
      Intent intent = new Intent(Intent.ACTION_VIEW);
      intent.setDataAndType(uri, "text/plain");
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
      Intent chooser = Intent.createChooser(intent, "打开记录");
      chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getReactApplicationContext().startActivity(chooser);
      promise.resolve(true);
    } catch (ActivityNotFoundException e) {
      promise.reject("open_file_no_handler", e);
    } catch (Exception e) {
      promise.reject("open_file_failed", e);
    }
  }

  @ReactMethod
  public void openDir(String path, Promise promise) {
    try {
      String safePath = path == null ? "" : path.trim();
      if (safePath.isEmpty()) {
        promise.reject("open_dir_empty", "path is empty");
        return;
      }
      File dir = new File(safePath);
      if (!dir.exists() || !dir.isDirectory()) {
        promise.reject("open_dir_missing", "directory does not exist");
        return;
      }
      Uri uri = getFileUri(dir);
      Intent intent = new Intent(Intent.ACTION_VIEW);
      intent.setDataAndType(uri, "resource/folder");
      intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
      Intent chooser = Intent.createChooser(intent, "打开目录");
      chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
      getReactApplicationContext().startActivity(chooser);
      promise.resolve(true);
    } catch (ActivityNotFoundException e) {
      promise.reject("open_dir_no_handler", e);
    } catch (Exception e) {
      promise.reject("open_dir_failed", e);
    }
  }
}
