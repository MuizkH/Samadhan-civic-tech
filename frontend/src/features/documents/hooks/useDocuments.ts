import { useState, useEffect, useCallback } from "react";
import { documentService } from "../services/documentService";
import { DocumentLockerDetails } from "@/shared/types/domain/Document";
import { UploadProgressStep, UserDocument } from "../types";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { subscribeToTable } from "@/shared/mock/mockLocalStore";
import { logger } from "@/shared/services/logger";

import { generateDocumentNotifications } from "../services/documentNotificationGenerator";
import { getErrorMessage } from "@/shared/lib/errorMessage";

export function useDocuments() {
  const { user } = useAuth();
  const [lockerDetails, setLockerDetails] = useState<DocumentLockerDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadStep, setUploadStep] = useState<UploadProgressStep>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);

  const fetchLockerDetails = useCallback(async () => {
    if (!user) return;
    try {
      const data = await documentService.getLockerDetails(user.id);
      setLockerDetails(data);
      setError(null);
    } catch (err) {
      logger.error("Failed to load locker details:", err);
      setError(getErrorMessage(err, "Failed to load locker documents"));
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Load locker details and subscribe to real-time updates
  useEffect(() => {
    if (!user) {
      setLockerDetails(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetchLockerDetails();

    const unsubscribe = subscribeToTable<UserDocument>("user_documents", (event) => {
      if (event?.new?.user_id === user.id || event?.old?.user_id === user.id) {
        fetchLockerDetails();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user, fetchLockerDetails]);

  // Trigger notification generation when locker details change
  useEffect(() => {
    if (lockerDetails) {
      generateDocumentNotifications(lockerDetails.documents);
    }
  }, [lockerDetails]);

  // Simulated upload progress percent for UI feedback
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (uploadStep === "uploading") {
      setUploadProgress(10);
      interval = setInterval(() => {
        setUploadProgress((p) => Math.min(p + 3, 28));
      }, 150);
    } else if (uploadStep === "reading") {
      setUploadProgress(30);
      interval = setInterval(() => {
        setUploadProgress((p) => Math.min(p + 2, 48));
      }, 200);
    } else if (uploadStep === "extracting") {
      setUploadProgress(50);
      interval = setInterval(() => {
        setUploadProgress((p) => Math.min(p + 2, 68));
      }, 250);
    } else if (uploadStep === "checking") {
      setUploadProgress(70);
      interval = setInterval(() => {
        setUploadProgress((p) => Math.min(p + 1, 82));
      }, 100);
    } else if (uploadStep === "summarizing") {
      setUploadProgress(85);
      interval = setInterval(() => {
        setUploadProgress((p) => Math.min(p + 1, 93));
      }, 150);
    } else if (uploadStep === "saving") {
      setUploadProgress(95);
      interval = setInterval(() => {
        setUploadProgress((p) => Math.min(p + 1, 98));
      }, 100);
    } else if (uploadStep === "complete") {
      setUploadProgress(100);
      setTimeout(() => {
        setUploadStep("idle");
        setUploadProgress(0);
      }, 1000);
    } else if (uploadStep === "idle") {
      setUploadProgress(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [uploadStep]);

  /**
   * Triggers the upload & analysis process of a document.
   */
  const uploadDocument = async (file: File): Promise<void> => {
    if (!user) {
      throw new Error("You must be logged in to upload documents.");
    }
    try {
      await documentService.uploadAndAnalyze(user.id, file, setUploadStep);
    } catch (err) {
      setUploadStep("idle");
      setUploadProgress(0);
      logger.error("Failed to upload document:", err);
      throw err;
    }
  };

  /**
   * Deletes a document by ID and its storage path.
   */
  const deleteDocument = async (id: string, filePath: string): Promise<void> => {
    try {
      await documentService.deleteDocument(id, filePath);
    } catch (err) {
      logger.error("Failed to delete document:", err);
      throw err;
    }
  };

  /**
   * Fetches a temporary signed download URL for a document.
   */
  const getDownloadUrl = async (filePath: string): Promise<string> => {
    return documentService.getDownloadUrl(filePath);
  };

  return {
    lockerDetails,
    loading,
    error,
    uploadStep,
    uploadProgress,
    uploadDocument,
    deleteDocument,
    getDownloadUrl,
    refreshLocker: fetchLockerDetails,
  };
}
