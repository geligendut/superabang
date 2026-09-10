'use client';

import { useEffect, useState } from 'react';
import WorkoutSessionRunner from '@/src/ui/WorkoutSessionRunner';

export default function WorkoutSessionPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const [sessionId, setSessionId] = useState('');
  useEffect(() => { void params.then(value => setSessionId(value.sessionId)); }, [params]);
  return sessionId
    ? <WorkoutSessionRunner sessionId={sessionId} />
    : <main><div className="card">Opening local workout…</div></main>;
}
