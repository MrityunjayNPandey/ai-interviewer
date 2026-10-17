import {
  startAuthentication,
  startRegistration,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { botCheckHeaders } from "./botCheck";
import { api } from "./client";
import { queryKeys } from "./queries";
import type { AccountStatus } from "./types";

export function useAccount() {
  return useQuery({ queryKey: queryKeys.account, queryFn: () => api.get<AccountStatus>("/account") });
}

export const isHistorySaved = (status: AccountStatus | undefined) => !!status && (status.passkeys > 0 || status.hasRecoveryCode);

/** The person closed or declined the browser's passkey prompt: not an error worth showing. */
export const isPasskeyCancelled = (error: unknown) => error instanceof Error && error.name === "NotAllowedError";

function useSetStatus() {
  const queryClient = useQueryClient();
  return (status: AccountStatus) => queryClient.setQueryData(queryKeys.account, status);
}

/** This browser now belongs to another candidate id: everything cached is theirs to refetch. */
function useSwitchedBrowser() {
  const queryClient = useQueryClient();
  return () => queryClient.resetQueries();
}

export function useSavePasskey() {
  const setStatus = useSetStatus();
  return useMutation({
    mutationFn: async () => {
      const optionsJSON = await api.post<PublicKeyCredentialCreationOptionsJSON>("/account/passkeys/options");
      return api.post<AccountStatus>("/account/passkeys", await startRegistration({ optionsJSON }));
    },
    onSuccess: setStatus,
  });
}

export function useCreateRecoveryCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ code: string }>("/account/recovery-code").then((res) => res.code),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: queryKeys.account }),
  });
}

export function useRestoreWithPasskey() {
  const switched = useSwitchedBrowser();
  return useMutation({
    mutationFn: async () => {
      const optionsJSON = await api.post<PublicKeyCredentialRequestOptionsJSON>("/account/sign-in/options");
      return api.post<AccountStatus>("/account/sign-in", await startAuthentication({ optionsJSON }));
    },
    onSuccess: switched,
  });
}

export function useRestoreWithCode() {
  const switched = useSwitchedBrowser();
  return useMutation({
    mutationFn: async (code: string) => api.post<AccountStatus>("/account/recover", { code }, await botCheckHeaders()),
    onSuccess: switched,
  });
}

export function useSignOut() {
  const switched = useSwitchedBrowser();
  return useMutation({
    mutationFn: () => api.post<void>("/account/sign-out"),
    onSuccess: switched,
  });
}
