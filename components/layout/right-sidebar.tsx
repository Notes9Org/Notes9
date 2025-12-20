'use client';

import { useState, useRef, useEffect, useCallback, type ChangeEvent } from 'react';
import { useChat, Chat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sparkles,
  Square,
  ArrowUp,
  MessageSquare,
  Activity,
  Plus,
  Paperclip,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatSessions } from '@/hooks/use-chat-sessions';
import { MarkdownRenderer } from '@/components/catalyst/markdown-renderer';
import { PreviewAttachment, type Attachment } from '@/components/catalyst/preview-attachment';
import { ModelSelector } from '@/components/catalyst/model-selector';
import { MessageActions } from '@/components/catalyst/message-actions';
import { DEFAULT_MODEL_ID } from '@/lib/ai/models';
import { toast } from 'sonner';

// Helper to get cookie value
function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

// Create transport factory that includes modelId
function createSidebarTransport(modelId: string) {
  return new DefaultChatTransport({ 
    api: '/api/chat',
    body: { modelId },
  });
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
];

export function RightSidebar() {
  const [input, setInput] = useState('');
  const [selectedModelId, setSelectedModelId] = useState(DEFAULT_MODEL_ID);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);

  // Load model from cookie on mount
  useEffect(() => {
    const savedModel = getCookie('catalyst-model');
    if (savedModel) {
      setSelectedModelId(savedModel);
    }
  }, []);

  // Create chat instance with current model
  const chatInstanceRef = useRef<InstanceType<typeof Chat> | null>(null);

  // Update chat instance when model changes
  useEffect(() => {
    chatInstanceRef.current = new Chat({
      id: `sidebar-${selectedModelId}`,
      transport: createSidebarTransport(selectedModelId),
    });
  }, [selectedModelId]);

  // Initialize chat instance
  if (!chatInstanceRef.current) {
    chatInstanceRef.current = new Chat({
      id: `sidebar-${selectedModelId}`,
      transport: createSidebarTransport(selectedModelId),
    });
  }

  const { messages, sendMessage, status, stop, setMessages } = useChat({
    chat: chatInstanceRef.current,
  });

  const {
    sessions,
    createSession,
    loadMessages,
  } = useChatSessions();

  const currentSessionRef = useRef<string | null>(null);
  const isLoading = status === 'streaming' || status === 'submitted';
  const isUploading = uploadQueue.length > 0;

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const uploadFile = useCallback(async (file: File): Promise<Attachment | null> => {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Upload failed');
      }

      const data = await response.json();
      return {
        url: data.url,
        name: data.pathname,
        contentType: data.contentType,
        size: data.size,
      };
    } catch (error) {
      console.error('Upload error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to upload');
      return null;
    }
  }, []);

  const handleFileSelect = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (files.length === 0) return;

      const validFiles = files.filter((file) => {
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${file.name} is too large`);
          return false;
        }
        if (!ALLOWED_TYPES.includes(file.type)) {
          toast.error(`${file.name} type not supported`);
          return false;
        }
        return true;
      });

      if (validFiles.length === 0) return;

      setUploadQueue(validFiles.map((f) => f.name));
      const results = await Promise.all(validFiles.map((f) => uploadFile(f)));
      const successful = results.filter((r): r is Attachment => r !== null);
      setAttachments((prev) => [...prev, ...successful]);
      setUploadQueue([]);

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [uploadFile]
  );

  const handlePaste = useCallback(
    async (event: ClipboardEvent) => {
      const items = event.clipboardData?.items;
      if (!items) return;

      const imageItems = Array.from(items).filter((item) =>
        item.type.startsWith('image/')
      );
      if (imageItems.length === 0) return;

      event.preventDefault();
      setUploadQueue(['Pasted image']);

      const files = imageItems
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);

      const results = await Promise.all(files.map((f) => uploadFile(f)));
      const successful = results.filter((r): r is Attachment => r !== null);
      setAttachments((prev) => [...prev, ...successful]);
      setUploadQueue([]);
    },
    [uploadFile]
  );

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.addEventListener('paste', handlePaste);
    return () => textarea.removeEventListener('paste', handlePaste);
  }, [handlePaste]);

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && attachments.length === 0) || isLoading || isUploading) return;

    const text = input;
    const currentAttachments = [...attachments];
    setInput('');
    setAttachments([]);

    if (!currentSessionRef.current) {
      const sessionId = await createSession();
      if (sessionId) {
        currentSessionRef.current = sessionId;
      }
    }

    // Build message parts
    const parts: Array<{ type: 'text'; text: string } | { type: 'file'; url: string; name: string; mediaType: string }> = [];

    for (const attachment of currentAttachments) {
      parts.push({
        type: 'file',
        url: attachment.url,
        name: attachment.name,
        mediaType: attachment.contentType,
      });
    }

    if (text.trim()) {
      parts.push({ type: 'text', text });
    }

    await sendMessage({ parts });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleNewChat = () => {
    setMessages([]);
    setAttachments([]);
    currentSessionRef.current = null;
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

  const recentActivity = [
    {
      id: '1',
      user: 'Dr. Sarah Chen',
      action: 'completed Protein Crystallization - Batch #47',
      time: '2 hours ago',
      initials: 'SC',
    },
    {
      id: '2',
      user: 'Mike Rodriguez',
      action: 'uploaded data to Compound Screening',
      time: '3 hours ago',
      initials: 'MR',
    },
    {
      id: '3',
      user: 'Dr. Emily Watson',
      action: 'analyzed results for Cancer Drug Discovery',
      time: '5 hours ago',
      initials: 'EW',
    },
  ];

  return (
    <div className="h-full flex flex-col bg-background">
      <Tabs defaultValue="assistant" className="flex flex-col h-full">
        {/* Tab Headers */}
        <div className="border-b px-2 sm:px-2 pt-2 shrink-0">
          <TabsList className="w-full grid grid-cols-2 h-8 sm:h-9">
            <TabsTrigger value="assistant" className="text-[11px] sm:text-xs gap-1 sm:gap-1.5">
              <Sparkles className="size-3" />
              <span className="hidden xs:inline">Assistant</span>
              <span className="xs:hidden">AI</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="text-[11px] sm:text-xs gap-1 sm:gap-1.5">
              <Activity className="size-3" />
              Activity
            </TabsTrigger>
          </TabsList>
        </div>

        {/* AI Assistant Tab */}
        <TabsContent value="assistant" className="flex-1 flex flex-col m-0 overflow-hidden min-h-0">
          {messages.length === 0 ? (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-4 text-center">
              <div className="relative mb-2 sm:mb-3">
                <div className="absolute inset-0 animate-pulse rounded-full bg-gradient-to-r from-orange-400 to-pink-500 opacity-20 blur-lg" />
                <Sparkles className="relative size-6 sm:size-8 text-orange-500" />
              </div>
              <h3 className="text-sm font-medium">Catalyst AI</h3>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-1">
                Ask me anything about your research
              </p>

              {sessions.length > 0 && (
                <div className="w-full mt-4 sm:mt-6">
                  <p className="text-[11px] sm:text-xs text-muted-foreground mb-2">Recent</p>
                  <div className="space-y-1">
                    {sessions.slice(0, 3).map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        className="w-full flex items-center gap-2 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-left text-[11px] sm:text-xs hover:bg-muted transition-colors"
                        onClick={() => {
                          currentSessionRef.current = session.id;
                          loadMessages(session.id).then((msgs) => {
                            const chatMessages = msgs.map((m) => ({
                              id: m.id,
                              role: m.role as 'user' | 'assistant',
                              content: m.content,
                              parts: [{ type: 'text' as const, text: m.content }],
                              createdAt: new Date(m.created_at),
                            }));
                            setMessages(chatMessages);
                          });
                        }}
                      >
                        <MessageSquare className="size-3 opacity-50 shrink-0" />
                        <span className="truncate">{session.title || 'New conversation'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Messages */
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-2 sm:p-3 space-y-2 sm:space-y-3">
                {messages.map((message, index) => {
                  const content = getMessageContent(message);
                  const isLastAssistant =
                    message.role === 'assistant' && index === messages.length - 1;

                  return (
                    <div
                      key={message.id}
                      className={cn(
                        'group/message flex gap-1.5 sm:gap-2',
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      )}
                    >
                      {message.role === 'assistant' && (
                        <div className="flex size-5 sm:size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-pink-500 text-white">
                          <Sparkles className="size-2.5 sm:size-3" />
                        </div>
                      )}
                      <div className="flex flex-col max-w-[88%] sm:max-w-[85%]">
                        <div
                          className={cn(
                            'rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs',
                            message.role === 'user'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          )}
                        >
                          {message.role === 'user' ? (
                            <span className="whitespace-pre-wrap break-words">
                              {content}
                            </span>
                          ) : (
                            <div className="prose prose-xs dark:prose-invert max-w-none [&_p]:my-0.5 sm:[&_p]:my-1 [&_pre]:my-0.5 sm:[&_pre]:my-1 [&_ul]:my-0.5 sm:[&_ul]:my-1">
                              <MarkdownRenderer
                                content={content}
                                className="text-[11px] sm:text-xs"
                              />
                            </div>
                          )}
                        </div>
                        {/* Message Actions */}
                        <MessageActions
                          sessionId={currentSessionRef.current}
                          messageId={message.id}
                          messageRole={message.role as 'user' | 'assistant'}
                          messageContent={content}
                          isLoading={isLoading}
                          onRegenerate={
                            isLastAssistant
                              ? async () => {
                                  // Find last user message and regenerate
                                  const lastUserMsgIndex = messages.findLastIndex(
                                    (m) => m.role === 'user'
                                  );
                                  if (lastUserMsgIndex === -1) return;
                                  const userContent = getMessageContent(
                                    messages[lastUserMsgIndex]
                                  );
                                  setMessages(messages.slice(0, lastUserMsgIndex + 1));
                                  await sendMessage({
                                    parts: [{ type: 'text', text: userContent }],
                                  });
                                }
                              : undefined
                          }
                          compact
                        />
                      </div>
                    </div>
                  );
                })}

                {isLoading && messages.at(-1)?.role === 'user' && (
                  <div className="flex gap-1.5 sm:gap-2 justify-start">
                    <div className="flex size-5 sm:size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-pink-500 text-white">
                      <Sparkles className="size-2.5 sm:size-3 animate-pulse" />
                    </div>
                    <div className="bg-muted rounded-xl px-2.5 sm:px-3 py-1.5 sm:py-2 text-[11px] sm:text-xs">
                      <span className="inline-flex gap-0.5">
                        <span className="animate-bounce [animation-delay:0ms]">.</span>
                        <span className="animate-bounce [animation-delay:150ms]">.</span>
                        <span className="animate-bounce [animation-delay:300ms]">.</span>
                      </span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>
          )}

          {/* Input Area */}
          <div className="p-2 border-t shrink-0">
            {/* Attachment Previews */}
            {(attachments.length > 0 || uploadQueue.length > 0) && (
              <div className="flex flex-wrap gap-1 mb-1.5 sm:mb-2">
                {attachments.map((attachment, index) => (
                  <PreviewAttachment
                    key={attachment.url}
                    attachment={attachment}
                    onRemove={() => handleRemoveAttachment(index)}
                    compact
                  />
                ))}
                {uploadQueue.map((name) => (
                  <PreviewAttachment
                    key={name}
                    attachment={{ url: '', name, contentType: '' }}
                    isUploading
                    compact
                  />
                ))}
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALLOWED_TYPES.join(',')}
              className="hidden"
              onChange={handleFileSelect}
              disabled={isLoading || isUploading}
            />

            <form onSubmit={handleSubmit}>
              <div className="relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything..."
                  className="w-full min-h-[32px] sm:min-h-[36px] max-h-[60px] sm:max-h-[80px] resize-none rounded-lg border bg-background px-2.5 sm:px-3 pr-8 sm:pr-9 py-1.5 sm:py-2 text-[11px] sm:text-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  disabled={isLoading}
                  rows={1}
                />

                {/* Submit/Stop button */}
                <div className="absolute right-1 sm:right-1.5 bottom-1 sm:bottom-1.5">
                  {isLoading ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="size-5 sm:size-6"
                      onClick={stop}
                    >
                      <Square className="size-2.5 sm:size-3" />
                    </Button>
                  ) : (
                    <Button
                      type="submit"
                      size="icon"
                      className="size-5 sm:size-6 rounded-full"
                      disabled={(!input.trim() && attachments.length === 0) || isUploading}
                    >
                      <ArrowUp className="size-2.5 sm:size-3" />
                    </Button>
                  )}
                </div>
      </div>

              {/* Toolbar - New chat + Model + Attach */}
              <div className="flex items-center gap-0.5 sm:gap-1 mt-1 sm:mt-1.5">
                {messages.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 sm:h-6 px-1.5 sm:px-2 text-[10px] sm:text-xs text-muted-foreground hover:text-foreground"
                    onClick={handleNewChat}
                  >
                    <Plus className="size-2.5 sm:size-3 mr-0.5 sm:mr-1" />
                    New
                  </Button>
                )}
                <ModelSelector
                  selectedModelId={selectedModelId}
                  onModelChange={setSelectedModelId}
                  compact
                  disabled={isLoading}
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-5 sm:size-6 text-muted-foreground hover:text-foreground"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading || isUploading}
                >
                  <Paperclip className="size-2.5 sm:size-3" />
              </Button>
              </div>
            </form>
          </div>
        </TabsContent>

        {/* Recent Activity Tab */}
        <TabsContent value="activity" className="flex-1 m-0 overflow-hidden min-h-0">
          <ScrollArea className="h-full">
            <div className="p-2 sm:p-3 space-y-2 sm:space-y-3">
              <p className="text-[11px] sm:text-xs font-medium text-muted-foreground">
                Latest updates from your team
              </p>
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <Avatar className="size-6 sm:size-8 shrink-0">
                    <AvatarFallback className="text-[10px] sm:text-xs bg-muted">
                      {activity.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] sm:text-xs font-medium truncate">{activity.user}</p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground line-clamp-2">
                      {activity.action}
                    </p>
                    <p className="text-[10px] sm:text-xs text-muted-foreground/60 mt-0.5">
                      {activity.time}
                    </p>
                  </div>
                </div>
              ))}
        </div>
      </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
