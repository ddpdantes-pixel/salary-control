package io.github.ddpdantespixel.moyritm;

import org.junit.Before;
import org.junit.Test;
import static org.junit.Assert.*;
import java.security.*;
import java.security.spec.*;
import java.util.Base64;
import java.time.Instant;
import javax.crypto.Cipher;
import org.json.JSONObject;

public class OtaManifestPolicyTest {
    private KeyPair keys;
    private JSONObject manifest;
    private long now;
    @Before public void setup() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        keys = generator.generateKeyPair();
        now = Instant.parse("2026-10-16T09:00:00Z").toEpochMilli();
        Cipher cipher = Cipher.getInstance("RSA/ECB/PKCS1Padding");
        cipher.init(Cipher.ENCRYPT_MODE, keys.getPrivate());
        String checksum = Base64.getEncoder().encodeToString(cipher.doFinal(new byte[32]));
        manifest = new JSONObject().put("protocol", 1).put("packageId", "io.github.ddpdantespixel.moyritm")
            .put("channel", "qa").put("sequence", 2).put("enabled", true)
            .put("issuedAt", "2026-10-16T08:00:00Z").put("expiresAt", "2026-10-17T08:00:00Z")
            .put("release", new JSONObject().put("contract", OtaManifestPolicy.CONTRACT).put("contractFingerprint", "2".repeat(64)).put("nativeMin", 3).put("nativeMax", 3)
                .put("version", "1.1.1-qa.64.1").put("buildId", "qa64-first")
                .put("url", "https://github.com/ddpdantes-pixel/salary-control/releases/download/android-ota-qa-64/web.zip")
                .put("bytes", 1000).put("bundleSha256", "0".repeat(64)).put("checksum", checksum)
                .put("sessionKey", Base64.getEncoder().encodeToString(new byte[16]) + ":" + Base64.getEncoder().encodeToString(new byte[256])));
    }
    private JSONObject check(long free) throws Exception {
        String payload = manifest.toString();
        Signature signature = Signature.getInstance("RSASSA-PSS");
        signature.setParameter(new PSSParameterSpec("SHA-256", "MGF1", MGF1ParameterSpec.SHA256, 32, 1));
        signature.initSign(keys.getPrivate());
        signature.update(payload.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        return OtaManifestPolicy.verify(payload, Base64.getEncoder().encodeToString(signature.sign()),
            Base64.getEncoder().encodeToString(keys.getPublic().getEncoded()), "qa", "io.github.ddpdantespixel.moyritm", 3, 1, now, free, "2".repeat(64));
    }
    private void denied(String expected) throws Exception {
        try { check(1L << 30); fail("Expected refusal"); }
        catch (SecurityException error) { assertEquals(expected, error.getMessage()); }
    }
    @Test public void authenticCompatibleManifest() throws Exception { assertTrue(check(1L << 30).getBoolean("enabled")); }
    @Test public void wrongSignature() throws Exception {
        try { OtaManifestPolicy.verify(manifest.toString(), Base64.getEncoder().encodeToString(new byte[256]), Base64.getEncoder().encodeToString(keys.getPublic().getEncoded()), "qa", "io.github.ddpdantespixel.moyritm", 3, 0, now, 1L << 30, "2".repeat(64)); fail(); }
        catch (SecurityException error) { assertEquals("INVALID_SIGNATURE", error.getMessage()); }
    }
    @Test public void wrongChecksum() throws Exception { manifest.getJSONObject("release").put("bundleSha256", "1".repeat(64)); denied("INVALID_CHECKSUM"); }
    @Test public void incompatibleNative() throws Exception { manifest.getJSONObject("release").put("nativeMin", 4); denied("NATIVE_UPDATE_REQUIRED"); }
    @Test public void schemaChange() throws Exception { manifest.getJSONObject("release").put("contract", "migration-v2"); denied("SCHEMA_REVIEW_REQUIRED"); }
    @Test public void differentNativeContract() throws Exception { manifest.getJSONObject("release").put("contractFingerprint", "3".repeat(64)); denied("SCHEMA_REVIEW_REQUIRED"); }
    @Test public void replay() throws Exception { manifest.put("sequence", 0); denied("REPLAYED_MANIFEST"); }
    @Test public void expired() throws Exception { manifest.put("expiresAt", "2026-10-16T08:30:00Z"); denied("EXPIRED_MANIFEST"); }
    @Test public void wrongPackage() throws Exception { manifest.put("packageId", "other.app"); denied("INVALID_TARGET"); }
    @Test public void wrongChannel() throws Exception { manifest.put("channel", "stable"); denied("INVALID_TARGET"); }
    @Test public void insecureHost() throws Exception { manifest.getJSONObject("release").put("url", "http://github.com/ddpdantes-pixel/salary-control/releases/download/android-ota-qa-64/web.zip"); denied("INVALID_DOWNLOAD_URL"); }
    @Test public void lowStorage() throws Exception {
        try { check(1024); fail(); } catch (SecurityException error) { assertEquals("NOT_ENOUGH_SPACE", error.getMessage()); }
    }
    @Test public void pauseDoesNotRequireABundle() throws Exception { manifest.put("enabled", false).remove("release"); assertFalse(check(1024).getBoolean("enabled")); }
}
