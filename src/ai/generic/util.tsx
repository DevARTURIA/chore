import 'server-only';
import { z } from 'zod';

export const utilTools = {
  askForConfirmation: {
    description:
      'Confirm the execution of a function on behalf of the user. For a move of funds, pass the tool name and its exact arguments: the app builds the review from them.',
    parameters: z.object({
      message: z
        .string()
        .describe('One line saying what will happen, for the record'),
      tool: z
        .string()
        .optional()
        .describe('The tool that will run after confirmation'),
      args: z
        .record(z.any())
        .optional()
        .describe('The exact arguments that tool will be called with'),
    }),
  },
};
