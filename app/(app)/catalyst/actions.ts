'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth/current-user';

export async function deleteTrailingMessages({ id }: { id: string }) {
  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }
  const supabase = await createClient();

  const { data: message, error: msgError } = await supabase
    .from('chat_messages')
    .select('id, session_id, created_at, chat_sessions!inner(user_id)')
    .eq('id', id)
    .eq('chat_sessions.user_id', user.id)
    .single();

  if (msgError || !message) {
    return { success: false, error: 'Message not found' };
  }

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

export async function deleteMessagesByIds(ids: string[]) {
  if (ids.length === 0) return { success: true };

  const user = await getCurrentUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }
  const supabase = await createClient();

  const { data: owned, error: ownedError } = await supabase
    .from('chat_messages')
    .select('id, chat_sessions!inner(user_id)')
    .in('id', ids)
    .eq('chat_sessions.user_id', user.id);

  if (ownedError) {
    console.error('Failed to verify message ownership:', ownedError);
    return { success: false, error: 'Failed to delete messages' };
  }

  const ownedIds = (owned ?? []).map((m: { id: string }) => m.id);
  if (ownedIds.length === 0) {
    return { success: false, error: 'No messages found' };
  }

  const { error } = await supabase
    .from('chat_messages')
    .delete()
    .in('id', ownedIds);

  if (error) {
    console.error('Failed to delete messages:', error);
    return { success: false, error: 'Failed to delete messages' };
  }

  return { success: true };
}
