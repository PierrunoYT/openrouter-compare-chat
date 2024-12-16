// OpenRouter API Response Types

export type ResponseUsage = {
    /** Including images and tools if any */
    prompt_tokens: number;
    /** The tokens generated */
    completion_tokens: number;
    /** Sum of the above two fields */
    total_tokens: number;
};

export type FunctionCall = {
    name: string;
    arguments: string; // JSON format arguments
};

export type ToolCall = {
    id: string;
    type: 'function';
    function: FunctionCall;
};

// Enhanced Error Types
export type ErrorResponse = {
    error: {
        code: number;
        message: string;
        metadata?: Record<string, unknown>;
    };
};

export type ModerationErrorMetadata = {
    reasons: string[]; // Why your input was flagged
    flagged_input: string; // The text segment that was flagged, limited to 100 characters
};

export type Error = {
    code: number;
    message: string;
};

// API Key Information Types
export type Key = {
    data: {
        label: string;
        usage: number; // Number of credits used
        limit: number | null; // Credit limit for the key, or null if unlimited
        is_free_tier: boolean; // Whether the user has paid for credits before
        rate_limit: {
            requests: number; // Number of requests allowed
            interval: string; // in this interval, e.g. "10s"
        };
    };
};

export type NonChatChoice = {
    finish_reason: string | null;
    text: string;
    error?: Error;
};

export type NonStreamingChoice = {
    finish_reason: string | null;
    message: {
        content: string | null;
        role: string;
        tool_calls?: ToolCall[];
        function_call?: FunctionCall; // Deprecated, replaced by tool_calls
    };
    error?: Error;
};

export type StreamingChoice = {
    finish_reason: string | null;
    delta: {
        content: string | null;
        role?: string;
        tool_calls?: ToolCall[];
        function_call?: FunctionCall; // Deprecated, replaced by tool_calls
    };
    error?: Error;
};

export type OpenRouterResponse = {
    id: string;
    choices: (NonStreamingChoice | StreamingChoice | NonChatChoice)[];
    created: number; // Unix timestamp
    model: string;
    object: 'chat.completion' | 'chat.completion.chunk';
    system_fingerprint?: string;
    usage?: ResponseUsage;
};

// Additional types for our chat application
export type Message = {
    role: 'user' | 'assistant' | 'system';
    content: string | MessageContent[];
};

export type MessageContent = {
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
        url: string;
    };
    cache_control?: CacheControl; // Added for Anthropic caching
};

export type Model = {
    id: string;
    name?: string;
    context_length?: number;
};

// Cache Control Types for Anthropic
export type CacheControl = {
    type: 'ephemeral';
};

// Generation Stats Response Type
export type GenerationStats = {
    data: {
        id: string;
        model: string;
        streamed: boolean;
        generation_time: number;
        created_at: string;
        tokens_prompt: number;
        tokens_completion: number;
        native_tokens_prompt: number;
        native_tokens_completion: number;
        num_media_prompt: number | null;
        num_media_completion: number | null;
        origin: string;
        total_cost: number;
        cache_discount: number | null;
    };
};

// AI Model Parameters
export type ModelParameters = {
    /** Influences response variety (0.0 to 2.0, default: 1.0) */
    temperature?: number;
    /** Limits token choices by cumulative probability (0.0 to 1.0, default: 1.0) */
    top_p?: number;
    /** Limits token choices to top K (0 or above, default: 0) */
    top_k?: number;
    /** Controls repetition based on frequency (-2.0 to 2.0, default: 0.0) */
    frequency_penalty?: number;
    /** Controls repetition based on presence (-2.0 to 2.0, default: 0.0) */
    presence_penalty?: number;
    /** Reduces repetition of tokens (0.0 to 2.0, default: 1.0) */
    repetition_penalty?: number;
    /** Minimum probability relative to most likely token (0.0 to 1.0, default: 0.0) */
    min_p?: number;
    /** Dynamic token filtering based on highest probability (0.0 to 1.0, default: 0.0) */
    top_a?: number;
    /** For deterministic responses */
    seed?: number;
    /** Maximum tokens to generate */
    max_tokens?: number;
    /** Token biases (-100 to 100) */
    logit_bias?: { [key: string]: number };
    /** Return log probabilities of output tokens */
    logprobs?: boolean;
    /** Number of most likely tokens to return (0-20) */
    top_logprobs?: number;
    /** Response format configuration */
    response_format?: { type: 'json_object' };
    /** Stop sequences */
    stop?: string[];
};