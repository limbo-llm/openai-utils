import type * as limbo from "@limbo/api";
import type {
	OpenAICompatibleAssistantMessage,
	OpenAICompatibleContentPart,
	OpenAICompatibleMessage,
	OpenAICompatibleMessageToolCall,
	OpenAICompatibleSystemMessage,
	OpenAICompatibleTool,
	OpenAICompatibleToolMessage,
	OpenAICompatibleUserMessage,
} from "./types";

/**
 * Converts a limbo tool ID to an OpenAI-compatible tool ID.
 *
 * Limbo tool IDs often contain slashes, which are not compatible with OpenAI-compatible APIs.
 */
export function convertToolIdToOpenAICompatible(toolId: string) {
	return toolId.replace("/", "_");
}

export function convertSystemChatPromptMessageToOpenAICompatible(
	message: limbo.ChatMessage
): OpenAICompatibleSystemMessage {
	let gatheredText = "";

	for (const node of message.getNodes()) {
		if (node.type !== "text") {
			throw new Error("OpenAI-compatible system messages must only contain text nodes");
		}

		gatheredText += node.data.content;
	}

	return {
		role: "system",
		content: gatheredText,
	};
}

export function convertAssistantChatPromptMessageToOpenAICompatible(
	message: limbo.ChatMessage
): (OpenAICompatibleAssistantMessage | OpenAICompatibleToolMessage)[] {
	let assistantMessageTextContent = "";

	const toolCalls: OpenAICompatibleMessageToolCall[] = [];
	const toolCallResults: OpenAICompatibleToolMessage[] = [];

	for (const node of message.getNodes()) {
		if (node.type === "text") {
			assistantMessageTextContent += node.data.content;
		} else if (node.type === "tool_call") {
			const toolCall = node.data as any;

			toolCalls.push({
				type: "function",
				id: toolCall.id,
				function: {
					name: convertToolIdToOpenAICompatible(toolCall.toolId),
					arguments: JSON.stringify(toolCall.arguments),
				},
			});

			let resultContent: string;

			if (toolCall.status === "success") {
				resultContent = toolCall.result;
			} else {
				// ? should this be prefixed with "Error:"
				// ? should the error from limbo always be a string?
				resultContent = toolCall.error ?? "An unknown error occurred";
			}

			toolCallResults.push({
				role: "tool",
				tool_call_id: toolCall.id,
				content: resultContent,
			});
		} else {
			throw new Error(
				"OpenAI-compatible assistant messages must only contain text or tool call nodes"
			);
		}
	}

	const messages: (OpenAICompatibleAssistantMessage | OpenAICompatibleToolMessage)[] = [];

	// add the assistant message
	messages.push({
		role: "assistant",
		content: assistantMessageTextContent || null,
		tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
	});

	// add the tool call result messages
	for (const toolCallResult of toolCallResults) {
		messages.push(toolCallResult);
	}

	return messages;
}

export function convertUserChatPromptMessageToOpenAICompatible(
	message: limbo.ChatMessage
): OpenAICompatibleUserMessage {
	const openAIMessageContentParts: OpenAICompatibleContentPart[] = [];

	for (const node of message.getNodes()) {
		if (node.type === "text") {
			openAIMessageContentParts.push({
				type: "text",
				text: node.data.content as string,
			});
		} else if (node.type === "image") {
			openAIMessageContentParts.push({
				type: "image_url",
				image_url: {
					url: node.data.url as string,
				},
			});
		}
	}

	return {
		role: "user",
		content: openAIMessageContentParts,
	};
}

export function convertMessagesToOpenAICompatible(
	messages: limbo.ChatMessage[]
): OpenAICompatibleMessage[] {
	const openAIMessages: OpenAICompatibleMessage[] = [];

	for (const message of messages) {
		const role = message.getRole();

		if (role === "system") {
			openAIMessages.push(convertSystemChatPromptMessageToOpenAICompatible(message));
		} else if (role === "assistant") {
			openAIMessages.push(...convertAssistantChatPromptMessageToOpenAICompatible(message));
		} else if (role === "user") {
			openAIMessages.push(convertUserChatPromptMessageToOpenAICompatible(message));
		} else {
			throw new Error(`message role is not OpenAI-compatible: ${role}`);
		}
	}

	return openAIMessages;
}

// NOTE: Consider automatically adding "additionalProperties: false" to the schema
export function convertToolsToOpenAICompatible(
	tools: limbo.ToolDefinition[]
): OpenAICompatibleTool[] {
	return tools.map((tool) => {
		const toolId = convertToolIdToOpenAICompatible(tool.id);

		return {
			type: "function",
			function: {
				name: toolId,
				description: tool.description,
				parameters: tool.schema,
			},
		};
	});
}
