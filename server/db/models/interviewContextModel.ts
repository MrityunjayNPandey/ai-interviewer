import mongoose from "mongoose";

const InterviewContextSchema = new mongoose.Schema({
  interviewId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  content: {
    type: String,
    required: true,
  },
  sequenceId: {
    type: Number,
    required: true,
  },
  role: {
    type: String,
    required: true,
  },
});

export default mongoose.model("InterviewContext", InterviewContextSchema);
