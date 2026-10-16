package io.github.ddpdantespixel.moyritm;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.MGF1ParameterSpec;
import java.security.spec.PSSParameterSpec;
import java.security.spec.X509EncodedKeySpec;
import java.time.Instant;
import java.util.Base64;
import javax.crypto.Cipher;
import org.json.JSONObject;

/** Authenticates the exact payload bytes before trusting any download or compatibility field. */
public final class OtaManifestPolicy {
    public static final String CONTRACT = "web-v1-no-migration";
    public static final long MAX_BYTES = 32L * 1024 * 1024;

    public static JSONObject verify(String payload, String signature, String spki, String channel,
            String packageId, long nativeCode, long lastSequence, long now, long usableBytes, String contractFingerprint) throws Exception {
        if (payload == null || payload.length() > 32768 || signature == null) throw new SecurityException("INVALID_MANIFEST");
        PublicKey key = KeyFactory.getInstance("RSA").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(spki)));
        Signature verifier;
        try { verifier = Signature.getInstance("RSASSA-PSS"); }
        catch (java.security.NoSuchAlgorithmException unsupported) { verifier = Signature.getInstance("SHA256withRSA/PSS"); }
        verifier.initVerify(key);
        verifier.setParameter(new PSSParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, 32, 1));
        verifier.update(payload.getBytes(StandardCharsets.UTF_8));
        if (!verifier.verify(Base64.getDecoder().decode(signature))) throw new SecurityException("INVALID_SIGNATURE");
        JSONObject value = new JSONObject(payload);
        if (value.getInt("protocol") != 1 || !packageId.equals(value.getString("packageId")) ||
                !channel.equals(value.getString("channel"))) throw new SecurityException("INVALID_TARGET");
        long issued = Instant.parse(value.getString("issuedAt")).toEpochMilli();
        long expires = Instant.parse(value.getString("expiresAt")).toEpochMilli();
        if (issued > now + 300000 || expires <= now || expires <= issued || expires - issued > 7L * 86400000) throw new SecurityException("EXPIRED_MANIFEST");
        long sequence = value.getLong("sequence");
        if (sequence <= 0 || sequence < lastSequence) throw new SecurityException("REPLAYED_MANIFEST");
        if (!value.getBoolean("enabled") || !value.has("release")) return value;
        JSONObject release = value.getJSONObject("release");
        if (nativeCode < release.getLong("nativeMin") || nativeCode > release.getLong("nativeMax")) throw new SecurityException("NATIVE_UPDATE_REQUIRED");
        if (!CONTRACT.equals(release.getString("contract")) ||
            !contractFingerprint.equals(release.optString("contractFingerprint", ""))) throw new SecurityException("SCHEMA_REVIEW_REQUIRED");
        if (!release.getString("version").matches("[0-9]+\\.[0-9]+\\.[0-9]+(?:-[A-Za-z0-9.-]+)?") ||
                !release.getString("buildId").matches("[A-Za-z0-9._-]{1,100}")) throw new SecurityException("INVALID_VERSION");
        URI uri = new URI(release.getString("url"));
        if (!"https".equals(uri.getScheme()) || !"github.com".equals(uri.getHost()) || uri.getUserInfo() != null ||
                uri.getPort() != -1 || uri.getQuery() != null || uri.getFragment() != null ||
                !uri.getPath().startsWith("/ddpdantes-pixel/salary-control/releases/download/android-ota-" + channel + "-") ||
                !uri.getPath().endsWith(".zip") || uri.getPath().contains("..")) throw new SecurityException("INVALID_DOWNLOAD_URL");
        long bytes = release.getLong("bytes");
        if (bytes <= 0 || bytes > MAX_BYTES) throw new SecurityException("INVALID_SIZE");
        if (usableBytes < bytes * 5 + 32L * 1024 * 1024) throw new SecurityException("NOT_ENOUGH_SPACE");
        String checksum = release.getString("bundleSha256");
        if (!checksum.matches("[a-f0-9]{64}")) throw new SecurityException("INVALID_CHECKSUM");
        Cipher cipher = Cipher.getInstance("RSA/ECB/PKCS1Padding");
        cipher.init(Cipher.DECRYPT_MODE, key);
        byte[] decoded = cipher.doFinal(Base64.getDecoder().decode(release.getString("checksum")));
        StringBuilder hex = new StringBuilder();
        for (byte b : decoded) hex.append(String.format("%02x", b & 0xff));
        if (!checksum.equals(hex.toString())) throw new SecurityException("INVALID_CHECKSUM");
        String[] session = release.getString("sessionKey").split(":", -1);
        if (session.length != 2 || Base64.getDecoder().decode(session[0]).length != 16 ||
                Base64.getDecoder().decode(session[1]).length != 256) throw new SecurityException("INVALID_SESSION_KEY");
        return value;
    }
}
