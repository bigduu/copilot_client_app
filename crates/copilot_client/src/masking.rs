use chat_core::keyword_masking::KeywordMaskingConfig;

/// Apply keyword masking to message content
pub fn apply_masking(text: &str, config: &KeywordMaskingConfig) -> String {
    config.apply_masking(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chat_core::keyword_masking::{KeywordEntry, MatchType};

    #[test]
    fn test_apply_masking() {
        let config = KeywordMaskingConfig {
            entries: vec![
                KeywordEntry {
                    pattern: "secret".to_string(),
                    match_type: MatchType::Exact,
                    enabled: true,
                },
            ],
        };
        
        let result = apply_masking("This is secret", &config);
        assert_eq!(result, "This is [MASKED]");
    }
}
