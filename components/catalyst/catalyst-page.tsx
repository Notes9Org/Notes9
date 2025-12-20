'use client';

import { useChat, Chat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRouter } from 'next/navigation';
import { useRef, useEffect, useState, useCallback } from 'react';
import { PanelLeftClose, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatSessions } from '@/hooks/use-chat-sessions';
import { createClient } from '@/lib/supabase/client';
import { DEFAULT_MODEL_ID } from '@/lib/ai/models';
import { CatalystGreeting } from './catalyst-greeting';
import { CatalystMessages } from './catalyst-messages';
import { CatalystInput } from './catalyst-input';
import type { Attachment } from './preview-attachment';
import { CatalystSidebar } from './catalyst-sidebar';
import type { Vote } from '@/lib/db/schema';

// Helper to get cookie value
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

interface CatalystChatProps {
  sessionId?: string;
}

// Create transport factory that includes modelId
function createChatTransport(modelId: string) {
  return new DefaultChatTransport({ 
    api: '/api/chat',
    body: { modelId },
  });
}

export function CatalystChat({ sessionId }: CatalystChatProps) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [userName, setUserName] = useState<string>('');
  const [savedMessageIds, setSavedMessageIds] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedModelId, setSelectedModelId] = useState(DEFAULT_MODEL_ID);
  const [votes, setVotes] = useState<Vote[]>([]);

  // Load model from cookie on mount
  useEffect(() => {
    const savedModel = getCookie('catalyst-model');
    if (savedModel) {
      setSelectedModelId(savedModel);
    }
  }, []);

  const prevStatusRef = useRef<string>('ready');
  const currentSessionRef = useRef<string | null>(sessionId || null);
  const hasLoadedSessionRef = useRef<string | null>(null);

  const supabase = createClient();

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

  // Create chat instance with current model
  const chatInstanceRef = useRef<InstanceType<typeof Chat> | null>(null);
  const currentModelRef = useRef(selectedModelId);

  // Update chat instance when model changes
  useEffect(() => {
    currentModelRef.current = selectedModelId;
    chatInstanceRef.current = new Chat({
      id: `catalyst-${sessionId || 'new'}-${selectedModelId}`,
      transport: createChatTransport(selectedModelId),
    });
  }, [selectedModelId, sessionId]);

  // Initialize chat instance
  if (!chatInstanceRef.current) {
    chatInstanceRef.current = new Chat({
      id: `catalyst-${sessionId || 'new'}-${selectedModelId}`,
      transport: createChatTransport(selectedModelId),
    });
  }

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    chat: chatInstanceRef.current,
  });

  const isLoading = status === 'streaming' || status === 'submitted';

  // Load user profile
  useEffect(() => {
    const loadUserProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
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
  }, [createSession, setMessages, router]);

  const handleSelectSession = useCallback(
    (sid: string) => {
      setMessages([]);
      setSavedMessageIds(new Set());
      hasLoadedSessionRef.current = null;
      setCurrentSessionId(sid);
      router.push(`/catalyst/${sid}`);
    },
    [setCurrentSessionId, setMessages, router]
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

    // Build message parts
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
  const handleEditMessage = useCallback(
    async (messageId: string, newContent: string) => {
      const messageIndex = messages.findIndex((m) => m.id === messageId);
      if (messageIndex === -1) return;

      // Remove this message and all following messages
      const updatedMessages = messages.slice(0, messageIndex);
      
      // Add the edited message
      const editedMessage = {
        ...messages[messageIndex],
        parts: [{ type: 'text' as const, text: newContent }],
      };
      
      setMessages([...updatedMessages, editedMessage]);

      // Send the new message to regenerate response
      await sendMessage({ parts: [{ type: 'text', text: newContent }] });
    },
    [messages, setMessages, sendMessage]
  );

  // Handle regenerating the last response
  const handleRegenerate = useCallback(async () => {
    if (messages.length < 2) return;

    // Find the last user message
    const lastUserMessageIndex = messages.findLastIndex((m) => m.role === 'user');
    if (lastUserMessageIndex === -1) return;

    const lastUserMessage = messages[lastUserMessageIndex];
    const userContent = getMessageContent(lastUserMessage);

    // Remove assistant response(s) after the last user message
    setMessages(messages.slice(0, lastUserMessageIndex + 1));

    // Regenerate
    await sendMessage({ parts: [{ type: 'text', text: userContent }] });
  }, [messages, setMessages, sendMessage, getMessageContent]);

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
            />
          )}
        </div>

        {/* Input Area */}
        <CatalystInput
          input={input}
          setInput={setInput}
          onSubmit={onSubmit}
          isLoading={isLoading}
          stop={stop}
          hasMessages={messages.length > 0}
          selectedModelId={selectedModelId}
          onModelChange={setSelectedModelId}
        />
      </div>
    </div>
  );
}
