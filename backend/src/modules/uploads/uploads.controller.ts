import { Router } from "express";
import { v2 as cloudinary } from "cloudinary";
import { authenticate } from "../../shared/middleware/authenticate.js";
import { env } from "../../config/env.js";

export const uploadsRouter = Router();

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

/**
 * Returns signed params for a direct-to-Cloudinary upload from the browser.
 * The API secret never leaves the server; the client uses these params to
 * POST the file straight to Cloudinary.
 */
uploadsRouter.post("/signature", authenticate, (req, res) => {
  const timestamp = Math.round(Date.now() / 1000);
  const folder = `samadhan/${req.auth!.sub}`;
  const paramsToSign = { timestamp, folder };

  const signature = cloudinary.utils.api_sign_request(paramsToSign, env.CLOUDINARY_API_SECRET);

  res.json({
    timestamp,
    folder,
    signature,
    apiKey: env.CLOUDINARY_API_KEY,
    cloudName: env.CLOUDINARY_CLOUD_NAME,
  });
});
