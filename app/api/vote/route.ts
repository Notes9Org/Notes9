import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET - Fetch votes for a chat session
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return NextResponse.json({ error: 'chatId is required' }, { status: 400 });
  }

  const { data: votes, error } = await supabase
    .from('message_votes')
    .select('chat_id, message_id, is_upvoted')
    .eq('chat_id', chatId)
    .eq('user_id', user.id);

  if (error) {
    console.error('Error fetching votes:', error);
    return NextResponse.json({ error: 'Failed to fetch votes' }, { status: 500 });
  }

  // Transform to match Vote interface
  const transformedVotes = votes.map((v) => ({
    chatId: v.chat_id,
    messageId: v.message_id,
    isUpvoted: v.is_upvoted,
  }));

  return NextResponse.json(transformedVotes);
}

// PATCH - Create or update a vote
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { chatId, messageId, type } = body;

  if (!chatId || !messageId || !type) {
    return NextResponse.json(
      { error: 'chatId, messageId, and type are required' },
      { status: 400 }
    );
  }

  if (type !== 'up' && type !== 'down') {
    return NextResponse.json(
      { error: 'type must be "up" or "down"' },
      { status: 400 }
    );
  }

  const isUpvoted = type === 'up';

  // Upsert the vote
  const { error } = await supabase
    .from('message_votes')
    .upsert(
      {
        chat_id: chatId,
        message_id: messageId,
        user_id: user.id,
        is_upvoted: isUpvoted,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'message_id,user_id',
      }
    );

  if (error) {
    console.error('Error saving vote:', error);
    return NextResponse.json({ error: 'Failed to save vote' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

