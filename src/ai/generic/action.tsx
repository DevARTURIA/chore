import 'server-only';
import { z } from 'zod';

import { NO_CONFIRMATION_MESSAGE } from '@/lib/constants';
import { verifyUser } from '@/server/actions/user';
import { dbCreateAction } from '@/server/db/queries';

const createActionTool = {
  description:
    'Create an action in the database (requires confirmation). Do proper checks if the action requires additional setup before creating an action',
  parameters: z.object({
    requiresConfirmation: z.boolean().optional().default(true),
    userId: z.string().describe('User that the action belongs to'),
    conversationId: z
      .string()
      .describe('Conversation that the action belongs to'),
    name: z
      .string()
      .describe('Shorthand human readable name to classify the action.'),
    description: z
      .string()
      .describe(
        'Action description to display as the main content. Should not contain the frequency or max executions',
      ),
    frequency: z
      .number()
      .describe(
        'Frequency in seconds (3600 for hourly, 86400 for daily, or any custom intervals of 15 minutes (900))',
      ),
    maxExecutions: z
      .number()
      .optional()
      .describe('Max number of times the action can be executed'),
    startTimeOffset: z
      .number()
      .optional()
      .describe(
        'Offset in milliseconds for how long to wait before starting the action. Useful for scheduling actions in the future, e.g. 1 hour from now = 3600000',
      ),
  }),
  execute: async function (
    params: z.infer<typeof this.parameters>,
  ): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const authResult = await verifyUser();
      const userId = authResult?.data?.data?.id;

      if (!userId || userId !== params.userId) {
        return { success: false, error: 'Unauthorized' };
      }

      console.log('action params');
      console.dir(params);

      const action = await dbCreateAction({
        userId,
        conversationId: params.conversationId,
        name: params.name,
        description: `${params.description}${NO_CONFIRMATION_MESSAGE}`,
        actionType: 'default',
        frequency: params.frequency,
        maxExecutions: params.maxExecutions ?? null,
        triggered: true,
        paused: false,
        completed: false,
        priority: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        triggeredBy: [],
        stoppedBy: [],
        params: {},
        timesExecuted: 0,
        lastExecutedAt: null,
        lastFailureAt: null,
        lastSuccessAt: null,
        startTime: params.startTimeOffset
          ? new Date(Date.now() + params.startTimeOffset)
          : null,
      });

      if (!action) {
        return { success: false, error: 'Failed to create action' };
      }

      return { success: true, data: action };
    } catch (error: any) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error creating action',
      };
    }
  },
};

export const actionTools = {
  createAction: createActionTool,
};
