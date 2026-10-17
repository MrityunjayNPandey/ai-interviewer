import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { api } from "./client";
import { queryKeys, rememberInterview } from "./queries";
import type { InterviewView } from "./types";

/** Starts a new interview with the same setup, then opens it. */
export function usePractiseAgain() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (id: string) => api.post<{ interview: InterviewView }>(`/interviews/${id}/retake`).then((res) => res.interview),
    onSuccess: (interview) => {
      rememberInterview(queryClient, interview);
      navigate(`/interviews/${interview.id}`);
    },
  });
}

export function useDeleteInterview({ redirectTo }: { redirectTo?: string } = {}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/interviews/${id}`),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: queryKeys.interview(id), exact: true });
      void queryClient.invalidateQueries({ queryKey: queryKeys.interviews, exact: true });
      if (redirectTo) navigate(redirectTo);
    },
  });
}
