"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const activityPath = path.join(root, "android/app/src/main/java/ru/fdv/boulderingtimer/standalone/TimerActivity.java");
const javaDirectory = path.dirname(activityPath);

test("Android safe-area handling is native, version-gated and event-driven", () => {
  const activity = fs.readFileSync(activityPath, "utf8");
  assert.match(activity, /Build\.VERSION\.SDK_INT >= Build\.VERSION_CODES\.VANILLA_ICE_CREAM/);
  assert.match(activity, /content\.setOnApplyWindowInsetsListener/);
  assert.match(activity, /WindowInsets\.Type\.systemBars\(\) \| WindowInsets\.Type\.displayCutout\(\)/);
  assert.match(activity, /view\.setPadding\(bars\.left, bars\.top, bars\.right, bars\.bottom\)/);
  assert.match(activity, /return windowInsets\.inset\(bars\.left, bars\.top, bars\.right, bars\.bottom\)/);
  assert.match(activity, /setContentView\(content\);[\s\S]*?content\.requestApplyInsets\(\)/);
  assert.doesNotMatch(activity, /getInsetsIgnoringVisibility|WindowInsets\.CONSUMED|evaluateJavascript|postDelayed|TimerTask/);
});

// Exercise the actual Activity on a JVM with small Android API doubles. This
// verifies our callback and version guards, not an Android layout engine or APK.
const apiDoubles = {
  "android/annotation/SuppressLint.java": `package android.annotation;
    public @interface SuppressLint { String[] value(); }`,
  "android/os/Bundle.java": "package android.os; public class Bundle {}",
  "android/os/Build.java": `package android.os; public class Build {
    public static class VERSION { public static int SDK_INT; }
    public static class VERSION_CODES { public static final int TIRAMISU=33,VANILLA_ICE_CREAM=35; }
  }`,
  "android/graphics/Insets.java": `package android.graphics; public class Insets {
    public final int left, top, right, bottom;
    public Insets(int l, int t, int r, int b) { left=l; top=t; right=r; bottom=b; }
  }`,
  "android/view/WindowInsets.java": `package android.view;
    import android.graphics.Insets;
    public class WindowInsets {
      private final Insets bars, cutout, keyboard;
      public WindowInsets(Insets b, Insets c, Insets k) { bars=b; cutout=c; keyboard=k; }
      public static class Type {
        public static int systemBars() { return 1; }
        public static int displayCutout() { return 2; }
        public static int ime() { return 4; }
      }
      public Insets getInsets(int mask) {
        int l=0,t=0,r=0,b=0;
        for (int type : new int[]{1,2,4}) if ((mask & type) != 0) {
          Insets i = type == 1 ? bars : type == 2 ? cutout : keyboard;
          l=Math.max(l,i.left); t=Math.max(t,i.top); r=Math.max(r,i.right); b=Math.max(b,i.bottom);
        }
        return new Insets(l,t,r,b);
      }
      private Insets subtract(Insets i, int l, int t, int r, int b) {
        return new Insets(Math.max(0,i.left-l),Math.max(0,i.top-t),Math.max(0,i.right-r),Math.max(0,i.bottom-b));
      }
      public WindowInsets inset(int l,int t,int r,int b) {
        return new WindowInsets(subtract(bars,l,t,r,b),subtract(cutout,l,t,r,b),subtract(keyboard,l,t,r,b));
      }
    }`,
  "android/view/View.java": `package android.view; public class View {
    public int left, top, right, bottom, paddingWrites, insetRequests;
    public OnApplyWindowInsetsListener listener;
    public interface OnApplyWindowInsetsListener { WindowInsets onApplyWindowInsets(View v, WindowInsets i); }
    public void setOnApplyWindowInsetsListener(OnApplyWindowInsetsListener l) { listener=l; }
    public void requestApplyInsets() { insetRequests++; }
    public int getPaddingLeft() { return left; }
    public int getPaddingTop() { return top; }
    public int getPaddingRight() { return right; }
    public int getPaddingBottom() { return bottom; }
    public void setPadding(int l,int t,int r,int b) { left=l; top=t; right=r; bottom=b; paddingWrites++; }
    public interface OnClickListener { void onClick(View v); }
    public OnClickListener click; public void setOnClickListener(OnClickListener l) { click=l; }
  }`,
  "android/view/WindowManager.java": `package android.view; public class WindowManager {
    public static class LayoutParams { public static final int FLAG_KEEP_SCREEN_ON=128; }
  }`,
  "android/view/Window.java": `package android.view; public class Window {
    public int flags; public void addFlags(int f) { flags|=f; }
  }`,
  "android/window/OnBackInvokedCallback.java": `package android.window;
    public interface OnBackInvokedCallback { void onBackInvoked(); }`,
  "android/window/OnBackInvokedDispatcher.java": `package android.window; public class OnBackInvokedDispatcher {
    public static final int PRIORITY_DEFAULT=0; public OnBackInvokedCallback callback;
    public void registerOnBackInvokedCallback(int p,OnBackInvokedCallback c) { callback=c; }
  }`,
  "android/content/Intent.java": `package android.content; import java.util.HashMap;
    public class Intent {
      public final HashMap<String,String> extras=new HashMap<>();
      public Intent() {} public Intent(Object context, Class<?> cls) {}
      public Intent putExtra(String k,String v) { extras.put(k,v); return this; }
      public String getStringExtra(String k) { return extras.get(k); }
    }`,
  "android/content/DialogInterface.java": `package android.content; public interface DialogInterface {
    interface OnClickListener { void onClick(DialogInterface dialog,int which); }
  }`,
  "android/content/SharedPreferences.java": `package android.content; import java.util.HashMap;
    public class SharedPreferences {
      private final HashMap<String,String> values=new HashMap<>();
      public String getString(String k,String fallback) { return values.getOrDefault(k,fallback); }
      public Editor edit() { return new Editor(); }
      public class Editor { public Editor putString(String k,String v) { values.put(k,v); return this; } public void apply() {} }
    }`,
  "android/content/res/Resources.java": `package android.content.res; public class Resources {
    public Metrics getDisplayMetrics() { return new Metrics(); }
    public static class Metrics { public float density=1; }
  }`,
  "android/app/Activity.java": `package android.app;
    import android.view.View; import android.view.Window; import android.os.Bundle; import android.content.*;
    public class Activity {
      public static final int MODE_PRIVATE=0;
      public View contentView; public boolean finished; public Intent intent=new Intent(), started;
      public final Window window=new Window(); public static SharedPreferences preferences=new SharedPreferences();
      public final android.window.OnBackInvokedDispatcher back=new android.window.OnBackInvokedDispatcher();
      public void onCreate(Bundle b) {}
      public void setContentView(View v) { contentView=v; }
      public void onBackPressed() {}
      public Window getWindow() { return window; } public Intent getIntent() { return intent; }
      public android.window.OnBackInvokedDispatcher getOnBackInvokedDispatcher() { return back; }
      public void startActivity(Intent i) { started=i; }
      public SharedPreferences getPreferences(int mode) { return preferences; }
      public android.content.res.Resources getResources() { return new android.content.res.Resources(); }
      public String getString(int id) { return "resource:"+id; }
      public void finish() { finished=true; } public boolean isFinishing() { return finished; }
      public boolean isDestroyed() { return false; }
      protected void onResume() {} protected void onPause() {} protected void onDestroy() {}
    }`,
  "android/app/AlertDialog.java": `package android.app; import android.content.DialogInterface;
    public class AlertDialog {
      public static Builder last;
      public static class Builder {
        public int title,message;
        public DialogInterface.OnClickListener positive,negative,neutral;
        public Builder(Activity a) { last=this; }
        public Builder setTitle(int i) { title=i; return this; }
        public Builder setMessage(int i) { message=i; return this; }
        public Builder setPositiveButton(int i,DialogInterface.OnClickListener l) { positive=l; return this; }
        public Builder setNegativeButton(int i,DialogInterface.OnClickListener l) { negative=l; return this; }
        public Builder setNeutralButton(int i,DialogInterface.OnClickListener l) { neutral=l; return this; }
        public AlertDialog show() { return new AlertDialog(); }
      }
    }`,
  "android/widget/FrameLayout.java": `package android.widget;
    import android.app.Activity; import android.view.View;
    public class FrameLayout extends View {
      public View child; public LayoutParams params;
      public FrameLayout(Activity a) {}
      public void setBackgroundColor(int c) {}
      public void addView(View v, LayoutParams p) { child=v; params=p; }
      public static class LayoutParams {
        public static final int MATCH_PARENT=-1;
        public final int width, height;
        public LayoutParams(int w,int h) { width=w; height=h; }
      }
    }`,
  "android/webkit/WebChromeClient.java": "package android.webkit; public class WebChromeClient {}",
  "android/graphics/Bitmap.java": "package android.graphics; public class Bitmap {}",
  "android/net/Uri.java": `package android.net; public class Uri {
    final String url; public Uri(String value) { url=value; } public String toString() { return url; }
  }`,
  "android/net/http/SslError.java": "package android.net.http; public class SslError {}",
  "android/webkit/SslErrorHandler.java": `package android.webkit; public class SslErrorHandler {
    public boolean cancelled; public void cancel() { cancelled=true; }
  }`,
  "android/webkit/WebResourceRequest.java": `package android.webkit; import android.net.Uri;
    public class WebResourceRequest {
      final boolean main; final String url;
      public WebResourceRequest(boolean m,String u) { main=m; url=u; }
      public boolean isForMainFrame() { return main; } public Uri getUrl() { return new Uri(url); }
    }`,
  "android/webkit/WebResourceError.java": "package android.webkit; public class WebResourceError {}",
  "android/webkit/WebResourceResponse.java": "package android.webkit; public class WebResourceResponse {}",
  "android/webkit/WebViewClient.java": `package android.webkit; public class WebViewClient {
    public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r) { return false; }
    public void onPageStarted(WebView v,String u,android.graphics.Bitmap b) {}
    public void onReceivedError(WebView v,WebResourceRequest r,WebResourceError e) {}
    public void onReceivedHttpError(WebView v,WebResourceRequest r,WebResourceResponse e) {}
    public void onReceivedSslError(WebView v,SslErrorHandler h,android.net.http.SslError e) {}
  }`,
  "android/webkit/WebView.java": `package android.webkit;
    import android.app.Activity; import android.view.View;
    public class WebView extends View {
      public String url; public int loads,reloads; public WebViewClient client;
      public boolean resumed,paused,destroyed; public final Settings settings=new Settings();
      public WebView(Activity a) {}
      public Settings getSettings() { return settings; }
      public void setWebChromeClient(WebChromeClient c) {}
      public void setWebViewClient(WebViewClient c) { client=c; }
      public void loadUrl(String u) { url=u; loads++; }
      public void reload() { reloads++; } public void onResume() { resumed=true; }
      public void onPause() { paused=true; } public void stopLoading() {} public void destroy() { destroyed=true; }
      public static class Settings {
        public boolean files,content;
        public void setJavaScriptEnabled(boolean b) {} public void setDomStorageEnabled(boolean b) {}
        public void setAllowFileAccess(boolean b) { files=b; } public void setAllowContentAccess(boolean b) { content=b; }
        public void setUseWideViewPort(boolean b) {}
        public void setLoadWithOverviewMode(boolean b) {} public void setTextZoom(int z) {}
      }
    }`,
  "android/text/InputType.java": `package android.text; public class InputType {
    public static final int TYPE_CLASS_TEXT=1,TYPE_TEXT_VARIATION_URI=16;
  }`,
  "android/widget/TextView.java": `package android.widget; import android.view.View; import android.app.Activity;
    public class TextView extends View {
      public int textResource; public String value=""; public TextView(Activity a) {}
      public void setText(int id) { textResource=id; } public void setText(String s) { value=s; }
      public CharSequence getText() { return value; } public void setTextSize(int s) {}
    }`,
  "android/widget/EditText.java": `package android.widget; import android.app.Activity;
    public class EditText extends TextView {
      public String error; public EditText(Activity a) { super(a); } public void setHint(int id) {}
      public void setContentDescription(String s) {} public void setInputType(int i) {}
      public void setSingleLine(boolean b) {} public void setError(String s) { error=s; }
    }`,
  "android/widget/Button.java": `package android.widget; import android.app.Activity;
    public class Button extends TextView { public Button(Activity a) { super(a); } }`,
  "android/widget/LinearLayout.java": `package android.widget; import android.app.Activity; import android.view.View;
    public class LinearLayout extends View {
      public static final int VERTICAL=1; public final java.util.ArrayList<View> children=new java.util.ArrayList<>();
      public LinearLayout(Activity a) {} public void setOrientation(int o) {} public void addView(View v) { children.add(v); }
    }`,
  "android/widget/ScrollView.java": `package android.widget; import android.app.Activity; import android.view.View;
    public class ScrollView extends View { public View child; public ScrollView(Activity a) {} public void addView(View v) { child=v; } }`,
  "ru/fdv/boulderingtimer/standalone/R.java": `package ru.fdv.boulderingtimer.standalone;
    public class R { public static class string {
      public static final int app_name=1,connection_instructions=2,server_address=3,connect_server=4,
        standalone=5,invalid_server_address=6,foreground_warning=7,change_mode=8,leave_timer_warning=9,
        stay=10,connection_failed=11,certificate_error=12,connection_error=13,retry=14;
    } }`,
  "ConnectionHarness.java": `import ru.fdv.boulderingtimer.standalone.*;
    import android.app.*; import android.content.Intent; import android.os.Build;
    import android.webkit.*; import android.widget.*; import java.lang.reflect.Method;
    public class ConnectionHarness {
      static void check(boolean condition,String message) { if (!condition) throw new AssertionError(message); }
      static TimerActivity open(String server) {
        TimerActivity activity=new TimerActivity();
        if (server!=null) activity.intent.putExtra("serverAddress",server);
        activity.onCreate(null); return activity;
      }
      static void lifecycle(TimerActivity a,String event) throws Exception {
        Method method=TimerActivity.class.getDeclaredMethod(event); method.setAccessible(true); method.invoke(a);
      }
      public static void main(String[] args) throws Exception {
        String[][] valid={{"192.168.1.10:8008","http://192.168.1.10:8008/"},
          {" https://timer.example/index.html ","https://timer.example/"},
          {"http://[::1]:8008/","http://[::1]:8008/"}, {"timer.local","http://timer.local/"}};
        for (String[] pair:valid) check(ServerAddress.normalize(pair[0]).equals(pair[1]),"Normalize "+pair[0]);
        for (String value:new String[]{"","file:///etc/passwd","javascript:alert(1)","content://timer",
            "ftp://timer","https://user:pass@timer/","http://timer:0","http://timer:65536",
            "http://timer:abc","http://timer/path","foo/bar://host","http://timer/?key=secret","http://timer/#x","http://"}) {
          try { ServerAddress.normalize(value); throw new AssertionError("Accepted invalid address: "+value); }
          catch (IllegalArgumentException expected) {}
        }
        Build.VERSION.SDK_INT=35;
        MainActivity launcher=new MainActivity(); launcher.onCreate(null);
        ScrollView scroll=(ScrollView)launcher.contentView;
        check(scroll.listener!=null && scroll.insetRequests==1,"Launcher has native safe area");
        LinearLayout choices=(LinearLayout)scroll.child;
        EditText address=(EditText)choices.children.get(2);
        Button connect=(Button)choices.children.get(3), offline=(Button)choices.children.get(4);
        connect.click.onClick(connect);
        check(address.error!=null && launcher.started==null,"Invalid input stays on launcher");
        address.setText("192.168.1.10:8008"); connect.click.onClick(connect);
        check(launcher.started.getStringExtra("serverAddress").equals(valid[0][1]),"Connect passes origin");
        MainActivity next=new MainActivity(); next.onCreate(null);
        EditText restored=(EditText)((LinearLayout)((ScrollView)next.contentView).child).children.get(2);
        check(restored.getText().toString().equals(valid[0][1]),"Address persists across launches");
        offline.click.onClick(offline);
        check(launcher.started.getStringExtra("serverAddress")==null,"Standalone has no server extras");
        for (String server:new String[]{null,valid[0][0],"https://timer.example/"}) {
          TimerActivity a=open(server); WebView timer=(WebView)((FrameLayout)a.contentView).child;
          check((a.window.flags & 128)!=0,"Native screen-on in both modes");
          check(timer.url.equals(server==null ? "file:///android_asset/timer.html" : ServerAddress.normalize(server)),"Mode loads correct document");
          check(!timer.settings.files && !timer.settings.content,"No network access to local files/content");
          check(timer.client.shouldOverrideUrlLoading(timer,new WebResourceRequest(true,"file:///sdcard/private")),"Block file navigation");
          check(timer.client.shouldOverrideUrlLoading(timer,new WebResourceRequest(true,"javascript:alert(1)")),"Block script navigation");
          check(timer.client.shouldOverrideUrlLoading(timer,new WebResourceRequest(true,"https://timer.example/")) == (server==null),"Network links remain in network WebView only");
          lifecycle(a,"onPause"); check(timer.paused,"Explicit foreground-only lifecycle");
          lifecycle(a,"onResume"); check(timer.resumed,"Resume existing WebView, no reload");
          check(timer.loads==1,"Resume does not reload or replace audio page");
          check(a.back.callback!=null,"Modern Back callback is registered");
          a.back.callback.onBackInvoked(); check(!a.finished,"Back needs confirmation");
          AlertDialog.last.positive.onClick(null,0); check(a.finished,"Confirmed mode change closes only client");
          lifecycle(a,"onDestroy"); check(timer.destroyed,"Release WebView on explicit exit");
        }
        TimerActivity network=open(valid[0][0]); WebView web=(WebView)((FrameLayout)network.contentView).child;
        AlertDialog.last=null;
        web.client.onReceivedError(web,new WebResourceRequest(false,"http://timer/font"),new WebResourceError());
        check(AlertDialog.last==null,"Subresource failure does not interrupt timer");
        web.client.onReceivedError(web,new WebResourceRequest(true,web.url),new WebResourceError());
        check(AlertDialog.last.message==R.string.connection_error,"Main navigation error offers retry");
        check(web.loads==1 && web.url.startsWith("http:"),"No automatic standalone fallback");
        AlertDialog.last.positive.onClick(null,0); check(web.reloads==1,"Retry uses existing server page");
        web.client.onPageStarted(web,web.url,null);
        SslErrorHandler ssl=new SslErrorHandler(); web.client.onReceivedSslError(web,ssl,new android.net.http.SslError());
        check(ssl.cancelled && AlertDialog.last.message==R.string.certificate_error,"TLS denied, never bypassed");
        TimerActivity invalid=open("file:///sdcard/other"); check(invalid.finished && invalid.contentView==null,"Reject invalid internal launch");
        System.out.println("launcher, addresses, saved origin, both modes, screen-on, lifecycle, navigation, TLS and no fallback: OK");
      }
    }`,
  "InsetsHarness.java": `import android.os.Build;
    import android.graphics.Insets; import android.view.WindowInsets; import android.widget.FrameLayout;
    import ru.fdv.boulderingtimer.standalone.TimerActivity;
    public class InsetsHarness {
      static final Insets ZERO = new Insets(0,0,0,0);
      static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
      static FrameLayout open(int sdk) {
        Build.VERSION.SDK_INT=sdk;
        TimerActivity a=new TimerActivity(); a.onCreate(null);
        FrameLayout root=(FrameLayout)a.contentView;
        check(root.params.width == -1 && root.params.height == -1, "WebView fills safe container");
        return root;
      }
      static void padding(FrameLayout root,int l,int t,int r,int b) {
        check(root.left==l && root.top==t && root.right==r && root.bottom==b, "Incorrect safe padding");
      }
      static WindowInsets apply(FrameLayout root, Insets bars, Insets cutout, Insets keyboard) {
        WindowInsets remaining=root.listener.onApplyWindowInsets(root,new WindowInsets(bars,cutout,keyboard));
        Insets safe=remaining.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
        check(safe.left==0 && safe.top==0 && safe.right==0 && safe.bottom==0, "No duplicated bars in WebView");
        return remaining;
      }
      public static void main(String[] args) {
        for (int sdk : new int[]{26,29,34}) {
          FrameLayout old=open(sdk); padding(old,0,0,0,0);
          check(old.listener==null && old.insetRequests==0, "Older Android must keep decor fitting");
        }
        for (int sdk : new int[]{35,36}) {
          FrameLayout root=open(sdk);
          check(root.listener!=null && root.insetRequests==1, "Initial inset request");
          apply(root,new Insets(0,24,0,48),ZERO,ZERO); padding(root,0,24,0,48);
          int writes=root.paddingWrites;
          apply(root,new Insets(0,24,0,48),ZERO,ZERO);
          check(root.paddingWrites==writes, "Repeated callbacks do not accumulate padding or relayout");
          apply(root,new Insets(0,24,0,16),ZERO,ZERO); padding(root,0,24,0,16);
          apply(root,ZERO,ZERO,ZERO); padding(root,0,0,0,0);
          apply(root,new Insets(0,0,48,0),new Insets(30,0,0,0),ZERO); padding(root,30,0,48,0);
          apply(root,new Insets(0,24,0,48),new Insets(0,32,0,56),ZERO); padding(root,0,32,0,56);
          WindowInsets rest=apply(root,new Insets(0,24,0,48),ZERO,new Insets(0,0,0,300));
          check(rest.getInsets(WindowInsets.Type.ime()).bottom==252, "Remaining keyboard insets survive");
          check(root.insetRequests==1, "No self-triggered inset loop");
        }
        System.out.println("old Android, buttons, gestures, hidden bars, rotation, cutout, repeated events and keyboard: OK");
      }
    }`
};

