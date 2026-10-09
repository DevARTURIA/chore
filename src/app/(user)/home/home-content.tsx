'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { usePathname } from 'next/navigation';

import { SavedPrompt } from '@prisma/client';
import { Attachment, JSONValue } from 'ai';
import { useChat } from 'ai/react';
import { v4 as uuidv4 } from 'uuid';

import ChatInterface from '@/app/(user)/chat/[id]/chat-interface';
import { AgentEye } from '@/components/agent-eye';
import { SavedPromptsMenu } from '@/components/saved-prompts-menu';
import BlurFade from '@/components/ui/blur-fade';
import { brand } from '@/config/brand';
import { useConversations } from '@/hooks/use-conversations';
import { useUser } from '@/hooks/use-user';
import { EVENTS } from '@/lib/events';
import {
  getSavedPrompts,
  setSavedPromptLastUsedAt,
} from '@/server/actions/saved-prompt';

import { ConversationInput } from './conversation-input';
import { getRandomSuggestions } from './data/suggestions';
import { SuggestionCard } from './suggestion-card';

interface SectionTitleProps {
  children: React.ReactNode;
}

function SectionTitle({ children }: SectionTitleProps) {
  return (
    <h2 className="mb-2 px-1 text-sm font-medium text-muted-foreground">
      {children}
    </h2>
  );
}

export function HomeContent() {
  const pathname = usePathname();
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [isFetchingSavedPrompts, setIsFetchingSavedPrompts] =
    useState<boolean>(true);
  const suggestions = useMemo(() => getRandomSuggestions(4), []);
  const [showChat, setShowChat] = useState(false);
  const [chatId, setChatId] = useState(() => uuidv4());
  const { user, isLoading: isUserLoading } = useUser();

  const { conversations, refreshConversations } = useConversations(user?.id);

  const resetChat = useCallback(() => {
    setShowChat(false);
    setChatId(uuidv4());
  }, []);

  useEffect(() => {
    async function fetchSavedPrompts() {
      try {
        const res = await getSavedPrompts();
        const savedPrompts = res?.data?.data || [];

        setSavedPrompts(savedPrompts);
      } catch (err) {
        console.error(err);
      }
      setIsFetchingSavedPrompts(false);
    }
    fetchSavedPrompts();
  }, []);

  const { messages, input, handleSubmit, setInput } = useChat({
    id: chatId,
    initialMessages: [],
    body: { id: chatId },
    onFinish: () => {
      // Only refresh if we have a new conversation that's not in the list
      if (chatId && !conversations?.find((conv) => conv.id === chatId)) {
        refreshConversations().then(() => {
          // Dispatch event to mark conversation as read
          window.dispatchEvent(new CustomEvent(EVENTS.CONVERSATION_READ));
        });
      }
    },
    experimental_prepareRequestBody: ({ messages }) => {
      return {
        message: messages[messages.length - 1],
        id: chatId,
      } as unknown as JSONValue;
    },
  });

  const handleSend = async (value: string, attachments: Attachment[]) => {
    if (!value.trim() && (!attachments || attachments.length === 0)) {
      return;
    }

    // Create a synthetic event for handleSubmit
    const fakeEvent = {
      preventDefault: () => {},
      type: 'submit',
    } as React.FormEvent;

    // Submit the message
    await handleSubmit(fakeEvent, {
      data: value,
      experimental_attachments: attachments,
    });

    // Update UI state and URL
    setShowChat(true);
    window.history.replaceState(null, '', `/chat/${chatId}`);
  };

  // Reset chat when pathname changes to /home
  useEffect(() => {
    if (pathname === '/home') {
      resetChat();
    }
  }, [pathname, resetChat]);

  // 监听浏览器的前进后退
  useEffect(() => {
    const handlePopState = () => {
      if (location.pathname === '/home') {
        resetChat();
      } else if (location.pathname === `/chat/${chatId}`) {
        setShowChat(true);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [chatId, resetChat]);

  const filteredPrompts = input.startsWith('/')
    ? savedPrompts.filter((savedPrompt) =>
        savedPrompt.title.toLowerCase().includes(input.slice(1).toLowerCase()),
      )
    : savedPrompts;

  function handlePromptMenuClick(subtitle: string) {
    setInput(subtitle);
  }

  async function updatePromptLastUsedAt(id: string) {
    try {
      const res = await setSavedPromptLastUsedAt({ id });
      if (!res?.data?.data) {
        throw new Error();
      }

      const { lastUsedAt } = res.data.data;

      setSavedPrompts((old) =>
        old.map((prompt) =>
          prompt.id !== id ? prompt : { ...prompt, lastUsedAt },
        ),
      );
    } catch (error) {
      console.error('Failed to update -lastUsedAt- for prompt:', { error });
    }
  }
  // Handle loading states
  if (isUserLoading) {
    return (
      <div
        className="flex h-screen w-full items-center justify-center"
        role="status"
        aria-label="Loading"
      >
        <AgentEye etat="lit" size={40} />
      </div>
    );
  }

  const mainContent = (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-6 py-12">
      <BlurFade delay={0.1}>
        <div className="mb-10 flex flex-col items-center gap-5 text-center">
          <AgentEye etat="repos" size={44} title={brand.name} />
          <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
            How can I assist you?
          </h1>
        </div>
      </BlurFade>

      <div className="mx-auto w-full max-w-3xl space-y-8">
        <BlurFade delay={0.15}>
          <ConversationInput
            value={input}
            onChange={setInput}
            onSubmit={handleSend}
            savedPrompts={savedPrompts}
            setSavedPrompts={setSavedPrompts}
          />
          <SavedPromptsMenu
            input={input}
            isFetchingSavedPrompts={false}
            savedPrompts={savedPrompts}
            filteredPrompts={filteredPrompts}
            onPromptClick={handlePromptMenuClick}
            updatePromptLastUsedAt={updatePromptLastUsedAt}
            onHomeScreen={true}
          />
        </BlurFade>

        <div className="space-y-8">
          <BlurFade delay={0.2}>
            <div className="space-y-2">
              <SectionTitle>Suggestions</SectionTitle>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {suggestions.map((suggestion, index) => (
                  <SuggestionCard
                    key={suggestion.title}
                    {...suggestion}
                    delay={0.25 + index * 0.05}
                    onSelect={setInput}
                  />
                ))}
              </div>
            </div>
          </BlurFade>

          {!isFetchingSavedPrompts && savedPrompts.length !== 0 && (
            <BlurFade delay={0.3}>
              <div className="space-y-2">
                <SectionTitle>Saved prompts</SectionTitle>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {savedPrompts
                    .slice(0, Math.min(4, savedPrompts.length))
                    .map((savedPrompt, index) => (
                      <SuggestionCard
                        id={savedPrompt.id}
                        useSubtitle={true}
                        title={savedPrompt.title}
                        subtitle={savedPrompt.content}
                        key={savedPrompt.id}
                        delay={0.3 + index * 0.05}
                        onSelect={setInput}
                      />
                    ))}
                </div>
              </div>
            </BlurFade>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="relative h-screen">
      {!showChat && (
        <div className="absolute inset-0 overflow-y-auto overflow-x-hidden">
          {mainContent}
        </div>
      )}
      {showChat && (
        <div className="absolute inset-0">
          <ChatInterface id={chatId} initialMessages={messages} />
        </div>
      )}
    </div>
  );
}
