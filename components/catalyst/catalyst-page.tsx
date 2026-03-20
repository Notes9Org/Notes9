'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRouter } from 'next/navigation';
import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatSessions } from '@/hooks/use-chat-sessions';
import { createClient } from '@/lib/supabase/client';
import { deleteTrailingMessages } from '@/app/(app)/catalyst/actions';
import { toast } from 'sonner';
import { CatalystGreeting } from './catalyst-greeting';
import { CatalystMessages } from './catalyst-messages';
import { CatalystInput, type AgentMode } from './catalyst-input';
import type { Attachment } from './preview-attachment';
import { CatalystSidebar } from './catalyst-sidebar';
import type { Vote } from '@/lib/db/schema';
import { formatCitationDisplay } from '@/lib/utils';
import { useAgentStream } from '@/hooks/use-agent-stream';

interface CatalystChatProps {
  sessionId?: string;
}

export function CatalystChat({ sessionId }: CatalystChatProps) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [userName, setUserName] = useState<string>('');
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [agentMode, setAgentMode] = useState<AgentMode>('general');
  const [userId, setUserId] = useState<string>('');
  const [notes9Loading, setNotes9Loading] = useState(false);

  const prevStatusRef = useRef<string>('ready');
  const currentSessionRef = useRef<string | null>(sessionId || null);
  const hasLoadedSessionRef = useRef<string | null>(null);
  const supabaseTokenRef = useRef<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      supabaseTokenRef.current = session?.access_token ?? null;
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      supabaseTokenRef.current = session?.access_token ?? null;
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  const {
    sessions,
    currentSessionId,
    setCurrentSessionId,
    loading: sessionsLoading,
    createSession,
    updateSessionTitle,
    deleteSession,
    loadMessages,
    saveMessage,
    loadSessions,
  } = useChatSessions();

  // Create transport with prepareSendMessagesRequest to include sessionId and Authorization header
  const transport = useMemo(() => new DefaultChatTransport({
    api: '/api/chat',
    prepareSendMessagesRequest(request) {
      const token = supabaseTokenRef.current;
      return {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: {
          messages: request.messages,
          sessionId: currentSessionRef.current,
          supabaseToken: token ?? undefined,
          ...request.body,
        },
      };
    },
  }), []);

  const { messages, sendMessage, status, stop, setMessages, regenerate } = useChat({
    id: `catalyst-${sessionId || 'new'}`,
    transport,
    // Throttle UI updates during streaming - updates every 100ms
    // Without this, React batches updates and shows everything at once!
    experimental_throttle: 100,
  });

  const agentStream = useAgentStream();
  const isLoading = status === 'streaming' || status === 'submitted' || notes9Loading;

  // Load user profile
  useEffect(() => {
    const loadUserProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single();
        if (data?.full_name) {
          setUserName(data.full_name.split(' ')[0] || 'there');
        }
      }
    };
    loadUserProfile();
  }, [supabase]);

  // Set session from URL param
  useEffect(() => {
    if (sessionId && sessionId !== currentSessionId) {
      setCurrentSessionId(sessionId);
      currentSessionRef.current = sessionId;
    }
  }, [sessionId, currentSessionId, setCurrentSessionId]);

  // Load messages when session is set
  const loadSessionMessages = useCallback(
    async (sid: string) => {
      if (hasLoadedSessionRef.current === sid) return;

      const msgs = await loadMessages(sid);
      if (msgs.length > 0) {
        const chatMessages = msgs.map((m) => ({
          id: m.id,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          parts: [{ type: 'text' as const, text: m.content }],
          createdAt: new Date(m.created_at),
        }));
        setMessages(chatMessages);
        setSavedMessageIds(new Set(msgs.map((m) => m.id)));
      } else {
        setMessages([]);
        setSavedMessageIds(new Set());
      }
      hasLoadedSessionRef.current = sid;
      currentSessionRef.current = sid;
    },
    [loadMessages, setMessages]
  );

  // Load session messages when currentSessionId changes
  useEffect(() => {
    if (currentSessionId && currentSessionId !== hasLoadedSessionRef.current) {
      loadSessionMessages(currentSessionId);
    }
  }, [currentSessionId, loadSessionMessages]);

  // Load votes for current session
  useEffect(() => {
    const loadVotes = async () => {
      if (!currentSessionId) {
        setVotes([]);
        return;
      }

      try {
        const response = await fetch(`/api/vote?chatId=${currentSessionId}`);
        if (response.ok) {
          const data = await response.json();
          setVotes(data);
        }
      } catch (error) {
        console.error('Failed to load votes:', error);
      }
    };

    loadVotes();
  }, [currentSessionId]);

  // Save messages when streaming completes
  useEffect(() => {
    const saveNewMessages = async () => {
      const sid = currentSessionRef.current;

      if (
        prevStatusRef.current !== 'ready' &&
        status === 'ready' &&
        sid &&
        messages.length > 0
      ) {
        const newSavedIds = new Set(savedMessageIds);

        for (const message of messages) {
          if (!newSavedIds.has(message.id)) {
            const content =
              message.parts
                ?.filter((p) => p.type === 'text')
                .map((p) => ('text' in p ? p.text : ''))
                .join('') || '';

            if (content) {
              await saveMessage(
                sid,
                message.role as 'user' | 'assistant',
                content
              );
              newSavedIds.add(message.id);
            }
          }
        }

        setSavedMessageIds(newSavedIds);

        // Update title if first exchange
        if (messages.length <= 2) {
          const firstUserMessage = messages.find((m) => m.role === 'user');
          if (firstUserMessage) {
            const title =
              firstUserMessage.parts
                ?.filter((p) => p.type === 'text')
                .map((p) => ('text' in p ? p.text : ''))
                .join('')
                .slice(0, 50) || 'New conversation';
            await updateSessionTitle(sid, title);
          }
        }

        loadSessions();
      }
      prevStatusRef.current = status;
    };
    saveNewMessages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const handleNewChat = useCallback(async () => {
    if (isLoading) {
      toast.error('Wait for the current response to finish before switching chats.');
      return;
    }
    setMessages([]);
    setSavedMessageIds(new Set());
    currentSessionRef.current = null;
    hasLoadedSessionRef.current = null;

    const newSessionId = await createSession();
    if (newSessionId) {
      currentSessionRef.current = newSessionId;
      hasLoadedSessionRef.current = newSessionId;
      router.push(`/catalyst/${newSessionId}`);
    }
  }, [createSession, isLoading, setMessages, router]);

  const handleSelectSession = useCallback(
    (sid: string) => {
      if (isLoading) {
        toast.error('Wait for the current response to finish before switching chats.');
        return;
      }
      setMessages([]);
      setSavedMessageIds(new Set());
      hasLoadedSessionRef.current = null;
      setCurrentSessionId(sid);
      router.push(`/catalyst/${sid}`);
    },
    [isLoading, setCurrentSessionId, setMessages, router]
  );

  const handleDeleteSession = useCallback(
    async (sid: string) => {
      await deleteSession(sid);
      if (currentSessionRef.current === sid) {
        setMessages([]);
        setSavedMessageIds(new Set());
        currentSessionRef.current = null;
        hasLoadedSessionRef.current = null;
        router.push('/catalyst');
      }
    },
    [deleteSession, setMessages, router]
  );

  const onSubmit = async (text: string, attachments?: Attachment[]) => {
    if ((!text.trim() && (!attachments || attachments.length === 0)) || isLoading) return;

    let sid = currentSessionRef.current;
    if (!sid) {
      sid = await createSession();
      if (!sid) return;
      currentSessionRef.current = sid;
      hasLoadedSessionRef.current = sid;
      router.push(`/catalyst/${sid}`);
    }

    // Handle Notes9 mode
    if (agentMode === 'notes9') {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        toast.error('Please sign in to use Notes9');
        router.push('/auth/login');
        return;
      }

      // Add user message to UI immediately
      const userMessageId = `user-${Date.now()}`;
      const userMessage = {
        id: userMessageId,
        role: 'user' as const,
        content: text,
        parts: [{ type: 'text' as const, text }],
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, userMessage]);

      // Save user message to DB
      await saveMessage(sid, 'user', text);

      const history = messages.map((m) => ({
        role: m.role,
        content: getMessageContent(m),
      }));

      setNotes9Loading(true);
      const { donePayload, error } = await agentStream.runStream(
        {
          query: text,
          session_id: sid,
          history,
        },
        token
      );
      setNotes9Loading(false);

      if (donePayload) {
        let formattedAnswer = donePayload.answer;
        if (donePayload.citations && donePayload.citations.length > 0) {
          formattedAnswer += '\n\n**References:**\n';
          donePayload.citations.forEach((citation, index) => {
            const sourceType = citation.source_type;
            let route = '';
            switch (sourceType) {
              case 'literature_review':
                route = `/literature-reviews/${citation.source_id}`;
                break;
              case 'protocol':
                route = `/protocols/${citation.source_id}`;
                break;
              case 'project':
                route = `/projects/${citation.source_id}`;
                break;
              case 'lab_note':
              case 'report':
              default:
                route = '';
            }
            const displayText = formatCitationDisplay({
              ...citation,
              excerpt: citation.excerpt ?? undefined,
            });
            const sourceLabel = sourceType.replace('_', ' ');
            if (route) {
              formattedAnswer += `\n[${index + 1}] [View ${sourceLabel}](${route}): ${displayText}`;
            } else {
              formattedAnswer += `\n[${index + 1}] ${sourceLabel}: ${displayText}`;
            }
          });
        }

        const assistantMessageId = `assistant-${Date.now()}`;
        const assistantMessage = {
          id: assistantMessageId,
          role: 'assistant' as const,
          content: formattedAnswer,
          parts: [{ type: 'text' as const, text: formattedAnswer }],
          createdAt: new Date(),
        };
        setMessages((prev) => [...prev, assistantMessage]);

        await saveMessage(sid, 'assistant', formattedAnswer);

        if (messages.length === 0) {
          await updateSessionTitle(sid, text.slice(0, 50) || 'New conversation');
        }

        loadSessions();
        agentStream.reset();
      } else if (error) {
        toast.error(error);
      }
      return;
    }

    // Build message parts for General mode
    const parts: Array<{ type: 'text'; text: string } | { type: 'file'; url: string; name: string; mediaType: string }> = [];

    // Add file attachments first
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        parts.push({
          type: 'file',
          url: attachment.url,
          name: attachment.name,
          mediaType: attachment.contentType,
        });
      }
    }

    // Add text
    if (text.trim()) {
      parts.push({ type: 'text', text });
    }

    await sendMessage({ parts });
  };

  const getMessageContent = (message: (typeof messages)[0]): string => {
    if (message.parts && message.parts.length > 0) {
      return message.parts
        .filter((p) => p.type === 'text')
        .map((p) => ('text' in p ? p.text : ''))
        .join('');
    }
    return 'content' in message ? String(message.content) : '';
  };

  // Handle editing a message (deletes trailing messages and regenerates)
  // Following exact Vercel Chat SDK pattern:
  // 1. Delete trailing messages from DB (at and after this message's timestamp)
  // 2. Update UI to keep messages up to the edited one (with new content)
  // 3. Call regenerate() to re-send the last user message
  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

      // Only delete from DB if this message was saved (has a valid UUID from DB)
      if (savedMessageIds.has(messageId)) {
        // Step 1: Delete trailing messages from DB (this message and all after it)
        await deleteTrailingMessages({ id: messageId });

        // Remove deleted IDs from savedMessageIds
        const newSavedIds = new Set<string>();
        for (let i = 0; i < messageIndex; i++) {
          const msg = messages[i];
          if (savedMessageIds.has(msg.id)) {
            newSavedIds.add(msg.id);
          }
        }
        setSavedMessageIds(newSavedIds);
      }

      // Step 2: Update UI - keep messages before this one, add edited message
      setMessages((currentMessages) => {
        const index = currentMessages.findIndex((m) => m.id === messageId);
        if (index !== -1) {
          const updatedMessage = {
            ...currentMessages[index],
            parts: [{ type: 'text' as const, text: newContent }],
          };
          return [...currentMessages.slice(0, index), updatedMessage];
        }
        return currentMessages;
      });

      // Step 3: Regenerate - re-send the last user message to get new AI response
      regenerate();
    },
    [messages, savedMessageIds, setMessages, regenerate]
  );

  // Handle regenerating the last response
  // Following Vercel Chat SDK pattern - just calls regenerate()
  const handleRegenerate = useCallback(async () => {
    if (messages.length < 2) return;

    // Find the last assistant message to delete from DB
    const lastAssistantIndex = messages.findLastIndex((m) => m.role === 'assistant');
    if (lastAssistantIndex === -1) return;

    const lastAssistantMessage = messages[lastAssistantIndex];

    // Delete from DB if it was saved
    if (savedMessageIds.has(lastAssistantMessage.id)) {
      await deleteTrailingMessages({ id: lastAssistantMessage.id });

      // Update savedMessageIds - remove the assistant message
      const newSavedIds = new Set(savedMessageIds);
      newSavedIds.delete(lastAssistantMessage.id);
      setSavedMessageIds(newSavedIds);
    }

    // Call regenerate - this removes the last assistant response and re-sends the user message
    regenerate();
  }, [messages, savedMessageIds, regenerate]);

  return (
    <div className="flex h-full">
      {/* Chat History Sidebar */}
      <CatalystSidebar
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        loading={sessionsLoading}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        hasMessages={messages.length > 0}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with toggle */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeft className="size-4" />
            )}
          </Button>
          <span className="text-sm font-medium text-muted-foreground">
            Catalyst AI
          </span>
        </div>

        {/* Messages or Greeting */}
        <div className="flex-1 overflow-hidden">
          {messages.length === 0 ? (
            <CatalystGreeting userName={userName} />
          ) : (
            <CatalystMessages
              messages={messages}
              getMessageContent={getMessageContent}
              isLoading={isLoading}
              sessionId={currentSessionRef.current}
              votes={votes}
              onEditMessage={handleEditMessage}
              onRegenerate={handleRegenerate}
              notes9Stream={
                agentMode === 'notes9' &&
                (notes9Loading || agentStream.isStreaming || agentStream.error) &&
                messages.at(-1)?.role === 'user'
                  ? {
                      thinkingSteps: agentStream.thinkingSteps,
                      sql: agentStream.sql,
                      ragChunks: agentStream.ragChunks,
                      streamedAnswer: agentStream.streamedAnswer,
                      donePayload: agentStream.donePayload,
                      error: agentStream.error,
                    }
                  : null
              }
            />
          )}
        </div>

        {/* Input Area */}
        <CatalystInput
          input={input}
          setInput={setInput}
          onSubmit={onSubmit}
          isLoading={isLoading}
          stop={
            notes9Loading && agentStream.isStreaming
              ? () => agentStream.abort()
              : stop
          }
          hasMessages={messages.length > 0}
          agentMode={agentMode}
          onAgentModeChange={setAgentMode}
        />
      </div>
    </div>
  );
}
