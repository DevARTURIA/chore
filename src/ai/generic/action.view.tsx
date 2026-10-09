import { ActionEmitter } from '@/components/action-emitter';
import { Card } from '@/components/ui/card';
import { NO_CONFIRMATION_MESSAGE } from '@/lib/constants';

interface CreateActionResultProps {
  id: string;
  description: string;
  frequency: number;
  maxExecutions: number | null;
  startTime: number | null;
}

function getFrequencyLabel(frequency: number): string {
  if (frequency === 3600) return 'Hourly';
  if (frequency === 86400) return 'Daily';
  if (frequency === 604800) return 'Weekly';
  if (frequency === 2592000) return 'Monthly'; // Approx. 30 days
  if (frequency < 3600) {
    const minutes = Math.floor(frequency / 60);
    return `Every ${minutes} Minute${minutes > 1 ? 's' : ''}`;
  } else if (frequency < 86400) {
    const hours = Math.floor(frequency / 3600);
    return `Every ${hours} Hour${hours > 1 ? 's' : ''}`;
  } else {
    const days = Math.floor(frequency / 86400);
    return `Every ${days} Day${days > 1 ? 's' : ''}`;
  }
}

function getNextExecutionTime(startTime: number | null): string {
  if (startTime) {
    return new Date(startTime).toLocaleString();
  }

  // Set to the next minute interval
  const nextMinute = new Date();
  nextMinute.setMilliseconds(0); // Reset milliseconds
  nextMinute.setSeconds(0); // Reset seconds

  const currentMinutes = nextMinute.getMinutes();
  nextMinute.setMinutes(currentMinutes + 1); // Move to the next minute

  return nextMinute.toLocaleString();
}

function CreateActionResult({
  id,
  description,
  frequency,
  maxExecutions,
  startTime,
}: CreateActionResultProps) {
  const frequencyLabel = getFrequencyLabel(frequency);
  const nextExecution = getNextExecutionTime(startTime);

  return (
    <Card className="bg-card p-6">
      <h2 className="mb-4 text-xl font-semibold text-card-foreground">
        Action Created Successfully! ⚡
      </h2>

      <div className="space-y-4">
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="text-sm font-medium text-muted-foreground">
            Description
          </div>
          <div className="mt-1 text-base font-semibold">
            {description.replace(NO_CONFIRMATION_MESSAGE, '')}
          </div>
        </div>

        <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-sm">
          <div className="flex justify-between">
            <span className="font-medium text-muted-foreground">Frequency</span>
            <span>{frequencyLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="mr-2 font-medium text-muted-foreground">
              Next Execution
            </span>
            <span className="ml-2">{nextExecution}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-medium text-muted-foreground">
              Max Executions
            </span>
            <span>{maxExecutions !== null ? maxExecutions : 'Unlimited'}</span>
          </div>
        </div>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          Action ID: {id}
        </div>
      </div>
    </Card>
  );
}

const createActionTool = {
  displayName: 'Create Action',
  render: (result: unknown) => {
    const typedResult = result as {
      success: boolean;
      data?: any;
      error?: string;
    };

    if (!typedResult.success) {
      return (
        <Card className="bg-destructive/10 p-6">
          <h2 className="mb-2 text-xl font-semibold text-destructive">
            Action Creation Failed
          </h2>
          <pre className="text-sm text-destructive/80">
            {JSON.stringify(typedResult, null, 2)}
          </pre>
        </Card>
      );
    }

    const { id, description, frequency, maxExecutions, startTime } =
      typedResult.data as {
        id: string;
        description: string;
        frequency: number;
        maxExecutions: number | null;
        startTime: number | null;
      };

    return (
      <>
        <ActionEmitter actionId={id} />
        <CreateActionResult
          id={id}
          description={description}
          frequency={frequency}
          maxExecutions={maxExecutions}
          startTime={startTime}
        />
      </>
    );
  },
};

export const actionToolViews = {
  createAction: createActionTool,
};
