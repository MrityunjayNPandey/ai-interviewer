import type { FormEvent } from "react";
import { useEffect, useState } from "react";

interface InterviewProps {
  email: string;
  jobDescription: string;
  resume: string;
}

interface Message {
  sender: "ai" | "user";
  text: string;
}

function Interview({ email, jobDescription, resume }: InterviewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Simulate fetching the first question
  useEffect(() => {
    // In a real app, you'd make an API call here to start the interview
    // using email, jobDescription, and resume.
    setIsLoading(true);
    setTimeout(() => {
      setMessages([
        {
          sender: "ai",
          text: "Hello! Thanks for providing your details. What is your greatest strength?",
        },
      ]);
      setIsLoading(false);
    }, 1000);
  }, [email, jobDescription, resume]);

  const handleAnswerSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!currentAnswer.trim()) return;

    const userAnswer: Message = { sender: "user", text: currentAnswer };
    setMessages((prev) => [...prev, userAnswer]);
    setCurrentAnswer("");
    setIsLoading(true);

    // Simulate AI responding
    // In a real app, send userAnswer.text to your backend and get the next question
    setTimeout(() => {
      // This is a placeholder for the AI's next question
      const aiResponse: Message = {
        sender: "ai",
        text: "Interesting. Can you tell me about a time you faced a challenge?",
      };
      setMessages((prev) => [...prev, aiResponse]);
      setIsLoading(false);
    }, 1500);
  };

  return (
    <div>
      <h2>Interview Session</h2>
      <div className="chat-log">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.sender}`}>
            <p>
              <strong>{msg.sender === "ai" ? "AI Interviewer" : "You"}:</strong>{" "}
              {msg.text}
            </p>
          </div>
        ))}
        {isLoading && <p>AI is thinking...</p>}
      </div>
      <form onSubmit={handleAnswerSubmit}>
        <textarea
          value={currentAnswer}
          onChange={(e) => setCurrentAnswer(e.target.value)}
          placeholder="Type your answer..."
          rows={3}
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}

export default Interview;
