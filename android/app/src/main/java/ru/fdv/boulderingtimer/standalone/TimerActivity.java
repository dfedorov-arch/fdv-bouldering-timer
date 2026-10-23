package ru.fdv.boulderingtimer.standalone;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Insets;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.view.WindowManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

public final class TimerActivity extends Activity {
  private WebView timer;
  private boolean serverMode;
  private boolean errorShown;

  @SuppressLint("SetJavaScriptEnabled")
  @Override public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Native window policy works with HTTP as well as HTTPS. It applies only
    // while this Activity is visible; this is deliberately not a background service.
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
      getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
          android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::onBackPressed);
    }
    String server = getIntent().getStringExtra("serverAddress");
    serverMode = server != null;
    String target;
    try {
      target = serverMode ? ServerAddress.normalize(server) : "file:///android_asset/timer.html";
    } catch (IllegalArgumentException error) {
      finish();
      return;
    }
    timer = new WebView(this);
    timer.getSettings().setJavaScriptEnabled(true);
    timer.getSettings().setDomStorageEnabled(true);
    // Bundled android_asset files remain readable with file access disabled.
    // Network pages get neither local-file access nor a JavaScript/native bridge.
    timer.getSettings().setAllowFileAccess(false);
    timer.getSettings().setAllowContentAccess(false);
    // Honor the page's mobile viewport instead of falling back to a desktop
    // layout width, so phone-only timer controls remain visible.
    timer.getSettings().setUseWideViewPort(true);
    timer.getSettings().setLoadWithOverviewMode(false);
    timer.getSettings().setTextZoom(100);
    timer.setWebChromeClient(new WebChromeClient());
    timer.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        String url = request.getUrl().toString();
        return !(serverMode && ServerAddress.isWebUrl(url));
      }

      @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
        errorShown = false;
      }

      @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
        if (request.isForMainFrame()) showConnectionError(false);
      }

      @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
        if (request.isForMainFrame()) showConnectionError(false);
      }

      @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
        handler.cancel(); // Never bypass certificate validation, even on a LAN.
        showConnectionError(true);
      }
    });
    timer.loadUrl(target);
    FrameLayout content = new FrameLayout(this);
    content.setBackgroundColor(0xff0e1116);
    content.addView(timer, new FrameLayout.LayoutParams(
        FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
    // Android 15+ enforces edge-to-edge for target SDK 35. Older versions
    // already fit the window to system bars; padding them again would double
    // the reserved space. Keep the WebView inside the actual safe rectangle.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
      content.setOnApplyWindowInsetsListener((view, windowInsets) -> {
        Insets bars = windowInsets.getInsets(
            WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
        if (view.getPaddingLeft() != bars.left || view.getPaddingTop() != bars.top
            || view.getPaddingRight() != bars.right || view.getPaddingBottom() != bars.bottom) {
          view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
        }
        // Descendants must not reserve the same bars twice, but retain other
        // insets (e.g. the remaining keyboard area) instead of consuming all.
        return windowInsets.inset(bars.left, bars.top, bars.right, bars.bottom);
      });
    }
    setContentView(content);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
      content.requestApplyInsets();
    }
  }

  @Override public void onBackPressed() {
    new AlertDialog.Builder(this)
        .setTitle(R.string.change_mode)
        .setMessage(R.string.leave_timer_warning)
        .setPositiveButton(R.string.change_mode, (dialog, which) -> finish())
        .setNegativeButton(R.string.stay, null)
        .show();
  }

  private void showConnectionError(boolean certificate) {
    if (!serverMode || errorShown || isFinishing() || isDestroyed()) return;
    errorShown = true;
    new AlertDialog.Builder(this)
        .setTitle(R.string.connection_failed)
        .setMessage(certificate ? R.string.certificate_error : R.string.connection_error)
        .setPositiveButton(R.string.retry, (dialog, which) -> timer.reload())
        .setNeutralButton(R.string.change_mode, (dialog, which) -> finish())
        .setNegativeButton(R.string.stay, null)
        .show();
  }

  @Override protected void onResume() {
    super.onResume();
    if (timer != null) timer.onResume();
  }

  @Override protected void onPause() {
    if (timer != null) timer.onPause();
    super.onPause();
  }

  @Override protected void onDestroy() {
    if (timer != null) {
      timer.stopLoading();
      timer.destroy();
    }
    super.onDestroy();
  }
}
