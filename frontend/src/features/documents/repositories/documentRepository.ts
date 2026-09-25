// TEMPORARY — backend pending (Phase 2)
// Backed by the localStorage mock store instead of a real database + object storage.
// Uploaded files are kept only as in-memory object URLs — they will not
// persist across a page reload until the real backend lands.

import { mockTable } from "@/shared/mock/mockLocalStore";
import { UserDocument } from "../types";
import { logger } from "@/shared/services/logger";

const TABLE = "user_documents";

export const documentRepository = {
  /**
   * Fetches all documents belonging to the authenticated user.
   */
  async fetchUserDocuments(userId: string): Promise<UserDocument[]> {
    const all = mockTable.getAll<UserDocument>(TABLE);
    return all
      .filter((d) => d.user_id === userId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  /**
   * Stores the physical file as an in-memory object URL standing in for
   * private object storage.
   */
  async uploadDocumentFile(userId: string, pathName: string, file: File): Promise<string> {
    try {
      return URL.createObjectURL(file);
    } catch (error) {
      logger.error("Error creating object URL for document file:", error);
      throw error;
    }
  },

  /**
   * Inserts the document metadata record into the mock store.
   */
  async insertDocumentRecord(
    record: Omit<UserDocument, "id" | "created_at" | "updated_at">
  ): Promise<UserDocument> {
    const now = new Date().toISOString();
    const row: UserDocument = {
      ...record,
      id: mockTable.genId(),
      created_at: now,
      updated_at: now,
    };
    return mockTable.insert<UserDocument>(TABLE, row);
  },

  /**
   * Deletes a document metadata record and revokes its object URL.
   */
  async deleteDocumentRecord(id: string, filePath: string): Promise<void> {
    mockTable.remove<UserDocument>(TABLE, "id", id);
    try {
      URL.revokeObjectURL(filePath);
    } catch {
      // Not a blob URL, or already revoked — safe to ignore.
    }
  },

  /**
   * Returns the document's object URL directly — no signing needed locally.
   */
  async getDocumentSignedUrl(filePath: string): Promise<string> {
    return filePath;
  },
};
