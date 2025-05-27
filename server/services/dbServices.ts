import mongoose from "mongoose";
import interviewContextModel from "../db/models/interviewContextModel";
import interviewModel from "../db/models/interviewModel";
import { gptContext } from "../server";

export const getGPTContext = async (emailId: string) => {
  const interview = await interviewModel
    .findOne({ emailId })
    .sort({ createdAt: -1 });

  if (!interview || interview.status === "completed") {
    return { gptContext: [], interview: null };
  }

  let gptContext: any = [];

  const interviewContexts = await interviewContextModel
    .find({ interviewId: interview?._id })
    .sort({ sequenceId: 1 });

  interviewContexts.forEach((context) => {
    gptContext.push({
      role: context.role,
      content: context.content,
    });
  });

  return { gptContext, interview };
};

export const insertGptContexts = async (
  gptContext: gptContext[],
  interviewId: mongoose.Types.ObjectId
) => {
  const currentTime = new Date();
  await interviewContextModel.insertMany(
    gptContext.map((context, index) => {
      return {
        interviewId,
        content: context.content,
        sequenceId: index + currentTime.getTime(),
        role: context.role,
      };
    })
  );
  return true;
};
