import { ExternalLink } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { BOT_NOT_STARTED_ERROR, MISSING_USERNAME_ERROR } from '@/lib/constants';

interface TelegramResult {
  success: boolean;
  data?: string;
  error?: string;
  botId?: string;
  noFollowUp?: boolean;
}

function renderTelegramResponse({
  success,
  error,
  botId,
  successTitle,
  successMessage,
}: {
  success: boolean;
  error?: string;
  botId?: string;
  successTitle: string;
  successMessage: string;
}) {
  if (!success && error === MISSING_USERNAME_ERROR) {
    return (
      <Card className="bg-card p-6">
        <h2 className="mb-1 text-xl font-semibold text-card-foreground">
          Missing Telegram Username
        </h2>
        <p className="text-sm text-muted-foreground">
          Please provide a Telegram username.
        </p>
      </Card>
    );
  }

  if (!success && error === BOT_NOT_STARTED_ERROR) {
    return (
      <Card className="bg-card p-6">
        <h2 className="mb-1 text-xl font-semibold text-card-foreground">
          Bot Not Started
        </h2>
        <div className="space-y-3 text-sm text-muted-foreground">
          <p>
            You need to start the bot before using Telegram notifications. Try
            sending /start again so we can sync your chat ID
          </p>
          <p className="flex items-center gap-1">
            <span>Click here to start:</span>
            <a
              href={`https://t.me/${botId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center rounded-md font-medium underline hover:text-primary"
            >
              @{botId}
              <ExternalLink className="ml-1 inline-block h-3 w-3" />
            </a>
          </p>
        </div>
      </Card>
    );
  }

  if (!success) {
    return (
      <Card className="bg-card p-6">
        <h2 className="mb-1 text-xl font-semibold text-destructive">Error</h2>
        <p className="text-sm text-muted-foreground">{error}</p>
      </Card>
    );
  }

  return (
    <Card className="bg-card p-6">
      <h2 className="mb-1 text-xl font-semibold text-card-foreground">
        {successTitle}
      </h2>
      {successMessage && (
        <p className="text-sm text-muted-foreground">{successMessage}</p>
      )}
    </Card>
  );
}

export const telegramToolViews = {
  verifyTelegramSetup: {
    displayName: 'Verify Telegram Setup',
    isCollapsible: true,
    isExpandedByDefault: true,
    render: (result: unknown) => {
      const r = result as TelegramResult;
      return renderTelegramResponse({
        success: r.success,
        error: r.error,
        botId: r.botId,
        successTitle: 'Setup Verified ✅',
        successMessage: 'Your Telegram setup is valid.',
      });
    },
  },

  sendTelegramNotification: {
    displayName: 'Send Telegram Notification',
    isCollapsible: true,
    isExpandedByDefault: true,
    render: (result: unknown) => {
      const r = result as TelegramResult;
      return renderTelegramResponse({
        success: r.success,
        error: r.error,
        botId: r.botId,
        successTitle: 'Telegram Notification Sent ✅',
        successMessage: `Check your Telegram for a message from ${r.botId}`,
      });
    },
  },
};
