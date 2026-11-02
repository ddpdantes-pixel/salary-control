import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.Key;
import java.security.KeyStore;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.interfaces.RSAKey;
import java.security.cert.X509Certificate;
import java.util.Arrays;
import java.util.HexFormat;

/** Local signing preflight. No password prompt, key generation, key writes or raw exception output. */
class VerifyReleaseKey {
    private static final String EXPECTED_CERT = "c06c1844b6d30f5eb7015f2489efe9000325096e4c4b98f722b8f8d6e1a549d2";
    private static void fail(String status, int code) {
        System.out.println("{\"status\":\"" + status + "\",\"secretLogged\":false}");
        System.exit(code);
    }
    public static void main(String[] args) throws Exception {
        Path file = Path.of(args[0]);
        String alias = args[1];
        if (!Files.isRegularFile(file)) { fail("KEYSTORE_FILE_MISSING", 10); return; }
        KeyStore store = KeyStore.getInstance("PKCS12");
        try (InputStream input = Files.newInputStream(file)) { store.load(input, null); }
        catch (java.io.IOException error) { fail("KEYSTORE_FORMAT_UNREADABLE", 20); return; }
        if (!store.containsAlias(alias) || !store.isKeyEntry(alias)) { fail("PRIVATE_KEY_ALIAS_MISSING", 11); return; }
        if (args.length > 2 && args[2].equals("--inspect-only")) {
            System.out.println("{\"status\":\"PUBLIC_METADATA_OK\",\"type\":\"PKCS12\",\"keyAliasFound\":true,\"integrityVerified\":false}");
            return;
        }
        String storeValue = System.getenv("MOYRITM_STORE_PASSWORD");
        String keyValue = System.getenv("MOYRITM_KEY_PASSWORD");
        if (storeValue == null || keyValue == null) { fail("PASSWORD_ENVIRONMENT_MISSING", 12); return; }
        char[] storePassword = storeValue.toCharArray(), keyPassword = keyValue.toCharArray();
        try {
            try (InputStream input = Files.newInputStream(file)) { store.load(input, storePassword); }
            catch (java.security.NoSuchAlgorithmException error) { fail("KEYSTORE_ALGORITHM_UNAVAILABLE", 13); return; }
            catch (java.security.cert.CertificateException error) { fail("KEYSTORE_CERTIFICATE_INVALID", 14); return; }
            catch (java.io.IOException error) { fail("KEYSTORE_INTEGRITY_OR_DECRYPTION_FAILED", 15); return; }
            X509Certificate cert = (X509Certificate) store.getCertificate(alias);
            String fingerprint = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(cert.getEncoded()));
            if (!EXPECTED_CERT.equals(fingerprint)) { fail("ORIGINAL_RELEASE_CERTIFICATE_MISMATCH", 16); return; }
            try { cert.checkValidity(); }
            catch (java.security.cert.CertificateException error) { fail("KEYSTORE_CERTIFICATE_INVALID", 14); return; }
            Key key;
            try { key = store.getKey(alias, keyPassword); }
            catch (java.security.UnrecoverableKeyException error) { fail("STORE_OPENED_BUT_PRIVATE_KEY_UNLOCK_FAILED", 17); return; }
            if (!(key instanceof java.security.PrivateKey) || !(key instanceof RSAKey rsa) || rsa.getModulus().bitLength() != 3072) {
                fail("UNEXPECTED_PRIVATE_KEY_TYPE", 18); return;
            }
            byte[] challenge = "MoyRitm local release-key possession check".getBytes(java.nio.charset.StandardCharsets.UTF_8);
            Signature proof = Signature.getInstance("SHA256withRSA");
            proof.initSign((java.security.PrivateKey) key); proof.update(challenge); byte[] signed = proof.sign();
            proof.initVerify(cert); proof.update(challenge);
            if (!proof.verify(signed)) { fail("PRIVATE_KEY_CERTIFICATE_PROOF_FAILED", 19); return; }
            System.out.println("{\"status\":\"ORIGINAL_RELEASE_KEY_VERIFIED\",\"type\":\"PKCS12\",\"certificateSha256\":\"" + fingerprint
                + "\",\"notBefore\":\"" + cert.getNotBefore().toInstant() + "\",\"notAfter\":\"" + cert.getNotAfter().toInstant()
                + "\",\"integrityVerified\":true,\"privateKeyVerified\":true,\"secretLogged\":false}");
        } finally { Arrays.fill(storePassword, '\0'); Arrays.fill(keyPassword, '\0'); storeValue = null; keyValue = null; }
    }
}
