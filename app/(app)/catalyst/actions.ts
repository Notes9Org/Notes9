'use server';

import { createClient } from '@/lib/supabase/server';

/**
 * Delete all messages in a chat session that were created at or after
 * the specified message's timestamp (including the message itself).
 */
export async function deleteTrailingMessages({ id }: { id: string }) {
  const supabase = await createClient();
  
  // First, get the message to find its session and timestamp
  const { data: message, error: msgError } = await supabase
    .from('chat_messages')
    .select('id, session_id, created_at')
    .eq('id', id)
    .single();

  if (msgError || !message) {
    console.error('Failed to get message:', msgError);
    return { success: false, error: 'Message not found' };
  }

  // Delete all messages in the same session with created_at >= this message's created_at
  const { error: deleteError } = await supabase
    .from('chat_messages')
    .delete()
    .eq('session_id', message.session_id)
    .gte('created_at', message.created_at);

  if (deleteError) {
    console.error('Failed to delete trailing messages:', deleteError);
    return { success: false, error: 'Failed to delete messages' };
  }

  return { success: true };
}

/**
 * Delete a specific set of messages by their IDs
 */
export async function deleteMessagesByIds(ids: string[]) {
  if (ids.length === 0) return { success: true };

  const supabase = await createClient();

  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .in('id', ids);

  if (error) {
    console.error('Failed to delete messages:', error);
    return { success: false, error: 'Failed to delete messages' };
  }

  return { success: true };
}

