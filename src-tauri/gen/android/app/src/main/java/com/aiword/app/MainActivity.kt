package com.aiword.app

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.provider.OpenableColumns
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONArray
import org.json.JSONObject

class MainActivity : TauriActivity() {
  private var webView: WebView? = null

  // Open goes through the system's document picker with read and write access, kept across restarts, so a
  // document can be saved back to where it came from and reopened from Recent later. (The dialog plugin's picker
  // grants a read-only copy.)
  private val openDocument =
    registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri: Uri? ->
      if (uri != null) {
        try {
          contentResolver.takePersistableUriPermission(
            uri,
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION,
          )
        } catch (error: SecurityException) {
          // A provider that offers no lasting access: the document still opens for this session.
        }
      }
      val picked = if (uri == null) "null" else JSONObject.quote(uri.toString())
      webView?.post { webView?.evaluateJavascript("window.__inkspirePicked && window.__inkspirePicked($picked)", null) }
    }

  override fun onCreate(savedInstanceState: Bundle?) {
    // Light status and navigation icons, over the blue strip below.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
    )
    super.onCreate(savedInstanceState)
    // Android 15 draws apps under the status and navigation bars. Keep the editor clear of them, and of the
    // on-screen keyboard, so the line being typed stays visible above it. The strip behind the status bar takes the
    // title bar's blue.
    val content = findViewById<View>(android.R.id.content)
    content.setBackgroundColor(Color.parseColor("#2B579A"))
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime())
      view.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, keyboard.bottom))
      WindowInsetsCompat.CONSUMED
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(AndroidFiles(this), "InkspireFiles")
    // Pinching zooms the document (the page handles two fingers), never the whole interface.
    webView.settings.setSupportZoom(false)
    webView.settings.builtInZoomControls = false
    webView.settings.displayZoomControls = false
  }

  fun pickDocument(mimeTypes: Array<String>) {
    runOnUiThread { openDocument.launch(mimeTypes) }
  }
}

/** What the page asks of Android's files: `window.InkspireFiles` (src/lib/paths.ts and src/lib/file-io.ts). */
class AndroidFiles(private val activity: MainActivity) {
  /**
   * The name a picked document shows in the file manager. A content link's last part is often only an id (a
   * Downloads file is "msf:1000000018"); the content resolver knows the real name.
   */
  @JavascriptInterface
  fun displayName(uri: String): String? =
    try {
      activity.contentResolver
        .query(Uri.parse(uri), arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)
        ?.use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }
    } catch (error: Exception) {
      null
    }

  /** Shows the document picker for these MIME types (a JSON array); the choice comes back to `__inkspirePicked`. */
  @JavascriptInterface
  fun openDocument(mimeTypesJson: String) {
    val list = JSONArray(mimeTypesJson)
    val types = Array(list.length()) { list.getString(it) }
    activity.pickDocument(if (types.isEmpty()) arrayOf("*/*") else types)
  }
}
