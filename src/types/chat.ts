export interface Message {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface ChatItem {
    id: string;
    title: string;
    messages: Message[];
    createdAt: number;
    systemPrompt?: string; // Optional for backward compatibility
    pinned?: boolean;
    model?: string; // Optional model selection for the chat
}

export interface ChatCompletionResponse {
    choices: Choice[];
    created?: number;
    id?: string;
    usage?: Usage;
    model?: string;
    system_fingerprint?: string;
}

export interface Choice {
    finish_reason: string;
    index?: number;
    content_filter_offsets?: ContentFilterOffsets;
    content_filter_results?: ContentFilterResults;
    delta?: Delta;
    message?: Message;
}

export interface ContentFilterOffsets {
    check_offset: number;
    start_offset: number;
    end_offset: number;
}

export interface Delta {
    content?: any;
    annotations: Annotations;
    copilot_annotations: Annotations;
}

export interface Annotations {
    CodeVulnerability: CodeVulnerability[];
}

export interface CodeVulnerability {
    id: number;
    start_offset: number;
    end_offset: number;
    details: Details;
    citations: Citations;
}

export interface Citations {
    // Empty in Rust
}

export interface Details {
    type: string;
}

export interface ContentFilterResults {
    error: Error;
    hate: FilterResult;
    self_harm: FilterResult;
    sexual: FilterResult;
    violence: FilterResult;
}

export interface Error {
    code: string;
    message: string;
}

export interface FilterResult {
    filtered: boolean;
    severity: string;
}

export interface Usage {
    completion_tokens: number;
    prompt_tokens: number;
    total_tokens: number;
}

export interface SystemPromptPreset {
    id: string; // uuid
    name: string;
    content: string;
}

export type SystemPromptPresetList = SystemPromptPreset[];
