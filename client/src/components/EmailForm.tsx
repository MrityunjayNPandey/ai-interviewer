import { useMutation } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { API_BASE_URL } from "../App";

const startInterviewMutationFn = async (email: string) => {
  const payload = { emailId: email };
  const response = await fetch(`${API_BASE_URL}/startInterview`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response
      .json()
      .catch(() => ({ message: "An error occurred" }));
    throw new Error(
      errorData.message || `HTTP error! status: ${response.status}`
    );
  }
  return response.json();
};

function EmailForm() {
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const navigate = useNavigate();

  const mutation = useMutation({
    mutationFn: startInterviewMutationFn,
    onSuccess: (data) => {
      if (data.createInterview) {
        navigate("/details", { state: { email } });
      } else {
        navigate("/interview", { state: { email } });
      }
    },
    onError: (error) => {
      console.error("Failed to start interview:", error);
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!email.trim()) {
      setFormError("Please enter your email.");
      return;
    }

    mutation.mutate(email);
  };

  return (
    <form onSubmit={handleSubmit}>
      <h2>Enter Your Email</h2>
      {formError && <p style={{ color: "orange" }}>{formError}</p>}

      {mutation.isError && (
        <p style={{ color: "red" }}>
          Error:{" "}
          {mutation.error instanceof Error
            ? mutation.error.message
            : "An unknown error occurred"}
        </p>
      )}

      <div>
        <label htmlFor="email">Email:</label>
        <input
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={mutation.isPending}
        />
      </div>
      <button type="submit" disabled={mutation.isPending}>
        {mutation.isPending ? "Starting..." : "Next"}
      </button>
    </form>
  );
}

export default EmailForm;
