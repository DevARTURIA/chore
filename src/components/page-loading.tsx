'use client';

import { AgentEye } from './agent-eye';

export default function PageLoading() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-background"
      role="status"
      aria-label="Loading"
    >
      <AgentEye etat="lit" size={48} />
    </div>
  );
}
