import { execSync } from 'child_process';

/**
 * Protects a sensitive string using Windows DPAPI (CurrentUser scope).
 * Returns base64 ciphertext, or null if DPAPI fails or non-Windows.
 */
export function protectData(plainText: string): string | null {
  if (process.platform !== 'win32' || !plainText) return null;
  try {
    const escaped = plainText.replace(/'/g, "''");
    const cmd = `powershell -NoProfile -NonInteractive -Command "$bytes = [System.Text.Encoding]::UTF8.GetBytes('${escaped}'); $p = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [System.Convert]::ToBase64String($p)"`;
    const out = execSync(cmd, { timeout: 4000, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    return out || null;
  } catch (_) {
    return null;
  }
}

/**
 * Unprotects a DPAPI-encrypted base64 string.
 * Returns decrypted plaintext, or null if decryption fails or non-Windows.
 */
export function unprotectData(cipherBase64: string): string | null {
  if (process.platform !== 'win32' || !cipherBase64) return null;
  try {
    const escaped = cipherBase64.trim().replace(/'/g, "''");
    const cmd = `powershell -NoProfile -NonInteractive -Command "$bytes = [System.Convert]::FromBase64String('${escaped}'); $plain = [System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser); [System.Text.Encoding]::UTF8.GetString($plain)"`;
    const out = execSync(cmd, { timeout: 4000, stdio: ['pipe', 'pipe', 'ignore'] }).toString().trim();
    return out || null;
  } catch (_) {
    return null;
  }
}
