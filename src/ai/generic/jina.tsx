import 'server-only';
import { z } from 'zod';

// Components

// Tools Export
export const jinaTools = {
  readWebPage: {
    description:
      'Convert any web page into a clean, readable text format that can be easily understood by AI models.',
    parameters: z.object({
      url: z
        .string()
        .url()
        .describe('The URL of the web page to read and convert to text'),
    }),
    requiredEnvVars: ['JINA_API_KEY'],
    execute: async ({ url }: { url: string }) => {
      try {
        const response = await fetch(`https://r.jina.ai/${url}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${process.env.JINA_API_KEY}`,
            'X-Retain-Images': 'none',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to read web page: ${response.statusText}`);
        }

        const content = await response.text();
        return {
          data: {
            content,
            url,
          },
        };
      } catch (error) {
        throw new Error(
          `Failed to read web page: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
        );
      }
    },
  },
};
