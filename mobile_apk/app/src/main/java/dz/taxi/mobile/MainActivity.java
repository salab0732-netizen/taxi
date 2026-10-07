package dz.taxi.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Message;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.text.InputType;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.JsResult;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;

/**
 * تطبيق «سيارات الأجرة» للهاتف: غلاف WebView لواجهة المنصّة.
 * قاعدة البيانات والوثائق تبقى على الحاسوب (backend_new)، والهاتف لا يحفظ أي بيانات:
 * الواجهة نفسها تُحمَّل من الحاسوب (رابط ngrok أو عنوان الحاسوب في الشبكة / Tailscale)،
 * فأي تحديث للواجهة يصل دون إعادة تثبيت التطبيق.
 * هنا فقط: حفظ عنوان الحاسوب، صفحة «غير متصل»، نوافذ الطباعة، رفع الصور (كاميرا/معرض)، تنزيل الملفات.
 */
public class MainActivity extends Activity {
    private static final String PREFS = "taxi", KEY_URL = "server_url";
    /** الخادم السحابي الدائم (Oracle Cloud) — يُستعمل تلقائياً، لا حاجة لإدخال أي رابط */
    private static final String DEFAULT_URL = "https://taxi.kafaa-albayadh.duckdns.org";
    private static final String VERSION = "1.1";
    // ngrok المجاني يعرض صفحة تحذير لكل متصفح؛ وكيل مستخدم غير متصفّحي يتجاوزها
    private static final String UA_TAG = "TaxiApp/" + VERSION + " (Android)";
    private static final int PICK_FILE = 41;

    private SharedPreferences prefs;
    private FrameLayout root;
    private WebView web;                                     // النافذة الرئيسية
    private final ArrayList<WebView> popups = new ArrayList<>();  // نوافذ الطباعة (window.open)
    private String base = "";
    private ValueCallback<Uri[]> fileCb;
    private Uri cameraUri;
    private final ArrayList<Uri> photos = new ArrayList<>(); // صور الكاميرا تُحذف (لا تبقى وثائق شخصية على الهاتف)

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        getWindow().setStatusBarColor(Color.parseColor("#052E28"));
        String url = prefs.getString(KEY_URL, "");
        // الروابط المؤقتة القديمة (ngrok / الحاسوب) ← الخادم السحابي الدائم
        if (url.isEmpty() || !prefs.getBoolean("migrated_v2", false)) {
            url = DEFAULT_URL;   // أول تشغيل للإصدار 2: النسخة الجديدة (السحابية)
            prefs.edit().putString(KEY_URL, url).putBoolean("migrated_v2", true).apply();
        }
        showWeb(url);
        handleAuth(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleAuth(intent);
    }

    /** نتيجة الدخول بحساب Google (taxiapp://auth?token=…) ← نفس معاملات الموقع، والواجهة تكمل الدخول. */
    private void handleAuth(Intent intent) {
        Uri u = intent == null ? null : intent.getData();
        if (u == null || !"taxiapp".equals(u.getScheme())) return;
        String url = prefs.getString(KEY_URL, "");
        if (url.isEmpty()) return;
        if (web == null) showWeb(url);
        closePopups();
        String q = u.getEncodedQuery();
        web.loadUrl(base + "/" + (q == null ? "" : "?" + q));
        intent.setData(null);
    }

