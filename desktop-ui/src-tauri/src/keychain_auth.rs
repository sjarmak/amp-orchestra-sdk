use keyring::{Entry, Error as KeyringError};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::hash::Hash;

/// Token types that can be stored in the keychain
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum TokenType {
    RefreshToken,
    AccessToken,
    ApiKey,
}

impl std::fmt::Display for TokenType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            TokenType::RefreshToken => write!(f, "refresh_token"),
            TokenType::AccessToken => write!(f, "access_token"),
            TokenType::ApiKey => write!(f, "api_key"),
        }
    }
}

impl std::str::FromStr for TokenType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "refresh_token" => Ok(TokenType::RefreshToken),
            "access_token" => Ok(TokenType::AccessToken),
            "api_key" => Ok(TokenType::ApiKey),
            _ => Err(format!("Unknown token type: {}", s)),
        }
    }
}

/// Keychain operations for storing authentication tokens
pub struct KeychainAuth {
    service_name: String,
}

impl KeychainAuth {
    /// Create a new keychain auth manager
    pub fn new() -> Self {
        Self {
            service_name: "amp-orchestra".to_string(),
        }
    }

    /// Generate account identifier for keychain entry
    fn account_for_token(&self, profile_id: &str, token_type: &TokenType) -> String {
        format!("{}-{}", profile_id, token_type)
    }

    /// Store a token in the keychain
    pub fn store_token(&self, profile_id: &str, token_type: TokenType, token: &str) -> Result<(), String> {
        let account = self.account_for_token(profile_id, &token_type);
        let entry = Entry::new(&self.service_name, &account)
            .map_err(|e| format!("Failed to create keychain entry: {}", e))?;
        
        entry.set_password(token)
            .map_err(|e| format!("Failed to store token in keychain: {}", e))?;
        
        log::debug!("Stored {} for profile {}", token_type, profile_id);
        Ok(())
    }

    /// Retrieve a token from the keychain
    pub fn get_token(&self, profile_id: &str, token_type: &TokenType) -> Result<String, String> {
        let account = self.account_for_token(profile_id, token_type);
        let entry = Entry::new(&self.service_name, &account)
            .map_err(|e| format!("Failed to create keychain entry: {}", e))?;
        
        match entry.get_password() {
            Ok(token) => {
                log::debug!("Retrieved {} for profile {}", token_type, profile_id);
                Ok(token)
            }
            Err(KeyringError::NoEntry) => {
                Err(format!("No {} found for profile {}", token_type, profile_id))
            }
            Err(e) => {
                Err(format!("Failed to retrieve token from keychain: {}", e))
            }
        }
    }

    /// Delete a token from the keychain
    pub fn delete_token(&self, profile_id: &str, token_type: &TokenType) -> Result<(), String> {
        let account = self.account_for_token(profile_id, token_type);
        let entry = Entry::new(&self.service_name, &account)
            .map_err(|e| format!("Failed to create keychain entry: {}", e))?;
        
        match entry.delete_credential() {
            Ok(()) => {
                log::debug!("Deleted {} for profile {}", token_type, profile_id);
                Ok(())
            }
            Err(KeyringError::NoEntry) => {
                // Token doesn't exist, which is fine for deletion
                log::debug!("No {} to delete for profile {}", token_type, profile_id);
                Ok(())
            }
            Err(e) => {
                Err(format!("Failed to delete token from keychain: {}", e))
            }
        }
    }

    /// List all token types available for a profile
    pub fn list_profile_tokens(&self, profile_id: &str) -> Result<Vec<TokenType>, String> {
        let token_types = [TokenType::RefreshToken, TokenType::AccessToken, TokenType::ApiKey];
        let mut available_tokens = Vec::new();

        for token_type in &token_types {
            match self.get_token(profile_id, token_type) {
                Ok(_) => available_tokens.push(token_type.clone()),
                Err(_) => {
                    // Token not found, skip
                }
            }
        }

        Ok(available_tokens)
    }

    /// Check if a profile has any stored tokens
    pub fn has_profile_tokens(&self, profile_id: &str) -> bool {
        match self.list_profile_tokens(profile_id) {
            Ok(tokens) => !tokens.is_empty(),
            Err(_) => false,
        }
    }

