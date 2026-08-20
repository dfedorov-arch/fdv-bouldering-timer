package ru.fdv.boulderingtimer.standalone;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

public final class MainActivity extends Activity {
  @SuppressLint("SetJavaScriptEnabled")
  @Override public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    WebView timer = new WebView(this);
    timer.getSettings().setJavaScriptEnabled(true);
    timer.getSettings().setDomStorageEnabled(true);
    timer.getSettings().setAllowFileAccess(true);
    timer.setWebChromeClient(new WebChromeClient());
    timer.loadUrl("file:///android_asset/timer.html");
    setContentView(timer);
  }

  @Override public void onBackPressed() {
    // The timer intentionally stays a single local screen, never a browser
    // client for the network-synchronised competition server.
    super.onBackPressed();
  }
}