    /** Google يمنع الدخول داخل WebView ← متصفح الهاتف، ثم يعود إلى التطبيق. */
    private void googleLogin(Uri u) {
        String url = u.toString() + (u.getQuery() == null ? "?" : "&") + "app=1";
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
            Toast.makeText(this, "أكمل الدخول في المتصفح ثم تعود إلى التطبيق تلقائياً", Toast.LENGTH_LONG).show();
        } catch (Exception e) {
            Toast.makeText(this, "لا يوجد متصفح على الهاتف", Toast.LENGTH_LONG).show();
        }
    }

    // ── شاشة عنوان الحاسوب ─────────────────────────────────
    private void showSetup(String error) {
        closePopups();
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setLayoutDirection(View.LAYOUT_DIRECTION_RTL);
        int pad = dp(24);
        box.setPadding(pad, pad, pad, pad);
        box.setBackgroundColor(Color.parseColor("#F4F6F5"));

        TextView title = new TextView(this);
        title.setText("🚕 منصة تسيير سيارات الأجرة\nاختيار النسخة");
        title.setTextSize(20);
        title.setTextColor(Color.parseColor("#052E28"));
        title.setGravity(Gravity.CENTER);
        box.addView(title);

        TextView hint = new TextView(this);
        hint.setText("☁️ النسخة الجديدة (السحابية — المعتمدة): اضغط الزرّ أدناه.\n"
                + "💻 النسخة القديمة (على الحاسوب): اكتب رابط ngrok الظاهر عند تشغيل START.bat.\n"
                + "الهاتف لا يحفظ أي بيانات.");
        hint.setTextSize(14);
        hint.setTextColor(Color.parseColor("#5B6B66"));
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, dp(12), 0, dp(16));
        box.addView(hint);

        Button cloud = new Button(this);
        cloud.setText("☁️ النسخة الجديدة (السحابية)");
        cloud.setOnClickListener(v -> {
            prefs.edit().putString(KEY_URL, DEFAULT_URL).apply();
            showWeb(DEFAULT_URL);
        });
        box.addView(cloud);

        TextView or = new TextView(this);
        or.setText("— أو النسخة القديمة (الحاسوب) —");
        or.setTextColor(Color.parseColor("#5B6B66"));
        or.setGravity(Gravity.CENTER);
        or.setPadding(0, dp(20), 0, dp(6));
        box.addView(or);

        final EditText input = new EditText(this);
        input.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        input.setHint("https://xxxx.ngrok-free.dev");
        String cur = prefs.getString(KEY_URL, "");
        input.setText(cur.equals(DEFAULT_URL) ? "" : cur);
        input.setTextDirection(View.TEXT_DIRECTION_LTR);
        input.setSingleLine(true);
        box.addView(input);

        final TextView err = new TextView(this);
        err.setTextColor(Color.parseColor("#B3261E"));
        err.setGravity(Gravity.CENTER);
        err.setPadding(0, dp(10), 0, 0);
        if (error != null) err.setText(error);
        box.addView(err);

        Button go = new Button(this);
        go.setText("💻 اتصال بالنسخة القديمة");
        go.setOnClickListener(v -> {
            String u = normalize(input.getText().toString());
            if (u == null) { err.setText("الرابط غير صحيح"); return; }
            err.setText("⏳ جاري الاتصال…");
            go.setEnabled(false);
            new Thread(() -> {
                boolean ok = ping(u);
                runOnUiThread(() -> {
                    go.setEnabled(true);
                    if (ok) {
                        prefs.edit().putString(KEY_URL, u).apply();
                        showWeb(u);
                    } else {
                        err.setText("تعذّر الاتصال بالنسخة القديمة.\nتأكّد أن START.bat يعمل على الحاسوب وأن الرابط هو الرابط الحالي.");
                    }
                });
            }).start();
        });
        box.addView(go);
        web = null;
        root = null;
        setContentView(box);
    }

    /** «abc.ngrok-free.app» ← https، و«192.168.1.10» ← http على المنفذ 3000 (خادم الواجهة). */
    private static String normalize(String s) {
        s = s == null ? "" : s.trim();
        if (s.isEmpty()) return null;
        if (!s.startsWith("http://") && !s.startsWith("https://")) {
            String host = s.split("[/:]")[0];
            boolean local = host.matches("[0-9.]+") || host.equals("localhost") || !host.contains(".");
            s = (local ? "http://" : "https://") + s;
        }
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        Uri u = Uri.parse(s);
        if (u.getHost() == null) return null;
        if (s.startsWith("http://") && u.getPort() == -1) s = s + ":3000";
        return URLUtil.isValidUrl(s) ? s : null;
    }

    private static boolean ping(String b) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(b + "/").openConnection();
            c.setRequestProperty("User-Agent", UA_TAG);
            c.setRequestProperty("ngrok-skip-browser-warning", "1");
            c.setConnectTimeout(8000);
            c.setReadTimeout(8000);
            int code = c.getResponseCode();
            c.disconnect();
            return code == 200;
        } catch (Exception e) {
            return false;
        }
    }

    // ── الواجهة ───────────────────────────────────────────
    private void showWeb(final String b) {
        base = b;
        root = new FrameLayout(this);
        web = newWebView(false);
        root.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        CookieManager.getInstance().setAcceptCookie(true);
        java.util.Map<String, String> h = new java.util.HashMap<>();
        h.put("ngrok-skip-browser-warning", "1");
        web.loadUrl(base + "/", h);
    }

    private WebView newWebView(final boolean popup) {
        final WebView w = new WebView(this);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);           // رمز الدخول (token) في localStorage
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);          // رفع صور الوثائق من الكاميرا/المعرض
        s.setSupportMultipleWindows(true);      // نوافذ الطباعة window.open(..., "_blank")
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setBuiltInZoomControls(popup);        // الوثائق المطبوعة بمقاس A4 ← تكبير بالأصابع
        s.setDisplayZoomControls(false);
        s.setUserAgentString(UA_TAG);
        w.setBackgroundColor(Color.WHITE);
        w.addJavascriptInterface(new Bridge(w), "TaxiApp");
        w.setWebViewClient(new Client(popup));
        w.setWebChromeClient(new Chrome());
        w.setDownloadListener((url, ua, cd, mime, len) -> downloadUrl(url, cd, mime));
        return w;
    }

    private class Client extends WebViewClient {
        private final boolean popup;
        Client(boolean popup) { this.popup = popup; }

        @Override
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
            Uri u = req.getUrl();
            String url = u.toString();
            if (url.startsWith(base) && "/api/auth/google".equals(u.getPath())) {
                googleLogin(u);
                if (popup) closePopup(v);
                return true;
            }
            if (url.startsWith(base) || url.startsWith("about:") || url.startsWith("blob:") || url.startsWith("data:")) return false;
            String host = u.getHost() == null ? "" : u.getHost();
            try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }  // روابط خارجية ← المتصفح
            if (popup && !v.canGoBack()) closePopup(v);
            return true;
        }

        @Override
        public void onPageFinished(WebView v, String url) {
            injectShim(v);
        }

        @Override
        public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError e) {
            if (req.isForMainFrame() && !popup) showSetup("تعذّر الوصول إلى الخادم — تأكّد من اتصال الهاتف بالإنترنت.");
        }

        @Override
        public void onReceivedHttpError(WebView v, WebResourceRequest req, WebResourceResponse r) {
            // ngrok متوقّف أو الرابط قديم ← رسالة واضحة بدل صفحة خطأ ngrok
            if (req.isForMainFrame() && !popup && r.getStatusCode() >= 400 && r.getStatusCode() != 401 && r.getStatusCode() != 403
                    && req.getUrl().toString().replaceAll("/+$", "").equals(base)) {
                showSetup("الخادم لم يستجب (" + r.getStatusCode() + ") — أعد المحاولة بعد قليل.");
            }
        }
    }

    /** window.print() لا يعمل في WebView ← نافذة الطباعة/الحفظ PDF في أندرويد. */
    private static void injectShim(WebView v) {
        v.evaluateJavascript("(function(){if(window.TaxiApp){window.print=function(){TaxiApp.print(document.title||'')};}})()", null);
    }

    private class Chrome extends WebChromeClient {
        // نوافذ الطباعة: تُفتح فوق الواجهة وتُغلق بزر الرجوع
        @Override
        public boolean onCreateWindow(WebView v, boolean dialog, boolean user, Message msg) {
            if (root == null) return false;
            WebView child = newWebView(true);
            popups.add(child);
            root.addView(child, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            WebView.WebViewTransport t = (WebView.WebViewTransport) msg.obj;
            t.setWebView(child);
            msg.sendToTarget();
            child.postDelayed(() -> injectShim(child), 700);   // window.open("") + document.write (RequestsTab)
            Toast.makeText(MainActivity.this, "زر الرجوع ← العودة إلى البرنامج", Toast.LENGTH_SHORT).show();
            return true;
        }

        @Override
        public void onCloseWindow(WebView w) { closePopup(w); }

        @Override
        public boolean onJsAlert(WebView v, String url, String msg, final JsResult r) {
            new AlertDialog.Builder(MainActivity.this).setMessage(msg)
                    .setPositiveButton("حسناً", (d, w) -> r.confirm())
                    .setOnCancelListener(d -> r.cancel()).show();
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView v, String url, String msg, final JsResult r) {
            new AlertDialog.Builder(MainActivity.this).setMessage(msg)
                    .setPositiveButton("متابعة", (d, w) -> r.confirm())
                    .setNegativeButton("إلغاء", (d, w) -> r.cancel())
                    .setOnCancelListener(d -> r.cancel()).show();
            return true;
        }

        // رفع الوثائق (OCR): <input type=file> ← الكاميرا أو المعرض أو ملف PDF
        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCb != null) fileCb.onReceiveValue(null);
            fileCb = cb;
            deletePhotos();
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
            pick.addCategory(Intent.CATEGORY_OPENABLE);
            pick.setType("*/*");
            pick.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "application/pdf"});
            Intent chooser = Intent.createChooser(pick, "صورة الوثيقة");
            cameraUri = null;
            try {                                       // صورة كاملة الدقة بلا صلاحيات تخزين (Android 10+)
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Images.Media.DISPLAY_NAME, "taxi_" + System.currentTimeMillis() + ".jpg");
                cv.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                cv.put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Taxi");
                cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, cv);
                Intent cam = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                cam.putExtra(MediaStore.EXTRA_OUTPUT, cameraUri);
                cam.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{cam});
            } catch (Exception e) {
                cameraUri = null;
            }
            try {
                startActivityForResult(chooser, PICK_FILE);
            } catch (Exception e) {
                fileCb = null;
                return false;
            }
            return true;
        }
    }

    /** واجهة JavaScript: window.TaxiApp */
    private class Bridge {
        private final WebView w;
        Bridge(WebView w) { this.w = w; }

        @JavascriptInterface
        public void print(String title) { runOnUiThread(() -> printPage(w, title)); }

        /** ملفات تُنزَّل عبر fetch (Excel…) — kit.jsx downloadFile */
        @JavascriptInterface
        public void saveFile(String name, String mime, String b64) {
            runOnUiThread(() -> saveBytes(name, mime, Base64.decode(b64, Base64.DEFAULT)));
        }

        @JavascriptInterface
        public void changeServer() { runOnUiThread(() -> showSetup(null)); }

        @JavascriptInterface
        public String version() { return VERSION; }
    }

    private void printPage(WebView w, String title) {
        String name = (title == null || title.trim().isEmpty()) ? "وثيقة" : title.trim();
        PrintManager pm = (PrintManager) getSystemService(Context.PRINT_SERVICE);
        pm.print(name, w.createPrintDocumentAdapter(name), null);
    }

    // ── التنزيلات: مجلد «التنزيلات» ثم الفتح ──────────────
    private void saveBytes(String name, String mime, byte[] data) {
        if (name == null || name.isEmpty()) name = "taxi_" + System.currentTimeMillis();
        if (mime == null || mime.isEmpty()) mime = "application/octet-stream";
        try {
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Downloads.DISPLAY_NAME, name);
            cv.put(MediaStore.Downloads.MIME_TYPE, mime);
            Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
            if (uri == null) throw new Exception("insert");
            try (OutputStream o = getContentResolver().openOutputStream(uri)) { o.write(data); }
            Toast.makeText(this, "✅ حُفظ في التنزيلات: " + name, Toast.LENGTH_LONG).show();
            openFile(uri, mime);
        } catch (Exception e) {
            Toast.makeText(this, "تعذّر حفظ الملف", Toast.LENGTH_LONG).show();
        }
    }

    private void downloadUrl(String url, String cd, String mime) {
        if (!url.startsWith(base)) return;
        String name = URLUtil.guessFileName(url, cd, mime);
        DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
        if (mime != null) r.setMimeType(mime);
        r.addRequestHeader("User-Agent", UA_TAG);
        r.addRequestHeader("ngrok-skip-browser-warning", "1");
        String cookies = CookieManager.getInstance().getCookie(url);
        if (cookies != null) r.addRequestHeader("Cookie", cookies);
        r.setTitle(name);
        r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
        ((DownloadManager) getSystemService(DOWNLOAD_SERVICE)).enqueue(r);
        Toast.makeText(this, "⏳ تنزيل " + name, Toast.LENGTH_SHORT).show();
    }

    private void openFile(Uri uri, String mime) {
        Intent view = new Intent(Intent.ACTION_VIEW);
        view.setDataAndType(uri, mime);
        view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { startActivity(Intent.createChooser(view, "فتح الملف")); } catch (Exception ignored) { }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req != PICK_FILE) { super.onActivityResult(req, res, data); return; }
        Uri[] out = null;
        if (res == RESULT_OK) {
            if (data != null && data.getData() != null) {
                out = new Uri[]{data.getData()};                                  // المعرض / ملف
                if (cameraUri != null) photos.add(cameraUri);                     // مدخل كاميرا فارغ
            } else if (cameraUri != null) { out = new Uri[]{cameraUri}; photos.add(cameraUri); }  // الكاميرا
        } else if (cameraUri != null) {
            photos.add(cameraUri);
        }
        cameraUri = null;
        if (fileCb != null) fileCb.onReceiveValue(out);
        fileCb = null;
    }

    /** صور الكاميرا تُحذف عند الرفع التالي أو إغلاق التطبيق (بعد أن تكون قد أُرسلت إلى الحاسوب). */
    private void deletePhotos() {
        for (Uri u : photos) {
            try { getContentResolver().delete(u, null, null); } catch (Exception ignored) { }
        }
        photos.clear();
    }

    // ── نوافذ الطباعة ─────────────────────────────────────
    private void closePopup(WebView w) {
        popups.remove(w);
        if (root != null) root.removeView(w);
        w.destroy();
    }

    private void closePopups() {
        while (!popups.isEmpty()) closePopup(popups.get(popups.size() - 1));
    }

    @Override
    protected void onDestroy() {
        deletePhotos();
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (!popups.isEmpty()) {
            WebView top = popups.get(popups.size() - 1);
            if (top.canGoBack()) top.goBack(); else closePopup(top);
            return;
        }
        if (web != null) {
            if (web.canGoBack()) { web.goBack(); return; }
            new AlertDialog.Builder(this)
                    .setItems(new String[]{"🔄 إعادة تحميل", "🔀 تغيير النسخة (الجديدة / القديمة)", "🚪 خروج"}, (d, i) -> {
                        if (i == 0) web.reload();
                        else if (i == 1) showSetup(null);
                        else finish();
                    }).show();
            return;
        }
        String url = prefs.getString(KEY_URL, "");
        if (!url.isEmpty()) showWeb(url); else super.onBackPressed();
    }

    private int dp(int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
