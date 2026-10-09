'use client';

import {
  SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import Image from 'next/image';

import { SavedPrompt } from '@prisma/client';
import { Attachment, JSONValue, Message } from 'ai';
import { useChat } from 'ai/react';
import {
  Bookmark,
  Image as ImageIcon,
  Loader2,
  SendHorizontal,
  X,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import { toast } from 'sonner';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

import { getToolView } from '@/ai/tool-views';
import { AgentEye } from '@/components/agent-eye';
import { Confirmation } from '@/components/confimation';
import { FloatingWallet } from '@/components/floating-wallet';
import { AgentMark } from '@/components/logo';
import { ToolResult } from '@/components/message/tool-result';
import { PixelLoader } from '@/components/pixel-loader';
import { SavedPromptsMenu } from '@/components/saved-prompts-menu';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { type Etat } from '@/config/marque';
import usePolling from '@/hooks/use-polling';
import { useUser } from '@/hooks/use-user';
import { useWalletPortfolio } from '@/hooks/use-wallet-portfolio';
import { EVENTS } from '@/lib/events';
import { movesFunds } from '@/lib/fonctions/garde';
import { uploadImage } from '@/lib/upload';
import { cn } from '@/lib/utils';
import {
  createSavedPrompt,
  getSavedPrompts,
  setSavedPromptLastUsedAt,
} from '@/server/actions/saved-prompt';
import { type ToolActionResult, ToolUpdate } from '@/types/util';

import { ConversationInput } from '../../home/conversation-input';

// Types
interface UploadingImage extends Attachment {
  localUrl: string;
  uploading: boolean;
}

interface ImagePreview {
  src: string;
  alt: string;
  index?: number;
  attachments?: Required<Attachment>[];
}

interface MessageAttachmentsProps {
  attachments: Attachment[];
  messageId: string;
  onPreviewImage: (preview: ImagePreview) => void;
}

interface ToolResult {
  toolCallId: string;
  result: any;
}

interface ChatMessageProps {
  message: Message;
  index: number;
  messages: Message[];
  setSavedPrompts: React.Dispatch<SetStateAction<SavedPrompt[]>>;
  onPreviewImage: (preview: ImagePreview) => void;
  addToolResult: (result: ToolResult) => void;
  /** The agent's state, shown in the eye of the live (latest) reply only. */
  agentEtat?: Etat;
  /** True while this message is still streaming. */
  isLive: boolean;
}

interface AttachmentPreviewProps {
  attachment: UploadingImage;
  onRemove: () => void;
}

interface ImagePreviewDialogProps {
  previewImage: ImagePreview | null;
  onClose: () => void;
}

interface ToolInvocation {
  toolCallId: string;
  toolName: string;
  displayName?: string;
  result?: {
    result?: string;
    message: string;
  };
  state?: string;
  args?: any;
}

// Constants
const MAX_CHARS = 2000;
const MAX_VISIBLE_ATTACHMENTS = 4;
const MAX_JSON_LINES = 20; // Maximum number of lines to show in JSON output

// Utility functions
const truncateJson = (json: unknown): string => {
  const formatted = JSON.stringify(json, null, 2);
  const lines = formatted.split('\n');

  if (lines.length <= MAX_JSON_LINES) {
    return formatted;
  }

  const firstHalf = lines.slice(0, MAX_JSON_LINES / 2);
  const lastHalf = lines.slice(-MAX_JSON_LINES / 2);

  return [...firstHalf, '    ...', ...lastHalf].join('\n');
};

const getGridLayout = (count: number) => {
  if (count === 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-2';
  if (count <= 4) return 'grid-cols-2 grid-rows-2';
  return 'grid-cols-3 grid-rows-2';
};

const getImageStyle = (index: number, total: number) => {
  if (total === 1) return 'aspect-square max-w-[300px]';
  if (total === 2) return 'aspect-square';
  if (total === 3 && index === 0) return 'col-span-2 aspect-[2/1]';
  return 'aspect-square';
};

const applyToolUpdates = (messages: Message[], toolUpdates: ToolUpdate[]) => {
  while (toolUpdates.length > 0) {
    const update = toolUpdates.pop();
    if (!update) {
      continue;
    }

    if (update.type === 'tool-update') {
      messages.forEach((msg) => {
        const toolInvocation = msg.toolInvocations?.find(
          (tool) => tool.toolCallId === update.toolCallId,
        ) as ToolInvocation | undefined;

        if (toolInvocation) {
          if (!toolInvocation.result) {
            toolInvocation.result = {
              result: update.result,
              message: toolInvocation.args?.message, // TODO: Don't think this is technically correct, but shouldn't affect UI
            };
          } else {
            toolInvocation.result.result = update.result;
          }
        }
      });
    }
  }

  return messages;
};

const useAnimationEffect = () => {
  useEffect(() => {
    document.body.classList.remove('animate-fade-out');
    document.body.classList.add('animate-fade-in');
    const timer = setTimeout(() => {
      document.body.classList.remove('animate-fade-in');
    }, 300);
    return () => clearTimeout(timer);
  }, []);
};

// Components
function MessageAttachments({
  attachments,
  messageId,
  onPreviewImage,
}: MessageAttachmentsProps) {
  const validAttachments = attachments.filter(
    (attachment): attachment is Required<Attachment> =>
      typeof attachment.contentType === 'string' &&
      typeof attachment.url === 'string' &&
      typeof attachment.name === 'string' &&
      attachment.contentType.startsWith('image/'),
  );

  if (validAttachments.length === 0) return null;

  return (
    <div
      className={cn(
        'grid w-full gap-1.5',
        getGridLayout(validAttachments.length),
      )}
    >
      {validAttachments
        .slice(0, MAX_VISIBLE_ATTACHMENTS)
        .map((attachment, index) => (
          <div
            key={`${messageId}-${index}`}
            className={cn(
              'group relative cursor-zoom-in overflow-hidden',
              getImageStyle(index, validAttachments.length),
              'rounded-lg shadow-sm transition-shadow duration-200 hover:shadow-md',
            )}
            onClick={() =>
              onPreviewImage({
                src: attachment.url,
                alt: attachment.name,
                index,
                attachments: validAttachments,
              })
            }
          >
            <Image
              src={attachment.url}
              alt={attachment.name}
              fill
              className="object-cover transition-transform duration-200 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            />
            {validAttachments.length > MAX_VISIBLE_ATTACHMENTS &&
              index === 3 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 font-medium text-white">
                  +{validAttachments.length - MAX_VISIBLE_ATTACHMENTS}
                </div>
              )}
          </div>
        ))}
    </div>
  );
}

function MessageToolInvocations({
  toolInvocations,
  addToolResult,
  isLive,
}: {
  toolInvocations: ToolInvocation[];
  addToolResult: (result: ToolResult) => void;
  /** True while this reply is still streaming. */
  isLive: boolean;
}) {
  return (
    <div className="space-y-px">
      {toolInvocations.map(
        ({ toolCallId, toolName, displayName, result, state, args }) => {
          const toolResult = result as ToolActionResult;
          if (toolName === 'askForConfirmation') {
            return (
              <div key={toolCallId} className="group">
                <Confirmation
                  message={args?.message}
                  tool={args?.tool}
                  args={args?.args}
                  result={toolResult?.result}
                  toolCallId={toolCallId}
                  addResultUtility={(result) =>
                    addToolResult({
                      toolCallId,
                      result: { result, message: args?.message },
                    })
                  }
                />
              </div>
            );
          }

          const isCompleted = result !== undefined;
          const isError =
            isCompleted &&
            typeof result === 'object' &&
            result !== null &&
            'error' in result;

          const config = getToolView(toolName);

          // Handle unknown tool with no config
          if (!config) {
            const header = (
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-destructive" />
                <span className="truncate text-xs font-medium text-foreground/90">
                  Tool error
                </span>
              </div>
            );

            return (
              <div key={toolCallId} className="group">
                <ToolResult
                  toolName="Tool error"
                  result={{
                    result: 'Tool error',
                    error:
                      'An error occurred while processing your request, please try again or adjust your phrasing.',
                  }}
                  header={header}
                />
              </div>
            );
          }

          const finalDisplayName = displayName || config?.displayName;
          // A move of funds that never got its result: the stream stopped after the call left.
          // It may or may not have landed, so it is never retried on its own.
          const isUncertain = !isCompleted && !isLive && movesFunds(toolName);

          const header = (
            <div className="flex min-w-0 flex-1 items-center gap-2">
              {!isCompleted && !isUncertain ? (
                <PixelLoader size={9} />
              ) : (
                <div
                  className={cn(
                    'h-1.5 w-1.5 shrink-0 rounded-full',
                    isCompleted
                      ? isError
                        ? 'bg-destructive'
                        : 'bg-primary'
                      : 'bg-pending',
                  )}
                />
              )}
              <span className="truncate text-xs font-medium text-foreground/90">
                {finalDisplayName}
              </span>
              <span className="text-xs text-muted-foreground">
                {isCompleted
                  ? isError
                    ? 'failed'
                    : 'done'
                  : isUncertain
                    ? 'result unknown'
                    : isLive
                      ? 'running'
                      : 'stopped'}
              </span>
            </div>
          );

          return (
            <div key={toolCallId} className="group">
              {isCompleted ? (
                <ToolResult
                  toolName={toolName}
                  result={result}
                  header={header}
                />
              ) : (
                <div className="mt-1 py-1">
                  {header}
                  {isUncertain && (
                    <p className="mt-1 pl-3.5 text-xs text-muted-foreground">
                      The connection dropped after this was sent. It may have
                      gone through: check your wallet activity before asking
                      again.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        },
      )}
    </div>
  );
}

function ChatMessage({
  message,
  index,
  messages,
  setSavedPrompts,
  onPreviewImage,
  addToolResult,
  agentEtat,
  isLive,
}: ChatMessageProps) {
  const isUser = message.role === 'user';
  const hasAttachments =
    message.experimental_attachments &&
    message.experimental_attachments.length > 0;
  const showAvatar =
    !isUser && (index === 0 || messages[index - 1].role === 'user');
  const isConsecutive = index > 0 && messages[index - 1].role === message.role;
  const { user } = useUser();

  async function handleSavePrompt() {
    if (!user) {
      toast.error('Unauthorized');
      return;
    }

    toast.promise(
      createSavedPrompt({
        title: message.content.trim().slice(0, 30) + '...',
        content: message.content.trim(),
      }).then((res) => {
        if (!res?.data?.data) {
          throw new Error();
        }

        const savedPrompt = res?.data?.data;
        setSavedPrompts((old) => [...old, savedPrompt]);
      }),
      {
        loading: 'Saving prompt...',
        success: 'Prompt saved',
        error: 'Failed to save prompt',
      },
    );
  }

  // Preprocess content to handle image dimensions
  const processedContent = message.content?.replace(
    /!\[(.*?)\]\((.*?)\s+=(\d+)x(\d+)\)/g,
    (_, alt, src, width, height) => `![${alt}](${src}#size=${width}x${height})`,
  );

  return (
    <div
      className={cn(
        'flex w-full items-start gap-3',
        isUser ? 'flex-row-reverse' : 'flex-row',
        isConsecutive ? 'mt-2' : 'mt-6',
        index === 0 && 'mt-0',
      )}
    >
      {showAvatar ? (
        agentEtat ? (
          <AgentEye etat={agentEtat} size={28} className="mt-0.5" />
        ) : (
          <AgentMark size={28} className="mt-0.5" />
        )
      ) : !isUser ? (
        <div className="w-7 shrink-0" aria-hidden="true" />
      ) : null}

      <div className="group relative flex max-w-[85%] flex-row items-center">
        {isUser && (
          <button
            onClick={handleSavePrompt}
            className="mr-1 hidden pb-4 pl-4 pr-2 pt-4 text-muted-foreground group-hover:block hover:text-primary"
            aria-label="Save prompt"
          >
            <Bookmark className="h-4 w-4" />
          </button>
        )}
        <div
          className={cn('relative gap-2', isUser ? 'items-end' : 'items-start')}
        >
          {hasAttachments && (
            <div
              className={cn('w-full max-w-[400px]', message.content && 'mb-2')}
            >
              <MessageAttachments
                attachments={message.experimental_attachments!}
                messageId={message.id}
                onPreviewImage={onPreviewImage}
              />
            </div>
          )}

          {message.content && (
            <div
              className={cn(
                'relative flex flex-col gap-2 text-sm',
                isUser ? 'rounded-2xl bg-secondary px-4 py-3' : 'py-1',
              )}
            >
              <div
                className={cn(
                  'prose prose-sm prose-invert max-w-prose break-words leading-snug md:prose-base',
                  'prose-a:text-primary prose-code:font-mono',
                )}
              >
                <ReactMarkdown
                  rehypePlugins={[rehypeRaw]}
                  remarkPlugins={[remarkGfm]}
                  components={{
                    a: ({ node, ...props }) => (
                      <a {...props} target="_blank" rel="noopener noreferrer" />
                    ),
                    img: ({ node, alt, src, ...props }) => {
                      if (!src) return null;

                      try {
                        // Handle both relative and absolute URLs safely
                        const url = new URL(src, 'http://dummy.com');
                        const size = url.hash.match(/size=(\d+)x(\d+)/);

                        if (size) {
                          const [, width, height] = size;
                          // Remove hash from src
                          url.hash = '';
                          return (
                            <Image
                              src={url.pathname + url.search}
                              alt={alt || ''}
                              width={Number(width)}
                              height={Number(height)}
                              className="inline-block align-middle"
                            />
                          );
                        }
                      } catch (e) {
                        // If URL parsing fails, fallback to original src
                        console.warn('Failed to parse image URL:', e);
                      }

                      const thumbnailPattern = /_thumb\.(png|jpg|jpeg|gif)$/i;
                      const isThumbnail = thumbnailPattern.test(src);

                      const width = isThumbnail ? 40 : 500;
                      const height = isThumbnail ? 40 : 300;

                      // Fallback to Image component with default dimensions
                      return (
                        <Image
                          src={src}
                          alt={alt || ''}
                          width={width}
                          height={height}
                          className="inline-block align-middle"
                        />
                      );
                    },
                  }}
                >
                  {processedContent}
                </ReactMarkdown>
              </div>
            </div>
          )}

          {message.toolInvocations && (
            <MessageToolInvocations
              toolInvocations={message.toolInvocations}
              addToolResult={addToolResult}
              isLive={isLive}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ImagePreviewDialog({
  previewImage,
  onClose,
}: ImagePreviewDialogProps) {
  if (!previewImage) return null;

  const slides = previewImage.attachments
    ? previewImage.attachments.map((attachment) => ({
        src: attachment.url,
        alt: attachment.name,
      }))
    : [{ src: previewImage.src, alt: previewImage.alt }];

  const isSingleImage = slides.length === 1;

  return (
    <Lightbox
      open={!!previewImage}
      close={onClose}
      index={previewImage.index || 0}
      slides={slides}
      controller={{ closeOnBackdropClick: true }}
      styles={{
        container: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(10px)',
        },
        button: {
          filter: 'none',
          color: 'white',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(4px)',
        },
        navigationPrev: {
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(4px)',
          borderRadius: '9999px',
          margin: '0 8px',
          display: isSingleImage ? 'none' : undefined,
        },
        navigationNext: {
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(4px)',
          borderRadius: '9999px',
          margin: '0 8px',
          display: isSingleImage ? 'none' : undefined,
        },
      }}
      animation={{ fade: 300 }}
      carousel={{ finite: false }}
      toolbar={{
        buttons: [
          <button
            key="close"
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full bg-secondary p-2.5 transition-colors duration-200 hover:bg-border"
            aria-label="Close preview"
          >
            <X className="h-5 w-5 text-white" />
          </button>,
        ],
      }}
      render={{
        buttonPrev: () => null,
        buttonNext: () => null,
        buttonClose: () => null,
      }}
    />
  );
}

/** Seconds since `active` turned on; null when off. The start lives in a ref: no extra render. */
function useElapsed(active: boolean) {
  const start = useRef<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      start.current = null;
      return;
    }
    start.current = Date.now();
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return start.current === null
    ? null
    : Math.max(0, Math.round((now - start.current) / 1000));
}

/** The status line under the thread: what is running and for how long, with a way out. */
function StatusLine({
  messages,
  isLoading,
  error,
  onStop,
  onRetry,
}: {
  messages: Message[];
  isLoading: boolean;
  error: Error | undefined;
  onStop: () => void;
  onRetry: () => void;
}) {
  const elapsed = useElapsed(isLoading);
  const last = messages[messages.length - 1];
  // The live reply: the run of assistant messages at the end of the thread.
  const reply = messages.slice(
    messages.reduce((from, m, i) => (m.role === 'assistant' ? from : i + 1), 0),
  );
  const calls = reply.flatMap((m) => m.toolInvocations ?? []);
  const running = calls
    .filter((t) => t.state !== 'result' && t.toolName !== 'askForConfirmation')
    .at(-1);
  // Any move of funds in this reply, finished or not: a retry resends the request and could
  // move funds a second time, so it is never offered then.
  const moved = calls.some((t) => movesFunds(t.toolName));
  const name = running
    ? getToolView(running.toolName)?.displayName || running.toolName
    : undefined;

  return (
    <>
      {/* One region, always mounted, that only says what changes: never the seconds. */}
      <p className="sr-only" role="status">
        {isLoading ? (name ? `Running ${name}…` : 'Working on it…') : ''}
      </p>
      {isLoading && (
        <div className="mt-4 flex items-center gap-3 text-sm">
          {last?.role !== 'assistant' && <AgentEye etat="lit" size={28} />}
          <PixelLoader size={11} />
          <span className="text-muted-foreground" aria-hidden="true">
            {name ? `Running ${name}…` : 'Working on it…'}
            {elapsed !== null && (
              <span className="tabular-nums"> · {elapsed} s</span>
            )}
          </span>
          <button
            type="button"
            onClick={onStop}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Stop
          </button>
        </div>
      )}
      {!isLoading && error && (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 text-sm"
          role="alert"
        >
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full bg-destructive"
          />
          <span className="text-muted-foreground">
            The connection dropped. What arrived is kept above.
          </span>
          {moved ? (
            <span className="text-xs text-muted-foreground">
              This reply moved or tried to move funds: check your wallet
              activity before asking again.
            </span>
          ) : (
            <Button size="sm" variant="outline" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      )}
    </>
  );
}

/** What the eye says about the latest reply: reading, waiting, denied, resting. */
function getAgentEtat(messages: Message[], isLoading: boolean): Etat {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant') return 'repos';

  const confirmations = (last.toolInvocations ?? []).filter(
    (tool) => tool.toolName === 'askForConfirmation',
  ) as unknown as ToolInvocation[];
  const pending = confirmations.some(
    (tool) => tool.args?.message && !tool.result?.result,
  );
  if (pending) return 'attend';
  if (isLoading) return 'lit';

  const lastAnswer = confirmations[confirmations.length - 1]?.result?.result;
  if (lastAnswer === 'deny') return 'refuse';
  return 'repos';
}

export default function ChatInterface({
  id,
  initialMessages = [],
}: {
  id: string;
  initialMessages?: Message[];
}) {
  const {
    messages: chatMessages,
    input,
    handleSubmit,
    handleInputChange,
    isLoading,
    addToolResult,
    data,
    setInput,
    setMessages,
    error,
    reload,
    stop,
  } = useChat({
    id,
    maxSteps: 10,
    initialMessages,
    sendExtraMessageFields: true,
    body: { id },
    onFinish: () => {
      if (window.location.pathname === `/chat/${id}`) {
        window.history.replaceState({}, '', `/chat/${id}`);
      }
      // Refresh wallet portfolio after AI response
      refresh();

      // Dispatch event to mark conversation as read
      window.dispatchEvent(new CustomEvent(EVENTS.CONVERSATION_READ));
    },
    experimental_prepareRequestBody: ({ messages }) => {
      return {
        message: messages[messages.length - 1],
        id,
      } as unknown as JSONValue;
    },
  });

  const messages = useMemo(() => {
    const toolUpdates = data as unknown as ToolUpdate[];
    if (!toolUpdates || toolUpdates.length === 0) {
      return chatMessages;
    }

    const updatedMessages = applyToolUpdates(chatMessages, toolUpdates);

    return updatedMessages;
  }, [chatMessages, data]);

  // Use polling for fetching new messages
  usePolling({
    url: `/api/chat/${id}`,
    onUpdate: (data: Message[]) => {
      if (!data) {
        return;
      }

      if (data && data.length) {
        setMessages(data);
      }

      window.dispatchEvent(new CustomEvent(EVENTS.CONVERSATION_READ));
    },
  });

  const [previewImage, setPreviewImage] = useState<ImagePreview | null>(null);
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const {
    data: portfolio,
    isLoading: isPortfolioLoading,
    refresh,
  } = useWalletPortfolio();

  const scrollToBottom = useCallback(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, []);

  const handleSend = async (value: string, attachments: Attachment[]) => {
    if (!value.trim() && (!attachments || attachments.length === 0)) {
      return;
    }

    // Create a synthetic event for handleSubmit
    const fakeEvent = {
      preventDefault: () => {},
      type: 'submit',
    } as React.FormEvent;

    // Prepare message data with attachments if present
    const currentAttachments = attachments.map(
      ({ url, name, contentType }) => ({
        url,
        name,
        contentType,
      }),
    );

    // Submit the message
    await handleSubmit(fakeEvent, {
      data: value,
      experimental_attachments: currentAttachments,
    });
    scrollToBottom();
  };

  useAnimationEffect();

  const agentEtat = getAgentEtat(messages, isLoading);
  // The live reply is the run of assistant messages at the end of the thread.
  const liveFrom = messages.reduce(
    (from, message, i) => (message.role === 'assistant' ? from : i + 1),
    0,
  );

  return (
    <div className="flex h-full flex-col">
      <div className="no-scrollbar relative flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl">
          <div className="space-y-4 px-4 pb-36 pt-4">
            {messages.map((message, index) => (
              <ChatMessage
                key={message.id}
                message={message}
                index={index}
                messages={messages}
                setSavedPrompts={setSavedPrompts}
                onPreviewImage={setPreviewImage}
                addToolResult={addToolResult}
                agentEtat={index >= liveFrom ? agentEtat : undefined}
                isLive={isLoading && index === messages.length - 1}
              />
            ))}
            <StatusLine
              messages={messages}
              isLoading={isLoading}
              error={error}
              onStop={stop}
              onRetry={() => reload()}
            />
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 z-10">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background via-background/95 to-background/0" />
        <div className="relative mx-auto w-full max-w-3xl px-4 py-4">
          {/* Floating Wallet */}
          {portfolio && (
            <FloatingWallet data={portfolio} isLoading={isPortfolioLoading} />
          )}

          <ConversationInput
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            onChat={true}
            savedPrompts={savedPrompts}
            setSavedPrompts={setSavedPrompts}
          />
        </div>
      </div>

      <ImagePreviewDialog
        previewImage={previewImage}
        onClose={() => setPreviewImage(null)}
      />
    </div>
  );
}
