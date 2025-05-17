use serde::{Deserialize, Serialize};

use crate::copilot::Message;

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Response {
    pub choices: Vec<Choice>,
    pub id: String,
    pub usage: Usage,
    pub model: String,
    #[serde(rename = "prompt_filter_results")]
    pub prompt_filter_results: Option<Vec<PromptFilterResult>>,
    #[serde(rename = "system_fingerprint")]
    pub system_fingerprint: Option<String>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Choice {
    #[serde(rename = "finish_reason")]
    pub finish_reason: String,
    pub index: Option<i64>,
    #[serde(rename = "content_filter_results")]
    pub content_filter_results: Option<ContentFilterResults>,
    pub message: Message,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentFilterResults {
    pub hate: Hate,
    #[serde(rename = "self_harm")]
    pub self_harm: SelfHarm,
    pub sexual: Sexual,
    pub violence: Violence,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hate {
    pub filtered: bool,
    pub severity: String,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfHarm {
    pub filtered: bool,
    pub severity: String,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sexual {
    pub filtered: bool,
    pub severity: String,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Violence {
    pub filtered: bool,
    pub severity: String,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    #[serde(rename = "completion_tokens")]
    pub completion_tokens: Option<i64>,
    #[serde(rename = "completion_tokens_details")]
    pub completion_tokens_details: Option<CompletionTokensDetails>,
    #[serde(rename = "prompt_tokens")]
    pub prompt_tokens: Option<i64>,
    #[serde(rename = "prompt_tokens_details")]
    pub prompt_tokens_details: Option<PromptTokensDetails>,
    #[serde(rename = "total_tokens")]
    pub total_tokens: Option<i64>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompletionTokensDetails {
    #[serde(rename = "accepted_prediction_tokens")]
    pub accepted_prediction_tokens: Option<i64>,
    #[serde(rename = "rejected_prediction_tokens")]
    pub rejected_prediction_tokens: Option<i64>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptTokensDetails {
    #[serde(rename = "cached_tokens")]
    pub cached_tokens: Option<i64>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PromptFilterResult {
    #[serde(rename = "content_filter_results")]
    pub content_filter_results: Option<ContentFilterResults2>,
    #[serde(rename = "prompt_index")]
    pub prompt_index: Option<i64>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContentFilterResults2 {
    pub hate: Option<Hate2>,
    #[serde(rename = "self_harm")]
    pub self_harm: Option<SelfHarm2>,
    pub sexual: Option<Sexual2>,
    pub violence: Option<Violence2>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Hate2 {
    pub filtered: Option<bool>,
    pub severity: Option<String>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelfHarm2 {
    pub filtered: Option<bool>,
    pub severity: Option<String>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Sexual2 {
    pub filtered: Option<bool>,
    pub severity: Option<String>,
}

#[derive(Default, Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Violence2 {
    pub filtered: Option<bool>,
    pub severity: Option<String>,
}
