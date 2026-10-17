import { useQuery, type QueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { InterviewSummary, InterviewView, ModelOption } from "./types";

export const queryKeys = {
  models: ["models"] as const,
  account: ["account"] as const,
  interviews: ["interviews"] as const,
  interview: (id: string) => ["interviews", id] as const,
};

export function useModels() {
  return useQuery({
    queryKey: queryKeys.models,
    queryFn: () => api.get<{ models: ModelOption[] }>("/models").then((res) => res.models),
    staleTime: 5 * 60_000,
  });
}

export function useInterviews() {
  return useQuery({
    queryKey: queryKeys.interviews,
    queryFn: () => api.get<{ interviews: InterviewSummary[] }>("/interviews").then((res) => res.interviews),
  });
}

export function useInterview(id: string) {
  return useQuery({
    queryKey: queryKeys.interview(id),
    queryFn: () => api.get<{ interview: InterviewView }>(`/interviews/${id}`).then((res) => res.interview),
  });
}

/** Stores a fresh copy of an interview and marks the history list stale. */
export function rememberInterview(queryClient: QueryClient, interview: InterviewView) {
  queryClient.setQueryData(queryKeys.interview(interview.id), interview);
  void queryClient.invalidateQueries({ queryKey: queryKeys.interviews, exact: true });
}
