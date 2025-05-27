import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { API_BASE_URL } from "../App";

interface SubmitAnswerPayload {
  emailId: string;
  answer: string;
}

const getQuestionFn = async (email: string) => {
  const response = await fetch(`${API_BASE_URL}/getQuestion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emailId: email }),
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

const submitAnswerFn = async (payload: SubmitAnswerPayload) => {
  const response = await fetch(`${API_BASE_URL}/submitAnswer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

const endInterviewFn = async (email: string) => {
  const response = await fetch(`${API_BASE_URL}/endInterview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ emailId: email }),
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

function Interview() {
  const location = useLocation();
  const [interviewerMessage, setInterviewerMessage] = useState("");
  const [answer, setAnswer] = useState("");
  const [showAnswerBox, setShowAnswerBox] = useState(false);
  const [showNextQuestionButton, setShowNextQuestionButton] = useState(false);
  const [showEndInterviewButton, setShowEndInterviewButton] = useState(false);

  const { email } = location?.state ?? {};
  if (!email) {
    console.error("Email not found in location state.");
    return <Navigate to="/" />;
  }

  const { isLoading, refetch: fetchQuestion } = useQuery({
    queryKey: ["question"],
    queryFn: () =>
      getQuestionFn(email).then((data) => {
        setInterviewerMessage(data.question);
        setShowAnswerBox(true);
        setShowNextQuestionButton(false);
        setShowEndInterviewButton(false);
      }),
    enabled: true,
  });

  const answerMutation = useMutation({
    mutationFn: submitAnswerFn,
    onSuccess: (feedbackData) => {
      setInterviewerMessage(feedbackData.gptFeedback);
      setShowAnswerBox(false);
      setShowNextQuestionButton(true);
      setShowEndInterviewButton(true);
      setAnswer("");
    },
    onError: (error: Error) => {
      alert(`Error submitting answer: ${error.message}`);
    },
  });

  const endInterviewMutation = useMutation({
    mutationFn: () => endInterviewFn(email),
    onSuccess: (feedbackData) => {
      setInterviewerMessage(feedbackData.feedback);
      setShowAnswerBox(false);
      setShowNextQuestionButton(false);
      setShowEndInterviewButton(false);
    },
    onError: (error: Error) => {
      alert(`Error ending interview: ${error.message}`);
    },
  });

  const handleAnswerSubmit = () => {
    if (!answer.trim()) {
      alert("Answer cannot be empty.");
      return;
    }
    answerMutation.mutate({ emailId: email, answer });
  };

  const handleNextQuestion = () => {
    fetchQuestion();
  };

  const handleEndInterview = () => {
    endInterviewMutation.mutate();
  };

  return (
    <div style={{ padding: "2rem", maxWidth: "600px", margin: "auto" }}>
      <h2>Interview</h2>

      {isLoading ? (
        <p>Loading question...</p>
      ) : (
        <div>
          <p>
            <strong>Interviewer:</strong> {interviewerMessage}
          </p>

          {showAnswerBox && (
            <div style={{ marginTop: "1rem" }}>
              <textarea
                rows={5}
                cols={60}
                placeholder="Type your answer here..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
              <br />
              <button
                onClick={handleAnswerSubmit}
                disabled={answerMutation.isPending}
              >
                {answerMutation.isPending ? "Submitting..." : "Submit Answer"}
              </button>
            </div>
          )}

          {showNextQuestionButton && (
            <button onClick={handleNextQuestion} style={{ marginTop: "1rem" }}>
              Next Question
            </button>
          )}

          {showEndInterviewButton && (
            <button
              onClick={handleEndInterview}
              style={{
                marginTop: "1rem",
                marginLeft: "1rem",
                backgroundColor: "#dc3545",
                color: "white",
              }}
            >
              End Interview
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default Interview;