test("actual Android activities handle safe areas, connections and foreground-only lifecycle", (t) => {
  const compiler = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", "javac") : "javac";
  const runtime = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", "java") : "java";
  const probe = spawnSync(compiler, ["-version"], { encoding: "utf8", timeout: 10000 });
  if (probe.error?.code === "ENOENT") return t.skip("JDK unavailable; Android Activity host test requires javac");
  assert.equal(probe.status, 0, probe.error?.message || probe.stderr);
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "fdv-android-insets-"));
  try {
    const sources = Object.entries(apiDoubles).map(([name, source]) => {
      const file = path.join(fixture, name);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, source);
      return file;
    });
    const classes = path.join(fixture, "classes");
    const appSources = fs.readdirSync(javaDirectory).filter(name => name.endsWith(".java"))
      .map(name => path.join(javaDirectory, name));
    const compiled = spawnSync(compiler, ["-encoding", "UTF-8", "-d", classes, ...sources, ...appSources],
      { encoding: "utf8", timeout: 30000 });
    assert.equal(compiled.status, 0, compiled.error?.message || compiled.stderr);
    const result = spawnSync(runtime, ["-cp", classes, "InsetsHarness"], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    assert.match(result.stdout, /keyboard: OK/);
    const connection = spawnSync(runtime, ["-cp", classes, "ConnectionHarness"], { encoding: "utf8", timeout: 10000 });
    assert.equal(connection.status, 0, connection.error?.message || connection.stderr);
    assert.match(connection.stdout, /no fallback: OK/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
