import { createContext, useContext } from "react";
export const NavigationContext = createContext({ push: (_path: string) => {}, replace: (_path: string) => {}, refresh: () => {} });
export function useRouter() { return useContext(NavigationContext); }