    /// Clear all tokens for a profile
    pub fn clear_profile_tokens(&self, profile_id: &str) -> Result<(), String> {
        let token_types = [TokenType::RefreshToken, TokenType::AccessToken, TokenType::ApiKey];
        let mut errors = Vec::new();

        for token_type in &token_types {
            if let Err(e) = self.delete_token(profile_id, token_type) {
                // Only log errors, don't fail the whole operation
                log::warn!("Error deleting {}: {}", token_type, e);
                errors.push(e);
            }
        }

        if errors.is_empty() {
            log::debug!("Cleared all tokens for profile {}", profile_id);
            Ok(())
        } else {
            // Return first error but log all of them
            Err(errors.into_iter().next().unwrap())
        }
    }

    /// Get all stored tokens for a profile as a map
    pub fn get_all_tokens(&self, profile_id: &str) -> Result<HashMap<TokenType, String>, String> {
        let token_types = self.list_profile_tokens(profile_id)?;
        let mut tokens = HashMap::new();

        for token_type in token_types {
            match self.get_token(profile_id, &token_type) {
                Ok(token) => {
                    tokens.insert(token_type, token);
                }
                Err(e) => {
                    log::warn!("Failed to get {} for profile {}: {}", token_type, profile_id, e);
                }
            }
        }

        Ok(tokens)
    }
}

impl Default for KeychainAuth {
    fn default() -> Self {
        Self::new()
    }
}

// Tauri commands for keychain operations
#[tauri::command]
pub async fn store_profile_token(
    profile_id: String,
    token_type: String,
    token: String,
) -> Result<(), String> {
    let keychain = KeychainAuth::new();
    let token_type: TokenType = token_type.parse()?;
    keychain.store_token(&profile_id, token_type, &token)
}

#[tauri::command]
pub async fn get_profile_token(
    profile_id: String,
    token_type: String,
) -> Result<String, String> {
    let keychain = KeychainAuth::new();
    let token_type: TokenType = token_type.parse()?;
    keychain.get_token(&profile_id, &token_type)
}

#[tauri::command]
pub async fn delete_profile_token(
    profile_id: String,
    token_type: String,
) -> Result<(), String> {
    let keychain = KeychainAuth::new();
    let token_type: TokenType = token_type.parse()?;
    keychain.delete_token(&profile_id, &token_type)
}

#[tauri::command]
pub async fn clear_profile_tokens(
    profile_id: String,
) -> Result<(), String> {
    let keychain = KeychainAuth::new();
    keychain.clear_profile_tokens(&profile_id)
}

#[tauri::command]
pub async fn has_profile_tokens(
    profile_id: String,
) -> Result<bool, String> {
    let keychain = KeychainAuth::new();
    Ok(keychain.has_profile_tokens(&profile_id))
}

#[tauri::command]
pub async fn list_profile_tokens(
    profile_id: String,
) -> Result<Vec<String>, String> {
    let keychain = KeychainAuth::new();
    let token_types = keychain.list_profile_tokens(&profile_id)?;
    Ok(token_types.into_iter().map(|t| t.to_string()).collect())
}

#[tauri::command]
pub async fn get_all_profile_tokens(
    profile_id: String,
) -> Result<HashMap<String, String>, String> {
    let keychain = KeychainAuth::new();
    let tokens = keychain.get_all_tokens(&profile_id)?;
    Ok(tokens.into_iter().map(|(k, v)| (k.to_string(), v)).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_token_type_serialization() {
        assert_eq!(TokenType::RefreshToken.to_string(), "refresh_token");
        assert_eq!(TokenType::AccessToken.to_string(), "access_token");
        assert_eq!(TokenType::ApiKey.to_string(), "api_key");
    }
    
    #[test]
    fn test_token_type_parsing() {
        assert_eq!("refresh_token".parse::<TokenType>().unwrap(), TokenType::RefreshToken);
        assert_eq!("access_token".parse::<TokenType>().unwrap(), TokenType::AccessToken);
        assert_eq!("api_key".parse::<TokenType>().unwrap(), TokenType::ApiKey);
        
        assert!("invalid".parse::<TokenType>().is_err());
    }
    
    #[test]
    fn test_account_generation() {
        let keychain = KeychainAuth::new();
        let account = keychain.account_for_token("profile-123", &TokenType::RefreshToken);
        assert_eq!(account, "profile-123-refresh_token");
    }
}
