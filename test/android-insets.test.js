"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const activityPath = path.join(root, "android/app/src/main/java/ru/fdv/boulderingtimer/standalone/MainActivity.java");

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
    public static class VERSION_CODES { public static final int VANILLA_ICE_CREAM = 35; }
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
  }`,
  "android/app/Activity.java": `package android.app;
    import android.view.View; import android.os.Bundle;
    public class Activity {
      public View contentView;
      public void onCreate(Bundle b) {}
      public void setContentView(View v) { contentView=v; }
      public void onBackPressed() {}
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
  "android/webkit/WebView.java": `package android.webkit;
    import android.app.Activity; import android.view.View;
    public class WebView extends View {
      public WebView(Activity a) {}
      public Settings getSettings() { return new Settings(); }
      public void setWebChromeClient(WebChromeClient c) {}
      public void loadUrl(String u) {}
      public static class Settings {
        public void setJavaScriptEnabled(boolean b) {} public void setDomStorageEnabled(boolean b) {}
        public void setAllowFileAccess(boolean b) {} public void setUseWideViewPort(boolean b) {}
        public void setLoadWithOverviewMode(boolean b) {} public void setTextZoom(int z) {}
      }
    }`,
  "InsetsHarness.java": `import android.os.Build;
    import android.graphics.Insets; import android.view.WindowInsets; import android.widget.FrameLayout;
    import ru.fdv.boulderingtimer.standalone.MainActivity;
    public class InsetsHarness {
      static final Insets ZERO = new Insets(0,0,0,0);
      static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
      static FrameLayout open(int sdk) {
        Build.VERSION.SDK_INT=sdk;
        MainActivity a=new MainActivity(); a.onCreate(null);
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

test("actual Android Activity handles changing system areas without fixed gaps", (t) => {
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
    const compiled = spawnSync(compiler, ["-encoding", "UTF-8", "-d", classes, ...sources, activityPath],
      { encoding: "utf8", timeout: 30000 });
    assert.equal(compiled.status, 0, compiled.error?.message || compiled.stderr);
    const result = spawnSync(runtime, ["-cp", classes, "InsetsHarness"], { encoding: "utf8", timeout: 10000 });
    assert.equal(result.status, 0, result.error?.message || result.stderr);
    assert.match(result.stdout, /keyboard: OK/);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
