import { createContext, useContext, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

const Basket = createContext(null);

// In-memory, scoped to the current signed-in admin. Survives route changes,
// but does not leave privileged market data in browser storage.
export function MatchShareBasketProvider({ children }) {
  const { user } = useAuth();
  const owner = user?.is_admin ? user.id : null;
  const [state, setState] = useState({ owner: null, items: [] });
  useEffect(() => {
    setState(previous => previous.owner === owner ? previous : { owner, items: [] });
  }, [owner]);
  const items = owner && owner === state.owner ? state.items : [];
  const change = fn => {
    if (owner) setState(previous => ({ owner, items: fn(previous.owner === owner ? previous.items : []) }));
  };
  return <Basket.Provider value={owner ? { items, change } : null}>{children}</Basket.Provider>;
}

export function useMatchShareBasket() { return useContext(Basket); }
