// Encryption utilities for Tesla tokens using AES-GCM

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function getEncryptionKey(): Promise<CryptoKey> {
  const keyString = Deno.env.get('TOKEN_ENCRYPTION_KEY');
  if (!keyString) {
    throw new Error('TOKEN_ENCRYPTION_KEY not configured');
  }
  
  // Derive a 256-bit key from the secret using SHA-256
  const keyData = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(keyString)
  );
  
  return crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptToken(plaintext: string): Promise<string> {
  const key = await getEncryptionKey();
  
  // Generate random IV (12 bytes for AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    encoder.encode(plaintext)
  );
  
  // Combine IV + encrypted data and encode as base64
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

export async function decryptToken(ciphertext: string): Promise<string> {
  const key = await getEncryptionKey();
  
  // Decode base64 and split IV + encrypted data
  const combined = new Uint8Array(
    atob(ciphertext).split('').map(c => c.charCodeAt(0))
  );
  
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  
  return decoder.decode(decrypted);
}
