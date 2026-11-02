package com.p2pchat.app;

import android.content.SharedPreferences;
import android.util.Base64;

import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.spec.PKCS8EncodedKeySpec;
import java.security.spec.X509EncodedKeySpec;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * End-to-end encryption for NINE messages.
 *
 * Uses a hybrid scheme so relays only ever carry ciphertext they cannot read:
 *   - Each device has an RSA-2048 key pair (generated once, stored locally).
 *   - Public keys are shared through PRESENCE announcements.
 *   - To send: a random AES-256 key encrypts the message (AES/GCM), and that AES
 *     key is encrypted with the recipient's RSA public key.
 *   - Only the recipient's private key can recover the AES key and decrypt.
 *
 * RSA + AES is used (rather than modern X25519) because it works on every target
 * API level (minSdk 23), where JCA X25519 support is not available.
 */
public class Crypto {

    private static final String PREF_PUB = "rsa_pub";
    private static final String PREF_PRIV = "rsa_priv";
    private static final String RSA_TRANSFORM = "RSA/ECB/OAEPWithSHA-256AndMGF1Padding";
    private static final String AES_TRANSFORM = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;
    private static final int IV_BYTES = 12;

    public static final String ENC_PREFIX = "ENC1:";

    private PrivateKey privateKey;
    private PublicKey publicKey;
    private String publicKeyB64;

    public Crypto(SharedPreferences prefs) {
        try {
            String pub = prefs.getString(PREF_PUB, null);
            String priv = prefs.getString(PREF_PRIV, null);
            if (pub == null || priv == null) {
                KeyPairGenerator kpg = KeyPairGenerator.getInstance("RSA");
                kpg.initialize(2048);
                KeyPair kp = kpg.generateKeyPair();
                publicKey = kp.getPublic();
                privateKey = kp.getPrivate();
                publicKeyB64 = Base64.encodeToString(publicKey.getEncoded(), Base64.NO_WRAP);
                String privB64 = Base64.encodeToString(privateKey.getEncoded(), Base64.NO_WRAP);
                prefs.edit().putString(PREF_PUB, publicKeyB64).putString(PREF_PRIV, privB64).apply();
            } else {
                publicKeyB64 = pub;
                KeyFactory kf = KeyFactory.getInstance("RSA");
                publicKey = kf.generatePublic(new X509EncodedKeySpec(Base64.decode(pub, Base64.NO_WRAP)));
                privateKey = kf.generatePrivate(new PKCS8EncodedKeySpec(Base64.decode(priv, Base64.NO_WRAP)));
            }
        } catch (Exception e) {
            throw new RuntimeException("Crypto init failed", e);
        }
    }

    public String getPublicKeyBase64() {
        return publicKeyB64;
    }

    public static boolean isEncrypted(String payload) {
        return payload != null && payload.startsWith(ENC_PREFIX);
    }

    private static PublicKey publicKeyFromBase64(String b64) throws Exception {
        KeyFactory kf = KeyFactory.getInstance("RSA");
        return kf.generatePublic(new X509EncodedKeySpec(Base64.decode(b64, Base64.NO_WRAP)));
    }

    /**
     * Encrypt a message for a recipient identified by their public key.
     * Returns {@code ENC1:<encAesKey>:<iv>:<ciphertext>} (all base64), or null on failure.
     */
    public String encryptFor(String recipientPubB64, String plaintext) {
        if (recipientPubB64 == null || recipientPubB64.isEmpty()) {
            return null;
        }
        try {
            PublicKey recipient = publicKeyFromBase64(recipientPubB64);

            KeyGenerator kg = KeyGenerator.getInstance("AES");
            kg.init(256);
            SecretKey aesKey = kg.generateKey();

            byte[] iv = new byte[IV_BYTES];
            new SecureRandom().nextBytes(iv);
            Cipher aes = Cipher.getInstance(AES_TRANSFORM);
            aes.init(Cipher.ENCRYPT_MODE, aesKey, new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] ct = aes.doFinal(plaintext.getBytes("UTF-8"));

            Cipher rsa = Cipher.getInstance(RSA_TRANSFORM);
            rsa.init(Cipher.ENCRYPT_MODE, recipient);
            byte[] encKey = rsa.doFinal(aesKey.getEncoded());

            return ENC_PREFIX
                    + Base64.encodeToString(encKey, Base64.NO_WRAP) + ":"
                    + Base64.encodeToString(iv, Base64.NO_WRAP) + ":"
                    + Base64.encodeToString(ct, Base64.NO_WRAP);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Decrypt a payload previously produced by {@link #encryptFor}.
     * If the payload is not encrypted, it is returned unchanged.
     * Returns null if decryption fails (e.g. not intended for us).
     */
    public String decrypt(String payload) {
        if (!isEncrypted(payload)) {
            return payload;
        }
        try {
            String body = payload.substring(ENC_PREFIX.length());
            String[] parts = body.split(":");
            if (parts.length != 3) {
                return null;
            }
            byte[] encKey = Base64.decode(parts[0], Base64.NO_WRAP);
            byte[] iv = Base64.decode(parts[1], Base64.NO_WRAP);
            byte[] ct = Base64.decode(parts[2], Base64.NO_WRAP);

            Cipher rsa = Cipher.getInstance(RSA_TRANSFORM);
            rsa.init(Cipher.DECRYPT_MODE, privateKey);
            byte[] aesKeyBytes = rsa.doFinal(encKey);
            SecretKey aesKey = new SecretKeySpec(aesKeyBytes, "AES");

            Cipher aes = Cipher.getInstance(AES_TRANSFORM);
            aes.init(Cipher.DECRYPT_MODE, aesKey, new GCMParameterSpec(GCM_TAG_BITS, iv));
            byte[] pt = aes.doFinal(ct);
            return new String(pt, "UTF-8");
        } catch (Exception e) {
            return null;
        }
    }
}
