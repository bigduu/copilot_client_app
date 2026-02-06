use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use anyhow::{anyhow, Result};
use rand::Rng;

const KEY_ENV_VAR: &str = "BODHI_CONFIG_ENCRYPTION_KEY";

/// 获取或生成加密密钥
/// 优先从环境变量获取，否则生成随机密钥（仅内存中有效）
pub fn get_encryption_key() -> Vec<u8> {
    if let Ok(key_hex) = std::env::var(KEY_ENV_VAR) {
        if let Ok(key) = hex::decode(&key_hex) {
            if key.len() == 32 {
                return key;
            }
        }
    }
    // 生成随机密钥（仅当前进程有效）
    rand::thread_rng().gen::<[u8; 32]>().to_vec()
}

/// 加密数据
/// 返回: nonce(12字节) + ciphertext
pub fn encrypt(plaintext: &str) -> Result<String> {
    let key = get_encryption_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| anyhow!("Failed to create cipher: {e}"))?;
    
    let nonce_bytes: [u8; 12] = rand::thread_rng().gen();
    let nonce = Nonce::from_slice(&nonce_bytes);
    
    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| anyhow!("Encryption failed: {e}"))?;
    
    // 格式: hex(nonce) + ":" + hex(ciphertext)
    let result = format!("{}:{}", hex::encode(nonce_bytes), hex::encode(ciphertext));
    Ok(result)
}

/// 解密数据
pub fn decrypt(encrypted: &str) -> Result<String> {
    let parts: Vec<&str> = encrypted.split(':').collect();
    if parts.len() != 2 {
        return Err(anyhow!("Invalid encrypted format"));
    }
    
    let nonce_bytes = hex::decode(parts[0])
        .map_err(|e| anyhow!("Invalid nonce: {e}"))?;
    let ciphertext = hex::decode(parts[1])
        .map_err(|e| anyhow!("Invalid ciphertext: {e}"))?;
    
    let key = get_encryption_key();
    let cipher = Aes256Gcm::new_from_slice(&key)
        .map_err(|e| anyhow!("Failed to create cipher: {e}"))?;
    
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|e| anyhow!("Decryption failed: {e}"))?;
    
    String::from_utf8(plaintext)
        .map_err(|e| anyhow!("Invalid UTF-8: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt() {
        let plaintext = "my_secret_password";
        let encrypted = encrypt(plaintext).unwrap();
        let decrypted = decrypt(&encrypted).unwrap();
        assert_eq!(plaintext, decrypted);
    }
}