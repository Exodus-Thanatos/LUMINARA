import { useEffect, useState } from 'react';

// Current time, refreshed every `ms`. Used for "updated N s ago" labels.
export const useNow = (ms = 1000) => {
  const [n, setN] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setN(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
};
