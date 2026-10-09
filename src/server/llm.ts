// Server only. Small model calls used by the chat route; not a 'use server' file, so they are
// not public actions that anyone could call on the deployer's model key.
import { generateText } from 'ai';

import { defaultModel } from '@/ai/providers';

export async function generateTitleFromUserMessage({
  message,
}: {
  message: string;
}) {
  const { text: title } = await generateText({
    model: defaultModel,
    system: `\n
        - you will generate a short title based on the first message a user begins a conversation with
        - ensure it is not more than 80 characters long
        - the title should be a summary of the user's message
        - do not use quotes or colons`,
    prompt: JSON.stringify(message),
  });

  return title;
}

export async function convertUserResponseToBoolean(message: string) {
  const { text: rawBool } = await generateText({
    model: defaultModel,
    system: `\n
      - you will generate a boolean response based on a user's message content
      - only return true or false
      - if an explicit affirmative response cannot be determined, return false`,
    prompt: message,
  });

  return rawBool === 'true';
}
