package br.com.curafamilia.app;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentSender;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning;
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

import javax.crypto.Cipher;
import javax.crypto.CipherInputStream;
import javax.crypto.CipherOutputStream;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

import org.json.JSONObject;

public class MainActivity extends Activity {
    private static final int FILE_CHOOSER_REQUEST = 81;
    private static final int DOCUMENT_SAVE_REQUEST = 82;
    private static final int DOCUMENT_SCAN_REQUEST = 83;
    private static final String APP_HOST = "app.local";
    private static final String KEY_ALIAS = "cura-familia-local-v1";
    private static final String STATE_FILE_NAME = "secure-state.cfs";
    private static final int MAX_STATE_BYTES = 8 * 1024 * 1024;
    private static final byte[] ENCRYPTED_FILE_MAGIC = new byte[] { 'C', 'F', 'V', '1' };
    private static final byte[] STATE_AAD = "cura-familia-state-v1".getBytes(StandardCharsets.UTF_8);
    private static final byte[] DOCUMENT_AAD = "cura-familia-document-v1".getBytes(StandardCharsets.UTF_8);
    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private byte[] pendingDocumentBytes;
    private File pendingDocumentFile;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(250, 249, 247));
        getWindow().setNavigationBarColor(Color.WHITE);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(250, 249, 247));
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) settings.setSafeBrowsingEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!isAppUri(uri)) return notFoundResponse();

                String path = uri.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                if (path.startsWith("/native-documents/")) {
                    return serveNativeDocument(path.substring("/native-documents/".length()));
                }
                path = path.substring(1);
                if (path.contains("..")) return notFoundResponse();

                try {
                    InputStream stream = getAssets().open("www/" + path);
                    Map<String, String> headers = new HashMap<>();
                    headers.put("Cache-Control", "no-store");
                    headers.put("Access-Control-Allow-Origin", "https://" + APP_HOST);
                    if (path.endsWith(".html")) {
                        headers.put("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-src 'none'");
                    }
                    return new WebResourceResponse(mimeTypeFor(path), "UTF-8", 200, "OK", headers, stream);
                } catch (IOException error) {
                    return notFoundResponse();
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isAppUri(request.getUrl());
            }
        });
        webView.addJavascriptInterface(new DownloadBridge(), "CuraFamiliaAndroid");
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                try {
                    startActivityForResult(params.createIntent(), FILE_CHOOSER_REQUEST);
                } catch (Exception error) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        webView.loadUrl("https://" + APP_HOST + "/index.html");
        migrateLegacyDocuments();
    }

    private final class DownloadBridge {
        @JavascriptInterface
        public void loadState() {
            new Thread(() -> {
                File stateFile = new File(getFilesDir(), STATE_FILE_NAME);
                if (!stateFile.isFile()) {
                    notifyStateLoaded(null);
                    return;
                }
                try (InputStream input = openPossiblyEncryptedFile(stateFile)) {
                    byte[] bytes = readStream(input, MAX_STATE_BYTES);
                    notifyStateLoaded(new String(bytes, StandardCharsets.UTF_8));
                } catch (Exception error) {
                    notifyStateError("Não foi possível abrir o armazenamento seguro");
                }
            }).start();
        }

        @JavascriptInterface
        public boolean saveState(String json) {
            try {
                byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
                if (bytes.length > MAX_STATE_BYTES) throw new IOException("State is too large");
                new JSONObject(json);
                writeEncryptedFile(new File(getFilesDir(), STATE_FILE_NAME), new ByteArrayInputStream(bytes));
                return true;
            } catch (Exception error) {
                return false;
            }
        }

        @JavascriptInterface
        public void scanDocument() {
            runOnUiThread(() -> startDocumentScanner());
        }

        @JavascriptInterface
        public void saveStoredDocument(String documentId, String fileName, String mimeType) {
            File source = nativeDocumentFile(documentId);
            if (!source.isFile()) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Documento não encontrado", Toast.LENGTH_LONG).show());
                return;
            }
            runOnUiThread(() -> {
                pendingDocumentBytes = null;
                pendingDocumentFile = source;
                requestDocumentSave(fileName, mimeType);
            });
        }

        @JavascriptInterface
        public void saveDocument(String fileName, String mimeType, String dataUrl) {
            try {
                int separator = dataUrl.indexOf(',');
                if (separator < 0) throw new IllegalArgumentException("Invalid data URL");
                byte[] bytes = Base64.decode(dataUrl.substring(separator + 1), Base64.DEFAULT);
                runOnUiThread(() -> {
                    pendingDocumentBytes = bytes;
                    pendingDocumentFile = null;
                    requestDocumentSave(fileName, mimeType);
                });
            } catch (Exception error) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Não foi possível preparar o documento", Toast.LENGTH_LONG).show());
            }
        }
    }

    private void startDocumentScanner() {
        GmsDocumentScannerOptions options = new GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(false)
            .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_PDF)
            .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
            .build();

        GmsDocumentScanning.getClient(options)
            .getStartScanIntent(this)
            .addOnSuccessListener(intentSender -> {
                try {
                    startIntentSenderForResult(intentSender, DOCUMENT_SCAN_REQUEST, null, 0, 0, 0);
                } catch (IntentSender.SendIntentException error) {
                    notifyDocumentScanCancelled("Não foi possível abrir o digitalizador");
                }
            })
            .addOnFailureListener(error -> notifyDocumentScanCancelled("O digitalizador não está disponível neste aparelho"));
    }

    private void deliverScannedDocument(GmsDocumentScanningResult scanResult) {
        new Thread(() -> {
            try {
                GmsDocumentScanningResult.Pdf pdf = scanResult.getPdf();
                if (pdf == null) throw new IOException("Scanned PDF unavailable");

                String documentId = UUID.randomUUID().toString();
                File destination = nativeDocumentFile(documentId);
                long fileSize;
                try (InputStream input = getContentResolver().openInputStream(pdf.getUri())) {
                    if (input == null) throw new IOException("Scanned PDF unavailable");
                    fileSize = writeEncryptedFile(destination, input);
                }

                String fileName = "documento-digitalizado-" + System.currentTimeMillis() + ".pdf";
                String script = "window.CuraFamiliaReceiveScan && window.CuraFamiliaReceiveScan("
                    + JSONObject.quote(fileName) + ","
                    + JSONObject.quote("application/pdf") + ","
                    + JSONObject.quote(documentId) + ","
                    + fileSize + ")";
                runOnUiThread(() -> {
                    if (webView != null) webView.evaluateJavascript(script, null);
                });
            } catch (Exception error) {
                notifyDocumentScanCancelled("Não foi possível processar o lote digitalizado");
            }
        }).start();
    }

    private File nativeDocumentFile(String documentId) {
        if (documentId == null || !documentId.matches("[0-9a-fA-F-]{36}")) {
            return new File(getFilesDir(), "invalid-document-id");
        }
        return new File(new File(getFilesDir(), "scanned-documents"), documentId + ".pdf");
    }

    private WebResourceResponse serveNativeDocument(String documentId) {
        File document = nativeDocumentFile(documentId);
        if (!document.isFile()) return notFoundResponse();
        try {
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-store");
            return new WebResourceResponse("application/pdf", null, 200, "OK", headers, openPossiblyEncryptedFile(document));
        } catch (IOException | GeneralSecurityException error) {
            return notFoundResponse();
        }
    }

    private boolean isAppUri(Uri uri) {
        return "https".equalsIgnoreCase(uri.getScheme()) && APP_HOST.equalsIgnoreCase(uri.getHost());
    }

    private SecretKey getOrCreateSecretKey() throws GeneralSecurityException, IOException {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        java.security.Key existing = keyStore.getKey(KEY_ALIAS, null);
        if (existing instanceof SecretKey) return (SecretKey) existing;

        KeyGenerator keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        keyGenerator.init(new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build());
        return keyGenerator.generateKey();
    }

    private byte[] additionalDataFor(File file) {
        return STATE_FILE_NAME.equals(file.getName()) ? STATE_AAD : DOCUMENT_AAD;
    }

    private long writeEncryptedFile(File destination, InputStream plaintext) throws IOException, GeneralSecurityException {
        File directory = destination.getParentFile();
        if (directory == null || (!directory.exists() && !directory.mkdirs())) {
            throw new IOException("Could not create secure storage directory");
        }

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateSecretKey());
        cipher.updateAAD(additionalDataFor(destination));
        byte[] iv = cipher.getIV();
        File temporary = new File(directory, destination.getName() + ".tmp");
        long plaintextSize;
        try (FileOutputStream rawOutput = new FileOutputStream(temporary)) {
            rawOutput.write(ENCRYPTED_FILE_MAGIC);
            rawOutput.write(iv.length);
            rawOutput.write(iv);
            try (CipherOutputStream encryptedOutput = new CipherOutputStream(rawOutput, cipher)) {
                plaintextSize = copyStream(plaintext, encryptedOutput);
            }
        } catch (IOException error) {
            temporary.delete();
            throw error;
        }

        File backup = new File(directory, destination.getName() + ".bak");
        if (backup.exists() && !backup.delete()) throw new IOException("Could not clear secure storage backup");
        boolean hadDestination = destination.exists();
        if (hadDestination && !destination.renameTo(backup)) throw new IOException("Could not prepare secure storage update");
        if (!temporary.renameTo(destination)) {
            if (hadDestination) backup.renameTo(destination);
            throw new IOException("Could not commit secure storage update");
        }
        if (backup.exists()) backup.delete();
        return plaintextSize;
    }

    private InputStream openPossiblyEncryptedFile(File source) throws IOException, GeneralSecurityException {
        BufferedInputStream rawInput = new BufferedInputStream(new FileInputStream(source));
        rawInput.mark(ENCRYPTED_FILE_MAGIC.length + 2);
        byte[] magic = new byte[ENCRYPTED_FILE_MAGIC.length];
        if (readFully(rawInput, magic) != magic.length || !Arrays.equals(magic, ENCRYPTED_FILE_MAGIC)) {
            rawInput.reset();
            return rawInput;
        }

        int ivLength = rawInput.read();
        if (ivLength != 12) {
            rawInput.close();
            throw new IOException("Invalid secure storage header");
        }
        byte[] iv = new byte[ivLength];
        if (readFully(rawInput, iv) != ivLength) {
            rawInput.close();
            throw new IOException("Invalid secure storage IV");
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateSecretKey(), new GCMParameterSpec(128, iv));
        cipher.updateAAD(additionalDataFor(source));
        return new CipherInputStream(rawInput, cipher);
    }

    private int readFully(InputStream input, byte[] buffer) throws IOException {
        int offset = 0;
        while (offset < buffer.length) {
            int read = input.read(buffer, offset, buffer.length - offset);
            if (read < 0) break;
            offset += read;
        }
        return offset;
    }

    private long copyStream(InputStream input, OutputStream output) throws IOException {
        byte[] buffer = new byte[16_384];
        long total = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
            output.write(buffer, 0, read);
            total += read;
        }
        return total;
    }

    private byte[] readStream(InputStream input, int maximumBytes) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[16_384];
        int total = 0;
        int read;
        while ((read = input.read(buffer)) != -1) {
            total += read;
            if (total > maximumBytes) throw new IOException("Secure state is too large");
            output.write(buffer, 0, read);
        }
        return output.toByteArray();
    }

    private void migrateLegacyDocuments() {
        new Thread(() -> {
            File directory = new File(getFilesDir(), "scanned-documents");
            File[] documents = directory.listFiles((ignored, name) -> name.endsWith(".pdf"));
            if (documents == null) return;
            for (File document : documents) {
                try (BufferedInputStream input = new BufferedInputStream(new FileInputStream(document))) {
                    input.mark(ENCRYPTED_FILE_MAGIC.length + 1);
                    byte[] magic = new byte[ENCRYPTED_FILE_MAGIC.length];
                    boolean alreadyEncrypted = readFully(input, magic) == magic.length && Arrays.equals(magic, ENCRYPTED_FILE_MAGIC);
                    if (!alreadyEncrypted) {
                        input.reset();
                        writeEncryptedFile(document, input);
                    }
                } catch (Exception ignored) {
                    // Mantém o documento legado intacto se a migração não puder ser concluída.
                }
            }
        }).start();
    }

    private void notifyStateLoaded(String json) {
        String value = json == null ? "null" : JSONObject.quote(json);
        String script = "window.CuraFamiliaReceiveState && window.CuraFamiliaReceiveState(" + value + ")";
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript(script, null);
        });
    }

    private void notifyStateError(String message) {
        String script = "window.CuraFamiliaStateError && window.CuraFamiliaStateError(" + JSONObject.quote(message) + ")";
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript(script, null);
        });
    }

    private void requestDocumentSave(String fileName, String mimeType) {
        String resolvedMimeType = mimeType == null || mimeType.isEmpty() ? "application/octet-stream" : mimeType.split(";", 2)[0];
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(resolvedMimeType);
        intent.putExtra(Intent.EXTRA_TITLE, fileName);
        startActivityForResult(intent, DOCUMENT_SAVE_REQUEST);
    }

    private void notifyDocumentScanCancelled(String message) {
        String script = "window.CuraFamiliaScanCancelled && window.CuraFamiliaScanCancelled("
            + JSONObject.quote(message == null ? "" : message) + ")";
        runOnUiThread(() -> {
            if (webView != null) webView.evaluateJavascript(script, null);
        });
    }

    private WebResourceResponse notFoundResponse() {
        return new WebResourceResponse(
            "text/plain",
            "UTF-8",
            404,
            "Not Found",
            new HashMap<>(),
            new ByteArrayInputStream(new byte[0])
        );
    }

    private String mimeTypeFor(String path) {
        String lowerPath = path.toLowerCase();
        if (lowerPath.endsWith(".html")) return "text/html";
        if (lowerPath.endsWith(".css")) return "text/css";
        if (lowerPath.endsWith(".js") || lowerPath.endsWith(".mjs")) return "text/javascript";
        if (lowerPath.endsWith(".json")) return "application/json";
        if (lowerPath.endsWith(".woff2")) return "font/woff2";
        if (lowerPath.endsWith(".png")) return "image/png";
        if (lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg")) return "image/jpeg";
        if (lowerPath.endsWith(".webp")) return "image/webp";
        return "application/octet-stream";
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == DOCUMENT_SCAN_REQUEST) {
            if (resultCode == RESULT_OK && data != null) {
                GmsDocumentScanningResult scanResult = GmsDocumentScanningResult.fromActivityResultIntent(data);
                if (scanResult != null && scanResult.getPdf() != null) {
                    deliverScannedDocument(scanResult);
                } else {
                    notifyDocumentScanCancelled("Nenhuma página foi digitalizada");
                }
            } else {
                notifyDocumentScanCancelled("");
            }
            return;
        }
        if (requestCode == DOCUMENT_SAVE_REQUEST) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && (pendingDocumentBytes != null || pendingDocumentFile != null)) {
                try (
                    OutputStream output = getContentResolver().openOutputStream(data.getData());
                    InputStream input = pendingDocumentFile == null ? null : openPossiblyEncryptedFile(pendingDocumentFile)
                ) {
                    if (output == null) throw new IOException("Output unavailable");
                    if (pendingDocumentBytes != null) {
                        output.write(pendingDocumentBytes);
                    } else if (input != null) {
                        byte[] buffer = new byte[16_384];
                        int read;
                        while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                    }
                    Toast.makeText(this, "Documento salvo", Toast.LENGTH_SHORT).show();
                } catch (IOException | GeneralSecurityException error) {
                    Toast.makeText(this, "Não foi possível salvar o documento", Toast.LENGTH_LONG).show();
                }
            }
            pendingDocumentBytes = null;
            pendingDocumentFile = null;
            return;
        }
        if (requestCode != FILE_CHOOSER_REQUEST || fileCallback == null) return;
        Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (fileCallback != null) fileCallback.onReceiveValue(null);
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
