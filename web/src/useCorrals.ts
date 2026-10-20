import { useEffect, useState } from 'react';
import type { Corral, ServerEvent } from '@droverstatus/shared';
import { openEvents } from './api';

export function applyEvent(prev: Map<string, Corral>, e: ServerEvent): Map<string, Corral> {
  if (e.type === 'snapshot') return new Map(e.corrals.map((c) => [c.hid, c]));
  const next = new Map(prev);
  if (e.type === 'corral-updated') next.set(e.hid, e.corral);
  else next.delete(e.hid);
  return next;
}

export function useCorrals(onEvent?: (prev: Map<string, Corral>, e: ServerEvent) => void) {
  const [corrals, setCorrals] = useState<Map<string, Corral>>(new Map());
  const [connected, setConnected] = useState(false);
  useEffect(
    () =>
      openEvents(
        (e) =>
          setCorrals((prev) => {
            onEvent?.(prev, e);
            return applyEvent(prev, e);
          }),
        setConnected,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return { corrals, connected };
}
