import 'server-only';
import { z } from 'zod';

import {
  sendTelegramNotification,
  verifyTelegramSetupAction,
} from '@/server/actions/telegram';

export const telegramTools = {
  verifyTelegramSetup: {
    userId: null,
    description:
      'Verifies the users telegram setup before creating an action that sends a telegram notification.',
    parameters: z.object({
      username: z.string().optional(),
    }),
    requiredEnvVars: ['TELEGRAM_BOT_USERNAME'],
    execute: async function ({ username }: { username?: string }) {
      try {
        const response = await verifyTelegramSetupAction({
          username,
          userId: this.userId || undefined,
        });
        if (!response?.data?.data) {
          return { success: false, error: 'No response from Telegram action' };
        }
        if (!response.data.success) {
          return {
            success: false,
            error: response.data.error,
            botId: response.data.data?.botId,
          };
        }
        return { success: true, data: 'Telegram setup verified' };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Verification failed',
        };
      }
    },
  },

  sendTelegramNotification: {
    userId: null,
    description:
      'Sends a Telegram message. Requires a Telegram username to be passed in or saved in the database. Run verifyTelegramSetup before this tool to ensure proper setup.',
    parameters: z.object({
      username: z.string().optional(),
      message: z.string(),
    }),
    requiredEnvVars: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_BOT_USERNAME'],
    execute: async function ({
      username,
      message,
    }: {
      username?: string;
      message: string;
    }) {
      try {
        const response = await sendTelegramNotification({
          username,
          userId: this.userId || undefined,
          text: message,
        });
        if (!response?.data?.data) {
          return { success: false, error: 'No response from Telegram action' };
        }
        const { success, error, botId } = response.data.data;
        if (!success) {
          return { success, error, botId };
        }
        return {
          success: true,
          data: 'Notification sent successfully',
          noFollowUp: true,
          botId,
        };
      } catch (err) {
        return {
          success: false,
          error:
            err instanceof Error ? err.message : 'Failed to send notification',
        };
      }
    },
  },
};
