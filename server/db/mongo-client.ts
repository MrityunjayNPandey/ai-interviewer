import mongoose, { Connection } from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const uri: string = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/ai-interviewer";
let connection: Connection;

async function connectToDatabase(): Promise<void> {
  try {
    connection = (await mongoose.connect(uri)).connection;
    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}

process.on("SIGINT", async () => {
  if (mongoose.connection.readyState === 1) {
    try {
      await mongoose.connection.close();
      console.log("MongoDB connection closed successfully");
      process.exit(0);
    } catch (error) {
      console.error("Error closing MongoDB connection:", error);
      process.exit(1);
    }
  } else {
    process.exit(0); // Exit if not connected
  }
});

export { connectToDatabase };
