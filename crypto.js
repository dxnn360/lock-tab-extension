// Cryptographic Security Utilities using Web Crypto API
// PBKDF2 (100,000 iterations) + AES-256-GCM authenticated encryption

const PBKDF2_ITERATIONS = 100000;

// Convert Uint8Array to Base64
function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Base64 to Uint8Array
function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// Generate random salt/IV
function generateRandomBytes(length = 16) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return array;
}

// Derive AES-256-GCM key & verify key from password using PBKDF2
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  );

  return await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
}

// Create password verifier hash with random salt
async function createPasswordVerifier(password) {
  const salt = generateRandomBytes(16);
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    passwordKey,
    256
  );

  return {
    salt: bufferToBase64(salt),
    verifier: bufferToBase64(derivedBits)
  };
}

// Verify password against stored salt and verifier
async function verifyPassword(password, saltBase64, verifierBase64) {
  try {
    const salt = base64ToBuffer(saltBase64);
    const enc = new TextEncoder();
    const passwordKey = await crypto.subtle.importKey(
      "raw",
      enc.encode(password),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: new Uint8Array(salt),
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256"
      },
      passwordKey,
      256
    );

    const derivedBase64 = bufferToBase64(derivedBits);
    return derivedBase64 === verifierBase64;
  } catch (e) {
    return false;
  }
}

// Encrypt plaintext with password (AES-256-GCM)
async function encryptWithPassword(text, password, saltBase64) {
  const salt = new Uint8Array(base64ToBuffer(saltBase64));
  const key = await deriveKey(password, salt);
  const iv = generateRandomBytes(12); // Standard 12-byte IV for GCM
  const enc = new TextEncoder();

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv
    },
    key,
    enc.encode(text)
  );

  return {
    iv: bufferToBase64(iv),
    ciphertext: bufferToBase64(ciphertext)
  };
}

// Decrypt ciphertext with password (AES-256-GCM)
async function decryptWithPassword(encryptedData, password, saltBase64) {
  try {
    const salt = new Uint8Array(base64ToBuffer(saltBase64));
    const iv = new Uint8Array(base64ToBuffer(encryptedData.iv));
    const ciphertext = base64ToBuffer(encryptedData.ciphertext);
    const key = await deriveKey(password, salt);

    const decrypted = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      ciphertext
    );

    const dec = new TextDecoder();
    return dec.decode(decrypted);
  } catch (err) {
    return null; // Decryption failed (wrong password or altered data)
  }
}
