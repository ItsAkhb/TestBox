package app.testbox.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "SaveFile")
public class SaveFilePlugin extends Plugin {

  private boolean saving = false;

  @PluginMethod
  public void save(PluginCall call) {
    String json = call.getString("json");
    String filename = call.getString("filename");

    if (json == null || filename == null || filename.isEmpty()) {
      call.reject("missing json or filename");
      return;
    }

    if (getActivity() == null) {
      call.reject("no foreground activity");
      return;
    }

    if (saving) {
      call.reject("save already in progress", "busy");
      return;
    }

    Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
    intent.addCategory(Intent.CATEGORY_OPENABLE);
    intent.setType("application/json");
    intent.putExtra(Intent.EXTRA_TITLE, filename);

    try {
      startActivityForResult(call, intent, "saveFinished");
      saving = true;
    } catch (Exception e) {
      call.reject("cannot open save dialog: " + e.getMessage(), "launch", e);
    }
  }

  @ActivityCallback
  private void saveFinished(PluginCall call, ActivityResult result) {
    saving = false;
    if (call == null) {
      return;
    }

    Uri uri = null;
    if (result != null
        && result.getResultCode() == Activity.RESULT_OK
        && result.getData() != null) {
      uri = result.getData().getData();
    }
    if (uri == null) {
      call.reject("cancelled", "cancelled");
      return;
    }

    String json = call.getString("json");
    if (json == null) {
      call.reject("write failed: payload missing", "write");
      return;
    }

    try {
      writeAll(uri, json);
      JSObject res = new JSObject();
      res.put("uri", uri.toString());
      call.resolve(res);
    } catch (IOException e) {
      call.reject("write failed: " + e.getMessage(), "write", e);
    }
  }

  private void writeAll(Uri uri, String json) throws IOException {
    OutputStream stream = openStream(uri);
    try (stream) {
      stream.write(json.getBytes(StandardCharsets.UTF_8));
      stream.flush();
    }
  }

  private OutputStream openStream(Uri uri) throws IOException {
    OutputStream stream = getContext().getContentResolver().openOutputStream(uri, "wt");
    if (stream == null) {
      stream = getContext().getContentResolver().openOutputStream(uri);
    }
    if (stream == null) {
      throw new IOException("cannot open output stream");
    }
    return stream;
  }
}
