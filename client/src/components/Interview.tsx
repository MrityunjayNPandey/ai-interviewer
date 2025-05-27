import { Button, Stack } from "@mui/material";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
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
      getQuestionFn(email)
        .then((data) => {
          setInterviewerMessage(data.question);
          setShowAnswerBox(true);
          setShowNextQuestionButton(false);
          setShowEndInterviewButton(false);
        })
        .catch((error) => {
          console.error("Error fetching question:", error);
          navigate("/");
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
      navigate("/");
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
      navigate("/");
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
    <div
      style={{
        padding: "2rem",
        maxWidth: "800px",
        margin: "auto",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
      }}
    >
      <h2
        style={{
          color: "#2c3e50",
          textAlign: "center",
          marginBottom: "2rem",
          fontSize: "2rem",
        }}
      >
        Interview Session
      </h2>

      {isLoading ? (
        <div style={{ textAlign: "center", margin: "2rem 0" }}>
          <p style={{ fontSize: "1.2rem" }}>Loading question...</p>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: "#f8f9fa",
            padding: "1.5rem",
            borderRadius: "8px",
            boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
          }}
        >
          <div
            style={{
              backgroundColor: "#e9ecef",
              padding: "1rem",
              borderRadius: "6px",
              marginBottom: "1.5rem",
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: "1.1rem",
                lineHeight: "1.5",
              }}
            >
              <strong style={{ color: "#2c3e50" }}>Interviewer:</strong>{" "}
              {interviewerMessage}
            </p>
          </div>

          {showAnswerBox && (
            <div style={{ marginTop: "1rem" }}>
              <textarea
                style={{
                  width: "100%",
                  padding: "0.8rem",
                  fontSize: "1rem",
                  borderRadius: "4px",
                  border: "1px solid #ced4da",
                  minHeight: "120px",
                  boxSizing: "border-box",
                }}
                placeholder="Type your answer here..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
              <br />
              <Stack direction={"row-reverse"}>
                <Button
                  sx={{
                    marginTop: "1rem",
                  }}
                  variant="contained"
                  onClick={handleAnswerSubmit}
                  disabled={answerMutation.isPending}
                >
                  Submit Answer
                </Button>
              </Stack>
            </div>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "1rem",
            }}
          >
            {showNextQuestionButton && (
              <Button
                onClick={handleNextQuestion}
                style={{
                  backgroundColor: "#28a745",
                  color: "white",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "1rem",
                  flex: 1,
                  marginRight: "0.5rem",
                }}
                disabled={isLoading}
              >
                Next Question
              </Button>
            )}

            {showEndInterviewButton && (
              <Button
                onClick={handleEndInterview}
                style={{
                  backgroundColor: "#dc3545",
                  color: "white",
                  padding: "0.5rem 1rem",
                  border: "none",
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontSize: "1rem",
                  flex: 1,
                }}
                disabled={endInterviewMutation.isPending}
              >
                End Interview
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default Interview;
