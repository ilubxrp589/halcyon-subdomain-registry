"use client";

import { createContext, useContext, useState, useEffect } from "react";

const API_V2 = `${process.env.NEXT_PUBLIC_API_URL || "/api/proxy"}/v2/indexer`;

interface TldMatchContextValue {
  /** O(1) check if a domain name is an HSR-supported TLD */
  isHsrTld: (name: string) => boolean;
  loading: boolean;
}

const TldMatchContext = createContext<TldMatchContextValue>({
  isHsrTld: () => false,
  loading: true,
});

export function useTldMatch() {
  return useContext(TldMatchContext);
}

export function TldMatchProvider({ children }: { children: React.ReactNode }) {
  const [tldSet, setTldSet] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_V2}/tld-list`)
      .then((res) => res.json())
      .then((data: { tlds: string[] }) => {
        setTldSet(new Set(data.tlds.map((t) => t.toLowerCase())));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isHsrTld = (name: string) => tldSet.has(name.toLowerCase());

  return (
    <TldMatchContext.Provider value={{ isHsrTld, loading }}>
      {children}
    </TldMatchContext.Provider>
  );
}
