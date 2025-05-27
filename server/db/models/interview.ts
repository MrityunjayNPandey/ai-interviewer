import mongoose from "mongoose";

const InterviewSchema = new mongoose.Schema({
  emailId: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ["ongoing", "completed"],
    default: "ongoing",
  },
  feedback: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("HelpRequest", InterviewSchema);
