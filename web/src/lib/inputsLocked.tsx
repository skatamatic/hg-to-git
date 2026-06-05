import { createContext, useContext, type ReactNode } from "react";

const InputsLockedContext = createContext(false);

/** True while a conversion/sync is running — inputs readonly, actions disabled. */
export function InputsLockedProvider({
  locked,
  children,
}: {
  locked: boolean;
  children: ReactNode;
}) {
  return (
    <InputsLockedContext.Provider value={locked}>
      {children}
    </InputsLockedContext.Provider>
  );
}

export function useInputsLocked(): boolean {
  return useContext(InputsLockedContext);
}
