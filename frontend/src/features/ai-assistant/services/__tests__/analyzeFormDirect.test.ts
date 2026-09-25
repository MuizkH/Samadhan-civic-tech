import { describe, it, expect, vi, beforeEach } from "vitest";
import { analyzeFormDirect } from "../aiService";

describe("analyzeFormDirect", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects files above 10MB", async () => {
    const hugeFile = new File(["a".repeat(11 * 1024 * 1024)], "huge.pdf", { type: "application/pdf" });
    await expect(analyzeFormDirect(hugeFile)).rejects.toThrow("File size must be under 10MB");
  });

  it("rejects unsupported MIME types", async () => {
    const badFile = new File(["hello"], "document.txt", { type: "text/plain" });
    await expect(analyzeFormDirect(badFile)).rejects.toThrow(
      "Only PDF, JPEG, PNG, or WebP files are accepted"
    );
  });

  it("sends valid files to the backend for form analysis", async () => {
    const mockFile = new File(["dummy file content"], "form.jpg", { type: "image/jpeg" });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: "success",
          summary: "Sample form summary",
          fields: [],
          warnings: [],
          nextSteps: [],
        })
      )
    );

    const result = await analyzeFormDirect(mockFile, "What are the rules?");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/ai/analyze-form"),
      expect.objectContaining({ method: "POST" })
    );
    expect(result.status).toBe("success");
  });

  it("handles network errors gracefully", async () => {
    const mockFile = new File(["dummy file content"], "form.jpg", { type: "image/jpeg" });

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await analyzeFormDirect(mockFile, "What are the rules?");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("error");
    expect(result.reason).toContain("Could not reach the Samadhan server");
  });
});
