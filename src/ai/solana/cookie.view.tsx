import CookieAgent from '@/components/cookie-fun/cookie-agent';
import CookieTweet from '@/components/cookie-fun/cookie-tweet';
import type { AgentData, TweetData } from '@/server/actions/cookie';

export const cookieToolViews = {
  getAgentDetailsFromAddress: {
    displayName: 'Agent Info',
    isCollapsible: true,
    isExpandedByDefault: true,
    render: (result: unknown) => {
      const typedResult = result as {
        success: boolean;
        data?: AgentData;
        error?: string;
      };

      if (!typedResult.success || !typedResult.data) {
        return (
          <div className="relative overflow-hidden rounded-2xl bg-destructive/5 p-4">
            <div className="flex items-center gap-3">
              <p className="text-sm text-destructive">
                Error: {typedResult.error}
              </p>
            </div>
          </div>
        );
      }

      return <CookieAgent agentData={typedResult.data} />;
    },
  },
  getAgentFromSearch: {
    displayName: 'Agent Info',
    isCollapsible: true,
    isExpandedByDefault: true,
    render: (result: unknown) => {
      const typedResult = result as {
        success: boolean;
        data?: AgentData;
        error?: string;
      };

      if (!typedResult.success || !typedResult.data) {
        return (
          <div className="relative overflow-hidden rounded-2xl bg-destructive/5 p-4">
            <div className="flex items-center gap-3">
              <p className="text-sm text-destructive">
                Error: {typedResult.error}
              </p>
            </div>
          </div>
        );
      }

      return <CookieAgent agentData={typedResult.data} />;
    },
  },
  getTrendingAgents: {
    displayName: 'Trending Agents',
    isCollapsible: true,
    isExpandedByDefault: true,
    render: (result: unknown) => {
      const typedResult = result as {
        success: boolean;
        data?: AgentData[];
        error?: string;
      };

      if (!typedResult.success || !typedResult.data) {
        return (
          <div className="relative overflow-hidden rounded-2xl bg-destructive/5 p-4">
            <div className="flex items-center gap-3">
              <p className="text-sm text-destructive">
                Error: {typedResult.error}
              </p>
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {typedResult.data.map((agent) => (
            <CookieAgent key={agent.agentName} agentData={agent} />
          ))}
        </div>
      );
    },
  },
  searchTweets: {
    displayName: 'X Search',
    isCollapsible: true,
    isExpandedByDefault: true,
    render: (result: unknown) => {
      const typedResult = result as {
        success: boolean;
        data?: TweetData[];
        error?: string;
      };

      if (!typedResult.success || !typedResult.data) {
        return (
          <div className="relative overflow-hidden rounded-2xl bg-destructive/5 p-4">
            <div className="flex items-center gap-3">
              <p className="text-sm text-destructive">
                Error: {typedResult.error}
              </p>
            </div>
          </div>
        );
      }

      return (
        <div className="space-y-2">
          {typedResult.data.map((tweet, index) => (
            <CookieTweet key={index} tweetData={tweet} />
          ))}
        </div>
      );
    },
  },
};
