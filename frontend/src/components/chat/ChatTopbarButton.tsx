// ChatTopbarButton — Drop-in replacement for the Bell button area in AppLayout topbar
// Shows chat icon with unread count badge; clicking toggles ChatPanel
import { MessageSquare } from "lucide-react";
import { useChatStore } from "../../stores/chatStore";

export function ChatTopbarButton() {
	const { toggleChat, getTotalUnread } = useChatStore();
	const unread = getTotalUnread();

	return (
		<button
			onClick={toggleChat}
			className="relative btn-icon btn-secondary"
			title="Messages"
			aria-label={`Chat, ${unread} unread messages`}>
			<MessageSquare size={16} />
			{unread > 0 && (
				<span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-Swahilipot-600 text-white text-[10px] flex items-center justify-center font-bold animate-pulse">
					{unread > 9 ? "9+" : unread}
				</span>
			)}
		</button>
	);
}
