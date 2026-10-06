package ru.fdv.boulderingtimer.standalone;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Insets;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.widget.FrameLayout;

public final class MainActivity extends Activity {
  @SuppressLint("SetJavaScriptEnabled")
  @Override public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    WebView timer = new WebView(this);
    timer.getSettings().setJavaScriptEnabled(true);
    timer.getSettings().setDomStorageEnabled(true);
    timer.getSettings().setAllowFileAccess(true);
    // Honor the page's mobile viewport instead of falling back to a desktop
    // layout width, so phone-only timer controls remain visible.
    timer.getSettings().setUseWideViewPort(true);
    timer.getSettings().setLoadWithOverviewMode(false);
    timer.getSettings().setTextZoom(100);
    timer.setWebChromeClient(new WebChromeClient());
    timer.loadUrl("file:///android_asset/timer.html");
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
    // The timer intentionally stays a single local screen, never a browser
    // client for the network-synchronised competition server.
    super.onBackPressed();
  }
}
