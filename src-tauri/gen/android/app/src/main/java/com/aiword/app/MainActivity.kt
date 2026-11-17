package com.aiword.app

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.util.Base64
import android.provider.OpenableColumns
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

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

  // A document opened from another app (Files, Gmail: "Open with Inkspire") before the page was ready to take it.
  private var pendingOpen: String? = null

  override fun onWebViewCreate(webView: WebView) {
    this.webView = webView
    webView.addJavascriptInterface(AndroidFiles(this), "InkspireFiles")
    takeOpened(intent)
    // Pinching zooms the document (the page handles two fingers), never the whole interface.
    webView.settings.setSupportZoom(false)
    webView.settings.builtInZoomControls = false
    webView.settings.displayZoomControls = false
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    takeOpened(intent)
    deliverOpened()
  }

  /** Remembers the document another app asked Inkspire to open, keeping access to it where the app allows. */
  private fun takeOpened(intent: Intent?) {
    if (intent?.action != Intent.ACTION_VIEW && intent?.action != Intent.ACTION_EDIT) {
      return
    }
    val uri = intent.data ?: return
    try {
      contentResolver.takePersistableUriPermission(
        uri,
        intent.flags and (Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION),
      )
    } catch (error: Exception) {
      // A one-time grant (an e-mail attachment): it opens for this session only.
    }
    pendingOpen = uri.toString()
    // Handled once: a restart of the activity does not open it again.
    intent.action = Intent.ACTION_MAIN
  }

  /** Hands the waiting document to the page once it listens (`__inkspireOpen`, src/document/android-open.ts). */
  fun deliverOpened() {
    val uri = pendingOpen ?: return
    webView?.post {
      webView?.evaluateJavascript(
        "window.__inkspireOpen ? (window.__inkspireOpen(${JSONObject.quote(uri)}), true) : false",
      ) { taken -> if (taken == "true") pendingOpen = null }
    }
  }

  /** The page's print pages through Android's print service, which also saves as PDF. */
  fun printPage(jobName: String) {
    runOnUiThread {
      val view = webView ?: return@runOnUiThread
      val manager = getSystemService(PRINT_SERVICE) as PrintManager
      val adapter = view.createPrintDocumentAdapter(jobName)
      // Tells the page when the print dialog is done with it, so it can put the editor back.
      val watched =
        object : PrintDocumentAdapter() {
          override fun onStart() = adapter.onStart()

          override fun onLayout(
            old: PrintAttributes?,
            new: PrintAttributes,
            cancel: CancellationSignal?,
            callback: LayoutResultCallback,
            extras: Bundle?,
          ) = adapter.onLayout(old, new, cancel, callback, extras)

          override fun onWrite(
            pages: Array<out PageRange>,
            destination: ParcelFileDescriptor,
            cancel: CancellationSignal?,
            callback: WriteResultCallback,
          ) = adapter.onWrite(pages, destination, cancel, callback)

          override fun onFinish() {
            adapter.onFinish()
            view.post { view.evaluateJavascript("window.__inkspirePrinted && window.__inkspirePrinted()", null) }
          }
        }
      manager.print(jobName, watched, PrintAttributes.Builder().build())
    }
  }

  /** Android's share sheet with a copy of the document, written to the app's cache and lent through its provider. */
  fun shareBytes(name: String, mimeType: String, bytes: ByteArray) {
    val folder = File(cacheDir, "share").apply { mkdirs() }
    folder.listFiles()?.forEach { it.delete() }
    val file = File(folder, name.replace(Regex("[\\\\/:*?\"<>|]"), "_"))
    file.writeBytes(bytes)
    val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
    val send =
      Intent(Intent.ACTION_SEND).apply {
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_SUBJECT, file.nameWithoutExtension)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
    runOnUiThread { startActivity(Intent.createChooser(send, null)) }
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

  /** Prints the page (Inkspire has laid out its print pages first); `__inkspirePrinted` is called when done. */
  @JavascriptInterface
  fun print(jobName: String) = activity.printPage(jobName)

  /** Shares a copy of the document (base64 bytes) through Android's share sheet. */
  @JavascriptInterface
  fun share(name: String, mimeType: String, base64: String) =
    activity.shareBytes(name, mimeType, Base64.decode(base64, Base64.DEFAULT))

  /** The page is ready to open a document another app sent; one waiting since the start comes now. */
  @JavascriptInterface
  fun ready() = activity.deliverOpened()
}
