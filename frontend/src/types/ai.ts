// ── Nexus AI Assistant — TypeScript Types ─────────────────────────────────────

export type AIMessageRole = "user" | "assistant" | "system";

export interface AIMessageImage {
	id: string;
	/** data URL (base64) for preview and sending to OpenRouter */
	dataUrl: string;
	/** original filename */
	name: string;
}

export interface AIMessage {
	id: string;
	role: AIMessageRole;
	content: string;
	images?: AIMessageImage[];
	timestamp: Date;
	isStreaming?: boolean;
	/** true if this message failed to send — shown with a Retry button instead of being removed */
	failed?: boolean;
}

export interface AIConversation {
	id: string;
	title: string;
	messages: AIMessage[];
	createdAt: Date;
	updatedAt: Date;
	context?: string; // optional department/module context
}

export type AIAssistantStatus = "idle" | "thinking" | "streaming" | "error";

// ── OpenRouter multimodal content blocks ──────────────────────────────────────
export interface OpenRouterTextBlock {
	type: "text";
	text: string;
}

export interface OpenRouterImageBlock {
	type: "image_url";
	image_url: { url: string };
}

export type OpenRouterContentBlock = OpenRouterTextBlock | OpenRouterImageBlock;

export interface OpenRouterMessage {
	role: "user" | "assistant" | "system";
	content: string | OpenRouterContentBlock[];
}

export interface OpenRouterResponse {
	id: string;
	choices: {
		message: { role: string; content: string };
		finish_reason: string;
	}[];
	usage?: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}

export interface AIStore {
	conversations: AIConversation[];
	activeConversationId: string | null;
	status: AIAssistantStatus;
	error: string | null;
	isOpen: boolean;
}

// ── Upload constraints ─────────────────────────────────────────────────────────
export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB per image
export const MAX_IMAGES_PER_MESSAGE = 4;
export const ACCEPTED_IMAGE_TYPES = [
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
];
