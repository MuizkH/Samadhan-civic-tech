import { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { AppError } from "../errors/AppError.js";
import { logger } from "../lib/logger.js";

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    if (err.statusCode >= 500) logger.error({ err }, "Unhandled app error");
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid request", details: err.flatten() },
    });
    return;
  }

  logger.error({ err }, "Unexpected error");
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
};
