import mongoose from "mongoose";

const InterviewContextSchema = new mongoose.Schema({
  interviewId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
  },
  context: {
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

module.exports = mongoose.model("KnowledgeBase", InterviewContextSchema);
