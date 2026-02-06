
import { createClient } from "@/lib/supabase/server";
import { ChatMessage } from "@/lib/redis";

export async function saveChatMessage(sessionId: string, role: string, content: string) {
    const supabase = await createClient();
    const { error } = await supabase.from('chat_messages').insert({
        session_id: sessionId,
        role,
        content,
    });

    if (error) {
        console.error('Error saving chat message:', error);
        throw error;
    }
}

export async function getChatHistory(sessionId: string, limit = 10): Promise<ChatMessage[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching chat history:', error);
        return [];
    }

    // Reverse to get chronological order for the LLM
    return (data || []).reverse().map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content
    }));
}
