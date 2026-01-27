import multer from "multer";
import type { Request } from "express";

// Configure multer to store files in memory
const storage = multer.memoryStorage();

// File filter to only accept PDF files
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (file.mimetype === "application/pdf") {
    cb(null, true);
  } else {
    cb(new Error("Only PDF files are allowed"));
  }
};

// Configure multer middleware
export const uploadPDF = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
}).single("pdf");
