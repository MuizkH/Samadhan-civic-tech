import { Button } from "@/shared/components/ui/button";
import { useLanguage } from "@/app/providers/LanguageProvider";
import {
  FileText,
  Upload,
  Mic,
  Volume2,
  CheckCircle2,
  Sparkles,
  Languages,
  Bot,
  User,
  Send,
  Loader2,
  MicOff,
  AlertCircle,
  Check,
  ExternalLink,
  RefreshCw,
  X,
  FileQuestion,
  MapPin,
  DollarSign,
  Calendar,
  Info,
  Square,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { aiService, FormAnalysisResult } from "../services/aiService";
import { useToast } from "@/shared/hooks/use-toast";
import { getErrorMessage } from "@/shared/lib/errorMessage";

/* ---------------- SAMPLE QUESTIONS ---------------- */
const sampleQuestions = {
  en: [
    "What documents do I need?",
    "Which fields are mandatory?",
    "Am I eligible for this form?",
    "What's the submission deadline?",
  ],
  hi: [
    "मुझे कौन से दस्तावेज़ चाहिए?",
    "कौन से फ़ील्ड अनिवार्य हैं?",
    "क्या मैं इस फॉर्म के लिए पात्र हूं?",
    "सबमिशन की अंतिम तिथि क्या है?",
  ],
};

const supportedFormsList = [
  { code: "PMAY-U", name: "PMAY Urban (Subsidized Housing)" },
  { code: "PMAY-G", name: "PMAY Gramin (Rural Housing)" },
  { code: "PM-KISAN", name: "PM Kisan Samman Nidhi" },
  { code: "AADHAAR-UPDATE", name: "Aadhaar Update/Correction" },
  { code: "AADHAAR-ENROLLMENT", name: "Aadhaar New Enrollment" },
  { code: "AYUSHMAN-BHARAT", name: "Ayushman Bharat PM-JAY" },
  { code: "PM-SVANidhi", name: "PM SVANidhi (Vendor Loan)" },
  { code: "NREGA-JOB-CARD", name: "NREGA Job Card Application" },
  { code: "SCHOLARSHIP-NSP", name: "National Scholarship Portal" },
  { code: "INCOME-CERT", name: "Income Certificate (State)" },
];

export function AnalyzerAndAssistant() {
  const { t, language } = useLanguage();
  const { toast } = useToast();

  /* ---------------- CHAT STATE ---------------- */
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    {
      role: "assistant",
      content:
        language === "hi"
          ? "नमस्ते! मैं आपके फॉर्म, सरकारी योजनाओं और अन्य नागरिक प्रश्नों में सहायता कर सकता हूँ।"
          : "Hello! I can help with forms, government schemes & queries.",
    },
  ]);

  const [inputValue, setInputValue] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  /* ---------------- SPEECH RECOGNITION ---------------- */
  const isSpeechSupported =
    typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  useEffect(() => {
    if (!isSpeechSupported) return;
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) return;
    recognitionRef.current = new Recognition();
    recognitionRef.current.lang = language === "hi" ? "hi-IN" : "en-IN";
    recognitionRef.current.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map((r) => r[0].transcript)
        .join("");
      setInputValue(transcript);
    };
    recognitionRef.current.onend = () => setIsListening(false);
  }, [language, isSpeechSupported]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
    setIsListening(!isListening);
  };

  /* ---------------- CHAT SEND ---------------- */
  const handleSend = async (directText?: string) => {
    const textToSend = directText || inputValue;
    if (!textToSend.trim()) return;

    const userMsg = { role: "user" as const, content: textToSend };
    setMessages((prev) => [...prev, userMsg]);
    if (!directText) setInputValue("");
    setIsChatLoading(true);

    let assistantText = "";

    await aiService.streamChat({
      messages: [...messages, userMsg],
      language,
      onDelta: (chunk) => {
        assistantText += chunk;
        setMessages((prev) => {
          const lastMsg = prev[prev.length - 1];
          if (lastMsg && lastMsg.role === "assistant") {
            return [...prev.slice(0, -1), { role: "assistant" as const, content: assistantText }];
          } else {
            return [...prev, { role: "assistant" as const, content: assistantText }];
          }
        });
      },
      onDone: () => setIsChatLoading(false),
      onError: (errMsg) => {
        setIsChatLoading(false);
        toast({ title: "Error", description: errMsg || "Try again" });
      },
    });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ---------------- FORM ANALYZER STATE ---------------- */
  const [file, setFile] = useState<File | null>(null);
  const [formQuery, setFormQuery] = useState("");
  const [status, setStatus] = useState<
    | "idle"
    | "converting"
    | "uploading"
    | "classifying"
    | "retrieving"
    | "generating"
    | "done"
    | "rejected"
    | "low_confidence"
    | "unsupported_form"
    | "error"
  >("idle");
  const [progressText, setProgressText] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [analysisResult, setAnalysisResult] = useState<FormAnalysisResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "summary" | "eligibility" | "documents" | "steps" | "submission"
  >("summary");
  const [guidanceLang, setGuidanceLang] = useState<"hi" | "en">("hi");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Smooth progress simulator
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (status === "converting") {
      setProgressPercent(5);
      setProgressText(language === "hi" ? "PDF को छवि में बदला जा रहा है..." : "Converting PDF to image...");
      interval = setInterval(() => {
        setProgressPercent((p) => Math.min(p + 1, 9));
      }, 200);
    } else if (status === "classifying") {
      setProgressPercent(10);
      setProgressText(
        language === "hi" ? "दस्तावेज़ का विश्लेषण किया जा रहा है..." : "Analyzing your document..."
      );
      interval = setInterval(() => {
        setProgressPercent((p) => Math.min(p + 2, 40));
      }, 300);
    } else if (status === "retrieving") {
      setProgressPercent(45);
      setProgressText(
        language === "hi" ? "सही सरकारी गाइड खोजी जा रही है..." : "Finding the right government guide..."
      );
      interval = setInterval(() => {
        setProgressPercent((p) => Math.min(p + 3, 70));
      }, 200);
    } else if (status === "generating") {
      setProgressPercent(75);
      setProgressText(
        language === "hi"
          ? "सरल भाषा में निर्देश तैयार किए जा रहे हैं..."
          : "Writing instructions in simple terms..."
      );
      interval = setInterval(() => {
        setProgressPercent((p) => Math.min(p + 1, 95));
      }, 400);
    } else if (status === "done") {
      setProgressPercent(100);
      setProgressText(language === "hi" ? "पूर्ण!" : "Completed!");
    } else if (status === "idle") {
      setProgressPercent(0);
    }
    return () => clearInterval(interval);
  }, [status, language]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      handleFileSelected(droppedFile);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelected(e.target.files[0]);
    }
  };

  const handleFileSelected = (selectedFile: File) => {
    const allowedTypes = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(selectedFile.type)) {
      toast({
        title: language === "hi" ? "अमान्य फ़ाइल प्रकार" : "Invalid file type",
        description:
          language === "hi"
            ? "केवल PDF, JPEG, PNG, या WebP फ़ाइलें स्वीकार की जाती हैं।"
            : "Only PDF, JPEG, PNG, or WebP files are accepted.",
        variant: "destructive",
      });
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      toast({
        title: language === "hi" ? "फ़ाइल बहुत बड़ी है" : "File too large",
        description:
          language === "hi" ? "फ़ाइल का आकार 10MB से कम होना चाहिए।" : "File size must be under 10MB.",
        variant: "destructive",
      });
      return;
    }

    setFile(selectedFile);
    setAnalysisResult(null);
    setStatus("idle");
  };

  const loadSampleForm = async (samplePath: string, fileName: string) => {
    try {
      const res = await fetch(samplePath);
      const blob = await res.blob();
      const sampleFile = new File([blob], fileName, { type: "image/png" });
      handleFileSelected(sampleFile);
    } catch (err) {
      console.error("Failed to load sample form:", err);
      toast({
        title: "Error",
        description: "Could not load sample form file.",
        variant: "destructive",
      });
    }
  };

  const clearFile = () => {
    setFile(null);
    setAnalysisResult(null);
    setStatus("idle");
    setFormQuery("");
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const runAnalysis = async () => {
    if (!file) return;

    let t1: ReturnType<typeof setTimeout> | undefined;
    let t2: ReturnType<typeof setTimeout> | undefined;

    try {
      // If PDF, show converting status first (PDF.js rasterization happens inside analyzeFormDirect)
      if (file.type === "application/pdf") {
        setStatus("converting");
        await new Promise((r) => setTimeout(r, 100)); // let UI re-render
      }

      setStatus("classifying");

      // Safely transition status only if analysis is still in progress
      t1 = setTimeout(() => {
        setStatus((curr) => (curr === "classifying" ? "retrieving" : curr));
      }, 1500);

      t2 = setTimeout(() => {
        setStatus((curr) => (curr === "retrieving" ? "generating" : curr));
      }, 3000);

      const result = await aiService.analyzeFormDirect(file, formQuery, guidanceLang);

      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);

      setAnalysisResult(result);

      if (result.status === "rejected") {
        setStatus("rejected");
      } else if (result.status === "low_confidence") {
        setStatus("low_confidence");
      } else if (result.status === "unsupported_form") {
        setStatus("unsupported_form");
      } else if (result.status === "error") {
        setStatus("error");
        setErrorMessage(result.reason || "Unknown error occurred.");
      } else {
        setStatus("done");
        setActiveTab("summary");
      }

      toast({
        title: language === "hi" ? "विश्लेषण पूरा हुआ" : "Analysis completed",
        description:
          language === "hi"
            ? "आपके फॉर्म की जानकारी सफलतापूर्वक प्राप्त कर ली गई है।"
            : "Your form guidance is ready.",
      });
    } catch (err) {
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);

      console.error(err);
      setStatus("error");
      setErrorMessage(getErrorMessage(err, "Something went wrong during analysis."));
      toast({
        title: language === "hi" ? "विश्लेषण विफल" : "Analysis failed",
        description: getErrorMessage(err, "Failed to process form."),
        variant: "destructive",
      });
    }
  };

  /* ---------------- TEXT TO SPEECH (TTS) ---------------- */
  const toggleSpeech = async () => {
    try {
      // --- STOP path ---
      if (isSpeaking) {
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current.currentTime = 0;
          audioRef.current = null;
        }
        if (typeof window !== "undefined" && window.speechSynthesis) {
          window.speechSynthesis.cancel();
        }
        setIsSpeaking(false);
        utteranceRef.current = null;
        toast({
          title: language === "hi" ? "ऑडियो बंद" : "Audio Stopped",
          description: language === "hi" ? "गाइड नैरेशन रोक दिया गया है।" : "Narration stopped.",
        });
        return;
      }

      if (!analysisResult?.guidance) {
        toast({ title: "Error", description: "No guidance available to read." });
        return;
      }

      // Detect whether the guidance is in Hindi
      const isHindi =
        guidanceLang === "hi" || language === "hi" || /[\u0900-\u097F]/.test(analysisResult.guidance.summary);

      const guidance = analysisResult.guidance;
      const formNameStr = analysisResult.form_name || (isHindi ? "सरकारी योजना फॉर्म" : "Government Form");

      let textToSpeak = "";
      let tabTitleHi = "";
      let tabTitleEn = "";

      if (activeTab === "summary") {
        tabTitleHi = "विवरण";
        tabTitleEn = "Overview";
        const sumSnippet = guidance.summary ? guidance.summary.slice(0, 160) : "";
        const benSnippet = guidance.scheme_benefit ? guidance.scheme_benefit.slice(0, 100) : "";
        textToSpeak = isHindi
          ? `विवरण: यह फॉर्म ${formNameStr} का है। ${sumSnippet}। ${benSnippet ? `लाभ: ${benSnippet}` : ""}`
          : `Overview: This form is for ${formNameStr}. ${sumSnippet}. ${benSnippet ? `Benefits: ${benSnippet}` : ""}`;
      } else if (activeTab === "eligibility") {
        tabTitleHi = "पात्रता नियम";
        tabTitleEn = "Eligibility Criteria";
        const items = (guidance.eligibility || []).join(". ");
        textToSpeak = isHindi
          ? `पात्रता नियम: ${items || "भारत का कोई भी पात्र नागरिक आवेदन कर सकता है।"}`
          : `Eligibility criteria: ${items || "Any eligible citizen can apply."}`;
      } else if (activeTab === "documents") {
        tabTitleHi = "आवश्यक दस्तावेज़";
        tabTitleEn = "Required Documents";
        const docs = (guidance.required_documents || []).map((d) => `${d.name}: ${d.details}`).join(". ");
        textToSpeak = isHindi
          ? `आवश्यक दस्तावेज़: ${docs || "आधार कार्ड, पहचान प्रमाण, निवास प्रमाण।"}`
          : `Required documents: ${docs || "Aadhaar card, identity proof, address proof."}`;
      } else if (activeTab === "steps") {
        tabTitleHi = "फॉर्म भरने के चरण";
        tabTitleEn = "Filling Steps";
        const steps = (guidance.filling_steps || [])
          .slice(0, 4)
          .map((s) => `चरण ${s.step}, ${s.field}: ${s.instruction}`)
          .join(". ");
        textToSpeak = isHindi
          ? `भरने के चरण: ${steps || "फॉर्म में व्यक्तिगत और पता विवरण दर्ज करें।"}`
          : `Filling steps: ${steps || "Fill personal and address details on form."}`;
      } else if (activeTab === "submission") {
        tabTitleHi = "जमा करने की जानकारी";
        tabTitleEn = "Submission Info";
        const sub = guidance.submission;
        textToSpeak = isHindi
          ? `जमा निर्देश: कार्यालय: ${sub?.where || "निकटतम सरकारी कार्यालय"}। फीस: ${sub?.fee || "कोई शुल्क नहीं"}।`
          : `Submission guidance: Submit at ${sub?.where || "Nearest Government Office"}. Fee: ${sub?.fee || "Free"}.`;
      }

      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${isHindi ? "hi" : "en"}&client=tw-ob&q=${encodeURIComponent(textToSpeak.slice(0, 280))}`;

      // ── Method 1: Instant Direct Audio CDN Stream (Sub-200ms start) ──
      try {
        const audio = new Audio(ttsUrl);
        audioRef.current = audio;

        audio.onplay = () => {
          setIsSpeaking(true);
          toast({
            title: isHindi ? `🔊 ${tabTitleHi} ऑडियो गाइड` : `🔊 ${tabTitleEn} Audio Guide`,
            description: isHindi
              ? `${tabTitleHi} नैरेशन चालू है...`
              : `Playing ${tabTitleEn.toLowerCase()} narration...`,
          });
        };

        audio.onended = () => {
          setIsSpeaking(false);
          audioRef.current = null;
        };

        audio.onerror = (e) => {
          console.warn("[TTS] Direct audio stream failed, falling back:", e);
          fallbackWebSpeech(textToSpeak, isHindi);
        };

        const playPromise = audio.play();
        if (playPromise !== undefined) {
          await playPromise;
          return;
        }
      } catch (directAudioErr) {
        console.warn("[TTS] Direct play exception, using fallback:", directAudioErr);
        fallbackWebSpeech(textToSpeak, isHindi);
      }
    } catch (err) {
      console.error("[TTS] Exception in toggleSpeech:", err);
      setIsSpeaking(false);
    }
  };

  const fallbackWebSpeech = (text: string, isHindi: boolean) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = isHindi ? "hi-IN" : "en-IN";
      utterance.rate = 1.0;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => {
        setIsSpeaking(false);
        utteranceRef.current = null;
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        utteranceRef.current = null;
      };

      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    } else {
      setIsSpeaking(false);
    }
  };

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      utteranceRef.current = null;
    };
  }, []);

  return (
    <section className="py-20 min-h-screen bg-background relative overflow-hidden">
      {/* Dynamic Interactive BG */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-secondary/10 pointer-events-none" />
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-secondary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="container mx-auto px-4 relative space-y-24">
        {/* ================= FORM ANALYZER PANEL ================= */}
        <div>
          <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-sm font-semibold tracking-wide uppercase">
              <Sparkles className="w-4 h-4 animate-pulse" />
              {t("analyzer.badge")}
            </div>
            <h1 className="text-5xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent">
              {t("analyzer.title")}{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                {t("analyzer.audioGuidance")}
              </span>
            </h1>
            <p className="text-xl text-muted-foreground">{t("analyzer.subtitle")}</p>
          </div>

          <div className="grid lg:grid-cols-12 gap-12 items-start">
            {/* LEFT COLUMN: GUIDELINES & SUPPORTED LIST */}
            <div className="lg:col-span-5 space-y-8">
              <div className="bg-card/40 backdrop-blur-md rounded-3xl p-8 border border-border/80 shadow-lg space-y-6">
                <h3 className="text-2xl font-bold flex items-center gap-2">
                  <Info className="w-5 h-5 text-primary" />
                  {language === "hi" ? "निर्देश एवं दिशा-निर्देश" : "Guidelines & Instructions"}
                </h3>
                <ul className="space-y-4 text-muted-foreground">
                  <li className="flex gap-3 items-start">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>
                      {language === "hi"
                        ? "केवल आधिकारिक मुद्रित सरकारी फॉर्म ही स्वीकार किए जाते हैं।"
                        : "Only official printed government form documents (PDF or clear image) are accepted."}
                    </span>
                  </li>
                  <li className="flex gap-3 items-start">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>
                      {language === "hi"
                        ? "यह गेटवे रसीद, आईडी कार्ड, बिल या निजी दस्तावेजों को तुरंत अस्वीकार कर देता है।"
                        : "The gateway automatically rejects ID cards, utility bills, receipts, or personal documents."}
                    </span>
                  </li>
                  <li className="flex gap-3 items-start">
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <span>
                      {language === "hi"
                        ? "दस्तावेज़ सुरक्षित है - फ़ाइल कभी भी संग्रहीत नहीं की जाती है और केवल क्षणिक है।"
                        : "Completely secure — uploaded files are processed transiently in memory and never stored."}
                    </span>
                  </li>
                </ul>

                <hr className="border-border/60" />

                <div>
                  <h4 className="font-semibold text-foreground mb-3 flex items-center gap-1.5">
                    <Languages className="w-4 h-4 text-secondary" />
                    {language === "hi"
                      ? "वर्तमान में समर्थित सरकारी फॉर्म:"
                      : "Currently Supported Government Forms:"}
                  </h4>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-2">
                    {supportedFormsList.map((f, i) => (
                      <div
                        key={i}
                        className="text-xs px-2.5 py-2 rounded-xl bg-muted/60 border border-border/40 text-muted-foreground flex flex-col justify-center"
                      >
                        <span className="font-bold text-foreground/80">{f.code}</span>
                        <span className="truncate">{f.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: ACTION & RESULT INTERFACE */}
            <div className="lg:col-span-7 space-y-8">
              {/* UPLOAD ZONE CARD */}
              {status === "idle" ||
              status === "uploading" ||
              status === "error" ||
              status === "rejected" ||
              status === "low_confidence" ||
              status === "unsupported_form" ? (
                <div
                  className={`bg-card rounded-3xl p-8 border shadow-xl transition-all duration-300 relative ${
                    dragActive ? "border-primary bg-primary/5 scale-[1.01]" : "border-border"
                  }`}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                  />

                  {/* DROPZONE */}
                  {!file ? (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-dashed border-2 border-border rounded-2xl p-12 text-center cursor-pointer hover:border-primary/60 hover:bg-muted/40 transition-all duration-300"
                    >
                      <div className="w-16 h-16 rounded-full bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
                        <Upload className="w-8 h-8" />
                      </div>
                      <h4 className="text-xl font-bold mb-1">{t("analyzer.dropHere")}</h4>
                      <p className="text-sm text-muted-foreground mb-4">{t("analyzer.uploadDesc")}</p>
                      <Button type="button" variant="outline" className="rounded-full px-6">
                        {t("analyzer.browseFiles")}
                      </Button>

                      {/* Sample Forms One-Click Test */}
                      <div
                        className="mt-6 pt-5 border-t border-border/50 text-center"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <p className="text-xs font-semibold text-muted-foreground mb-3">
                          {language === "hi"
                            ? "💡 नमूना फॉर्म के साथ तुरंत आज़माएं:"
                            : "💡 Or test immediately with a sample government form:"}
                        </p>
                        <div className="flex flex-wrap gap-2 justify-center">
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="text-xs rounded-full gap-1.5 hover:border-primary/50 transition-all"
                            onClick={() =>
                              loadSampleForm(
                                "/sample_forms/aadhaar_enrolment_update_form.png",
                                "Aadhaar_Update_Form_Sample.png"
                              )
                            }
                          >
                            <FileText className="w-3.5 h-3.5 text-primary" />
                            Aadhaar Update Form
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="text-xs rounded-full gap-1.5 hover:border-primary/50 transition-all"
                            onClick={() =>
                              loadSampleForm(
                                "/sample_forms/pmay_urban_application_form.png",
                                "PMAY_Urban_Application_Sample.png"
                              )
                            }
                          >
                            <FileText className="w-3.5 h-3.5 text-primary" />
                            PMAY Urban Form
                          </Button>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            className="text-xs rounded-full gap-1.5 hover:border-primary/50 transition-all"
                            onClick={() =>
                              loadSampleForm(
                                "/sample_forms/pm_kisan_samman_nidhi_form.png",
                                "PM_Kisan_Application_Sample.png"
                              )
                            }
                          >
                            <FileText className="w-3.5 h-3.5 text-primary" />
                            PM-KISAN Form
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 bg-muted/80 rounded-2xl border border-border/60">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                            <FileText className="w-6 h-6" />
                          </div>
                          <div className="text-left">
                            <h4 className="font-bold truncate max-w-[200px] sm:max-w-[350px]">{file.name}</h4>
                            <p className="text-xs text-muted-foreground">
                              {(file.size / (1024 * 1024)).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={clearFile}
                          className="text-muted-foreground hover:text-foreground rounded-full"
                        >
                          <X className="w-5 h-5" />
                        </Button>
                      </div>

                      {/* Optional question */}
                      <div className="space-y-2 text-left">
                        <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                          <FileQuestion className="w-4 h-4 text-primary" />
                          {language === "hi"
                            ? "क्या आपका इस फॉर्म के बारे में कोई विशेष प्रश्न है?"
                            : "Do you have a specific question about this form?"}
                        </label>
                        <input
                          type="text"
                          value={formQuery}
                          onChange={(e) => setFormQuery(e.target.value)}
                          placeholder={
                            language === "hi"
                              ? "उदा. क्या मैं इस आवास योजना के लिए पात्र हूँ?"
                              : "e.g. What income certificate do I need for this?"
                          }
                          className="w-full px-4 py-3 rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/40 text-sm transition-all"
                        />
                      </div>

                      {/* Guidance Language Selector */}
                      <div className="flex items-center justify-between p-3.5 bg-muted/60 rounded-xl border border-border/60">
                        <div className="flex items-center gap-2">
                          <Languages className="w-4 h-4 text-primary" />
                          <span className="text-xs font-semibold text-foreground">
                            {language === "hi" ? "मार्गदर्शन भाषा:" : "Guidance Language:"}
                          </span>
                        </div>
                        <div className="flex gap-1.5 bg-background p-1 rounded-lg border border-border">
                          <button
                            type="button"
                            onClick={() => setGuidanceLang("hi")}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                              guidanceLang === "hi"
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            🇮🇳 हिंदी (Hindi)
                          </button>
                          <button
                            type="button"
                            onClick={() => setGuidanceLang("en")}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 cursor-pointer ${
                              guidanceLang === "en"
                                ? "bg-primary text-primary-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            🇬🇧 English
                          </button>
                        </div>
                      </div>

                      <Button
                        onClick={runAnalysis}
                        disabled={status === "uploading"}
                        className="w-full py-6 rounded-2xl text-lg font-bold shadow-lg shadow-primary/20 gap-2 cursor-pointer"
                      >
                        <Sparkles className="w-5 h-5" />
                        {guidanceLang === "hi"
                          ? "दस्तावेज़ का विश्लेषण शुरू करें (हिंदी में)"
                          : "Start Document Analysis (In English)"}
                      </Button>
                    </div>
                  )}

                  {/* REJECTION CARD DETAILS */}
                  {status === "rejected" && analysisResult && (
                    <div className="mt-6 p-5 bg-destructive/10 border border-destructive/30 rounded-2xl flex gap-4 text-left">
                      <AlertCircle className="w-8 h-8 text-destructive shrink-0 mt-0.5" />
                      <div className="space-y-2">
                        <h4 className="font-bold text-destructive text-lg">
                          {language === "hi" ? "दस्तावेज़ अस्वीकार कर दिया गया" : "Document Rejected"}
                        </h4>
                        <p className="text-sm text-foreground/80 font-medium">
                          {analysisResult.reason ||
                            "This document was not recognized as an Indian government form."}
                        </p>
                        <p className="text-xs text-muted-foreground bg-background/50 p-2.5 rounded-lg border border-border/40">
                          <strong>{language === "hi" ? "दिशा-निर्देश:" : "Guidance:"}</strong>{" "}
                          {analysisResult.guidance?.summary ||
                            "Please upload a valid blank printed government application form."}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* LOW CONFIDENCE CARD */}
                  {status === "low_confidence" && analysisResult && (
                    <div className="mt-6 p-5 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex gap-4 text-left">
                      <AlertCircle className="w-8 h-8 text-amber-500 shrink-0 mt-0.5" />
                      <div className="space-y-2">
                        <h4 className="font-bold text-amber-600 text-lg">
                          {language === "hi" ? "कम गुणवत्ता / अस्पष्ट फोटो" : "Low Image Quality"}
                        </h4>
                        <p className="text-sm text-foreground/80 font-medium">{analysisResult.reason}</p>
                        <p className="text-xs text-muted-foreground bg-background/50 p-2.5 rounded-lg border border-border/40">
                          <strong>{language === "hi" ? "सुझाव:" : "Guidance:"}</strong>{" "}
                          {analysisResult.guidance?.summary}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* UNSUPPORTED FORM CARD */}
                  {status === "unsupported_form" && analysisResult && (
                    <div className="mt-6 p-5 bg-cyan-500/10 border border-cyan-500/30 rounded-2xl flex gap-4 text-left">
                      <AlertCircle className="w-8 h-8 text-cyan-600 shrink-0 mt-0.5" />
                      <div className="space-y-2">
                        <h4 className="font-bold text-cyan-700 text-lg">
                          {language === "hi" ? "असमर्थित सरकारी फॉर्म" : "Unsupported Government Form"}
                        </h4>
                        <p className="text-sm text-foreground/80 font-medium">{analysisResult.reason}</p>
                        <p className="text-xs text-muted-foreground bg-background/50 p-2.5 rounded-lg border border-border/40">
                          <strong>{language === "hi" ? "सुझाव:" : "Guidance:"}</strong>{" "}
                          {analysisResult.guidance?.summary}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* SYSTEM/API ERROR */}
                  {status === "error" && (
                    <div className="mt-6 p-5 bg-red-500/10 border border-red-500/30 rounded-2xl flex gap-4 text-left">
                      <AlertCircle className="w-8 h-8 text-red-500 shrink-0 mt-0.5" />
                      <div className="space-y-2">
                        <h4 className="font-bold text-red-600 text-lg">
                          {language === "hi" ? "त्रुटि उत्पन्न हुई" : "Analysis Failed"}
                        </h4>
                        <p className="text-sm text-foreground/80 font-medium">{errorMessage}</p>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={runAnalysis}
                          className="mt-2 text-xs rounded-full gap-1.5"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          {language === "hi" ? "पुनः प्रयास करें" : "Retry"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}

              {/* PROGRESS STATE CARD */}
              {(status === "converting" ||
                status === "classifying" ||
                status === "retrieving" ||
                status === "generating") && (
                <div className="bg-card rounded-3xl p-8 border border-border shadow-xl space-y-6 text-center">
                  <div className="relative w-24 h-24 mx-auto">
                    <Loader2 className="w-24 h-24 text-primary animate-spin absolute inset-0" />
                    <div className="w-16 h-16 rounded-full bg-muted absolute inset-4 flex items-center justify-center font-bold text-lg text-primary">
                      {progressPercent}%
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-xl font-bold animate-pulse">{progressText}</h4>
                    <p className="text-sm text-muted-foreground">
                      {language === "hi"
                        ? "कृपया प्रतीक्षा करें। इसमें लगभग 10-15 सेकंड का समय लग सकता है।"
                        : "Please wait. This process takes about 10-15 seconds."}
                    </p>
                  </div>
                  {/* Progress Line */}
                  <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary h-full transition-all duration-300 rounded-full"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-xs font-semibold">
                    <div
                      className={`p-2 rounded-xl border transition-colors ${status === "converting" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                    >
                      0. PDF → Image
                    </div>
                    <div
                      className={`p-2 rounded-xl border transition-colors ${status === "classifying" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                    >
                      1. Demarcating Form
                    </div>
                    <div
                      className={`p-2 rounded-xl border transition-colors ${status === "retrieving" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                    >
                      2. RAG Match
                    </div>
                    <div
                      className={`p-2 rounded-xl border transition-colors ${status === "generating" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
                    >
                      3. Simplification
                    </div>
                  </div>
                </div>
              )}

              {/* SUCCESS RESULTS CARD */}
              {status === "done" && analysisResult?.guidance && (
                <div className="bg-card rounded-3xl border border-border shadow-2xl overflow-hidden text-left flex flex-col transition-all duration-300">
                  {/* Result Header */}
                  <div className="p-6 bg-gradient-to-r from-primary/15 to-secondary/15 border-b border-border/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="px-3 py-1 rounded-full bg-primary/25 border border-primary/30 text-xs font-bold text-primary tracking-wide uppercase">
                          {analysisResult.form_code}
                        </span>
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          Relevance Match:{" "}
                          {(analysisResult.confidence ? analysisResult.confidence * 100 : 90).toFixed(0)}%
                        </span>
                      </div>
                      <h3 className="text-2xl font-extrabold text-foreground">{analysisResult.form_name}</h3>
                    </div>

                    <div className="flex items-center gap-2 relative z-50">
                      <Button
                        type="button"
                        variant={isSpeaking ? "destructive" : "default"}
                        onClick={toggleSpeech}
                        className={`rounded-full gap-2 font-bold shrink-0 cursor-pointer shadow-md transition-all duration-200 border relative z-50 select-none ${
                          isSpeaking
                            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 animate-pulse ring-2 ring-destructive/40"
                            : "bg-primary text-primary-foreground hover:bg-primary/90 hover:scale-105 border-primary/20"
                        }`}
                      >
                        {isSpeaking ? (
                          <>
                            <Square className="w-4 h-4 fill-current" />
                            <span>
                              {language === "hi" || guidanceLang === "hi" ? "ऑडियो रोकें" : "Stop Audio"}
                            </span>
                          </>
                        ) : (
                          <>
                            <Volume2 className="w-4 h-4" />
                            <span>
                              {language === "hi" || guidanceLang === "hi"
                                ? "ऑडियो गाइड सुनें"
                                : "Listen to Guide"}
                            </span>
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={clearFile}
                        title={
                          language === "hi" || guidanceLang === "hi"
                            ? "नया फॉर्म जांचें"
                            : "Analyze Another Form"
                        }
                        className="rounded-full bg-muted/80 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60 relative z-50 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Custom Query Answer Banner */}
                  {analysisResult.guidance.custom_query_answer && (
                    <div className="p-6 bg-gradient-to-r from-primary/10 to-indigo-500/10 border-b border-border/80 flex gap-4 text-left items-start">
                      <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 shadow-sm border border-primary/20">
                        <FileQuestion className="w-5 h-5 animate-pulse" />
                      </div>
                      <div className="space-y-1">
                        <h4 className="font-extrabold text-primary text-xs uppercase tracking-wider flex items-center gap-1.5">
                          {language === "hi" ? "आपके प्रश्न का उत्तर" : "Answer to your Question"}
                        </h4>
                        <p className="text-foreground font-semibold text-base leading-relaxed">
                          {analysisResult.guidance.custom_query_answer}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Tabs Selector */}
                  <div className="flex border-b border-border overflow-x-auto scrollbar-none bg-muted/40 relative z-10">
                    <button
                      type="button"
                      onClick={() => setActiveTab("summary")}
                      className={`flex-1 py-3 px-4 text-center font-bold text-sm border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        activeTab === "summary"
                          ? "border-primary text-primary bg-background shadow-sm"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {language === "hi" ? "विवरण" : "Overview"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("eligibility")}
                      className={`flex-1 py-3 px-4 text-center font-bold text-sm border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        activeTab === "eligibility"
                          ? "border-primary text-primary bg-background shadow-sm"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {language === "hi" ? "पात्रता" : "Eligibility"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("documents")}
                      className={`flex-1 py-3 px-4 text-center font-bold text-sm border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        activeTab === "documents"
                          ? "border-primary text-primary bg-background shadow-sm"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {language === "hi" ? "दस्तावेज़" : "Required Docs"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("steps")}
                      className={`flex-1 py-3 px-4 text-center font-bold text-sm border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        activeTab === "steps"
                          ? "border-primary text-primary bg-background shadow-sm"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {language === "hi" ? "भरने का तरीका" : "Filling Steps"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("submission")}
                      className={`flex-1 py-3 px-4 text-center font-bold text-sm border-b-2 transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                        activeTab === "submission"
                          ? "border-primary text-primary bg-background shadow-sm"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {language === "hi" ? "जमा कहाँ करें" : "Submission"}
                    </button>
                  </div>

                  {/* Tabs Content */}
                  <div className="p-6 min-h-[250px] overflow-y-auto max-h-[450px]">
                    {activeTab === "summary" && analysisResult?.guidance && (
                      <div className="space-y-4">
                        <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10">
                          <h4 className="font-bold text-primary mb-1 text-sm uppercase tracking-wide">
                            {language === "hi" ? "यह फॉर्म किस बारे में है?" : "What is this form?"}
                          </h4>
                          <p className="text-foreground/90 text-lg leading-relaxed">
                            {analysisResult.guidance.summary}
                          </p>
                        </div>
                        <div className="bg-secondary/5 p-4 rounded-2xl border border-secondary/10">
                          <h4 className="font-bold text-secondary mb-1 text-sm uppercase tracking-wide">
                            {language === "hi" ? "आपको क्या लाभ मिलेगा?" : "What benefits do you get?"}
                          </h4>
                          <p className="text-foreground/90 leading-relaxed font-medium">
                            {analysisResult.guidance.scheme_benefit}
                          </p>
                        </div>
                      </div>
                    )}

                    {activeTab === "eligibility" && (
                      <div className="space-y-3">
                        <h4 className="font-bold text-foreground mb-1 text-sm uppercase tracking-wide flex items-center gap-1">
                          <Check className="w-4 h-4 text-emerald-500" />
                          {language === "hi" ? "कौन आवेदन कर सकता है?" : "Who is eligible to apply?"}
                        </h4>
                        <div className="grid gap-2">
                          {(analysisResult?.guidance?.eligibility || []).map((crit, idx) => (
                            <div
                              key={idx}
                              className="flex gap-3 items-start p-3 bg-muted/40 rounded-xl border border-border/40"
                            >
                              <div className="w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                                <Check className="w-3.5 h-3.5" />
                              </div>
                              <span className="text-sm font-medium text-foreground/80">{crit}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeTab === "documents" && (
                      <div className="space-y-3">
                        <h4 className="font-bold text-foreground mb-1 text-sm uppercase tracking-wide flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-primary" />
                          {language === "hi"
                            ? "आवश्यक सहायक दस्तावेज:"
                            : "Documents Required for Application:"}
                        </h4>
                        <div className="grid gap-2">
                          {(analysisResult?.guidance?.required_documents || []).map((doc, idx) => (
                            <div
                              key={idx}
                              className="p-3.5 bg-muted/40 rounded-xl border border-border/40 flex items-start gap-3.5"
                            >
                              <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                                <FileText className="w-4.5 h-4.5" />
                              </div>
                              <div>
                                <h5 className="font-bold text-sm text-foreground">{doc.name}</h5>
                                <p className="text-xs text-muted-foreground mt-0.5">{doc.details}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeTab === "steps" && (
                      <div className="space-y-3">
                        <h4 className="font-bold text-foreground mb-1 text-sm uppercase tracking-wide">
                          {language === "hi"
                            ? "फॉर्म को भरने के चरण (फ़ील्ड-दर-फ़ील्ड):"
                            : "Step-by-Step Instructions (Field-by-Field):"}
                        </h4>
                        <div className="space-y-4">
                          {(analysisResult?.guidance?.filling_steps || []).map((s, idx) => (
                            <div key={idx} className="relative pl-8 border-l border-border/80 pb-4 last:pb-0">
                              {/* Step Badge */}
                              <div className="absolute -left-3.5 top-0.5 w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold shadow-md shadow-primary/20">
                                {s.step}
                              </div>
                              <div className="p-3 bg-muted/30 border border-border/30 rounded-xl space-y-1.5">
                                <h5 className="font-bold text-sm text-foreground flex items-center gap-1.5">
                                  {language === "hi" ? "फ़ील्ड:" : "Field Name:"}{" "}
                                  <span className="text-primary">{s.field}</span>
                                </h5>
                                <p className="text-xs text-foreground/80 leading-relaxed">{s.instruction}</p>
                                {s.example && (
                                  <p className="text-[10px] text-muted-foreground bg-muted p-1.5 rounded-md border border-border/40 inline-block font-mono">
                                    <strong>{language === "hi" ? "उदाहरण:" : "Example:"}</strong> {s.example}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {activeTab === "submission" && (
                      <div className="space-y-4">
                        <h4 className="font-bold text-foreground mb-1 text-sm uppercase tracking-wide">
                          {language === "hi"
                            ? "जमा करने एवं फीस की जानकारी:"
                            : "Submission Guidelines & Cost:"}
                        </h4>
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div className="p-4 bg-muted/40 border border-border/40 rounded-xl space-y-1">
                            <h5 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5 text-primary" />
                              {language === "hi" ? "कार्यालय (भौतिक रूप से):" : "Where to Submit (Physical):"}
                            </h5>
                            <p className="text-sm font-medium text-foreground">
                              {analysisResult?.guidance?.submission?.where ||
                                "Relevant Tehsil / Local Government Office"}
                            </p>
                          </div>

                          <div className="p-4 bg-muted/40 border border-border/40 rounded-xl space-y-1">
                            <h5 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                              <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                              {language === "hi" ? "आवेदन शुल्क / खर्च:" : "Application Fee / Cost:"}
                            </h5>
                            <p className="text-sm font-bold text-emerald-600">
                              {analysisResult?.guidance?.submission?.fee || "Free / Nominal Fee"}
                            </p>
                          </div>

                          {analysisResult?.guidance?.submission?.online_portal && (
                            <div className="p-4 bg-muted/40 border border-border/40 rounded-xl space-y-1 sm:col-span-2">
                              <h5 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                                <ExternalLink className="w-3.5 h-3.5 text-secondary" />
                                {language === "hi"
                                  ? "आधिकारिक ऑनलाइन पोर्टल:"
                                  : "Official Online Submission Portal:"}
                              </h5>
                              <a
                                href={
                                  analysisResult.guidance.submission.online_portal.startsWith("http")
                                    ? analysisResult.guidance.submission.online_portal
                                    : `https://${analysisResult.guidance.submission.online_portal}`
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-semibold text-primary hover:underline flex items-center gap-1 cursor-pointer"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const portal = analysisResult.guidance!.submission.online_portal!;
                                  const url = portal.startsWith("http") ? portal : `https://${portal}`;
                                  window.open(url, "_blank", "noopener,noreferrer");
                                }}
                              >
                                {analysisResult.guidance.submission.online_portal}
                                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                              </a>
                            </div>
                          )}

                          {analysisResult.guidance.submission.deadline && (
                            <div className="p-4 bg-muted/40 border border-border/40 rounded-xl space-y-1 sm:col-span-2">
                              <h5 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                                <Calendar className="w-3.5 h-3.5 text-amber-500" />
                                {language === "hi"
                                  ? "अंतिम तिथि / सबमिशन डेडलाइन:"
                                  : "Submission Deadline Info:"}
                              </h5>
                              <p className="text-sm font-semibold text-amber-600">
                                {analysisResult.guidance.submission.deadline}
                              </p>
                            </div>
                          )}
                        </div>

                        {analysisResult.guidance.important_notes &&
                          analysisResult.guidance.important_notes.length > 0 && (
                            <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl space-y-2">
                              <h5 className="text-xs font-bold text-amber-600 uppercase flex items-center gap-1">
                                <Info className="w-3.5 h-3.5" />
                                {language === "hi" ? "महत्वपूर्ण बिंदु:" : "Important Notes to keep in mind:"}
                              </h5>
                              <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                                {analysisResult.guidance.important_notes.map((note, idx) => (
                                  <li key={idx} className="leading-relaxed">
                                    {note}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                      </div>
                    )}
                  </div>

                  {/* Citations Footer */}
                  {analysisResult.guidance.sources && (
                    <div className="p-4 bg-muted/60 border-t border-border flex flex-col gap-3">
                      <h5 className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                        <Info className="w-3.5 h-3.5 text-primary" />
                        {language === "hi"
                          ? "सत्यापित स्रोत और संदर्भ:"
                          : "Verified Official Source Citations:"}
                      </h5>
                      <div className="flex flex-col gap-2 max-h-32 overflow-y-auto pr-1">
                        {analysisResult.guidance.sources.map((s, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between items-center bg-background p-2.5 rounded-lg border border-border/60 text-xs"
                          >
                            <div className="space-y-0.5 text-left">
                              <p className="font-semibold text-foreground">{s.chunk_title}</p>
                              <p className="text-[10px] text-muted-foreground">
                                Source: {s.form_name} · Version: {s.version || "v1.0"} · Last verified:{" "}
                                {s.last_verified
                                  ? new Date(s.last_verified).toLocaleDateString()
                                  : "June 2026"}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/25 text-[10px] text-emerald-600 font-medium">
                                Relevance: {(s.similarity * 100).toFixed(0)}%
                              </span>
                              {s.source_url && (
                                <a
                                  href={
                                    s.source_url.startsWith("http") ? s.source_url : `https://${s.source_url}`
                                  }
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 hover:bg-primary/20 text-primary transition-all font-bold text-xs cursor-pointer shadow-xs border border-primary/25 hover:underline select-none"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const url = s.source_url.startsWith("http")
                                      ? s.source_url
                                      : `https://${s.source_url}`;
                                    window.open(url, "_blank", "noopener,noreferrer");
                                  }}
                                >
                                  <span>{language === "hi" ? "आधिकारिक लिंक" : "Official Link"}</span>
                                  <ExternalLink className="w-3 h-3 shrink-0" />
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================= AI CIVIC ASSISTANT ================= */}
        {/* Removed inline Civic Assistant to replace with a floating chat widget */}
      </div>

      {/* Floating Sparkle FAB Widget */}
      <div className="fixed bottom-6 right-6 z-[1100] flex flex-col items-end pointer-events-none">
        {/* Floating Chat Panel */}
        <div
          className={`mb-4 w-96 max-w-[calc(100vw-2rem)] h-[550px] max-h-[calc(100vh-6rem)] bg-card rounded-3xl border border-border shadow-2xl flex flex-col overflow-hidden transition-all duration-300 origin-bottom-right ${
            isChatOpen
              ? "opacity-100 scale-100 translate-y-0 pointer-events-auto"
              : "opacity-0 scale-90 translate-y-10 pointer-events-none"
          }`}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-primary to-indigo-600 p-4 text-white flex items-center justify-between shadow-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center border border-white/10 shadow-sm relative">
                <Bot className="w-5 h-5 text-white" />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-green-500 border-2 border-primary rounded-full"></span>
              </div>
              <div className="text-left">
                <h4 className="font-extrabold text-sm tracking-wide">Samadhan AI</h4>
                <p className="text-[10px] text-white/80 font-medium">Online • Responds in Hindi & English</p>
              </div>
            </div>
            <button
              onClick={() => setIsChatOpen(false)}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white focus:outline-none"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages Window */}
          <div className="flex-1 p-4 overflow-y-auto space-y-4 bg-muted/5 min-h-0">
            {messages.map((m, i) => (
              <div key={i} className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : "text-left"}`}>
                <div
                  className={`w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white shadow-sm ${
                    m.role === "user" ? "bg-secondary" : "bg-primary"
                  }`}
                >
                  {m.role === "user" ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                </div>
                <div
                  className={`max-w-[75%] p-3 rounded-2xl text-xs font-medium leading-relaxed border shadow-sm ${
                    m.role === "user"
                      ? "bg-secondary/10 border-secondary/20 text-foreground text-left rounded-tr-none"
                      : "bg-card border-border/80 text-foreground rounded-tl-none"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {isChatLoading && (
              <div className="flex gap-2.5 text-left">
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white shrink-0 shadow-sm">
                  <Bot className="w-4 h-4" />
                </div>
                <div className="bg-card border border-border/80 p-3 rounded-2xl rounded-tl-none flex items-center gap-2 text-xs text-muted-foreground shadow-sm">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  Samadhan is typing...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Helper / Suggestion Chips */}
          <div className="px-4 py-2 bg-muted/10 border-t border-border/40">
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto py-1">
              {sampleQuestions[language].map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(q)}
                  className="text-[10px] text-left px-3 py-1.5 rounded-full border border-border/80 bg-card hover:bg-muted transition-colors font-semibold text-foreground/80 hover:text-foreground shadow-sm"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Chat Input Controls */}
          <div className="p-3 border-t border-border flex gap-2 bg-card items-center">
            {isSpeechSupported && (
              <Button
                onClick={toggleListening}
                variant="outline"
                size="icon"
                className={`rounded-full shrink-0 w-9 h-9 ${isListening ? "bg-red-500/10 hover:bg-red-500/20 text-red-500 border-red-500/30 animate-pulse" : ""}`}
              >
                {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              </Button>
            )}
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Ask anything about government schemes..."
              className="flex-1 min-w-0 px-3 py-2 rounded-full bg-muted border border-transparent focus:outline-none focus:bg-background focus:ring-2 focus:ring-primary/40 text-xs transition-all"
            />
            <Button
              onClick={() => handleSend()}
              disabled={isChatLoading}
              size="icon"
              className="rounded-full shrink-0 w-9 h-9 bg-primary hover:bg-primary/95 text-white"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Circular Sparkle FAB Button */}
        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 transform hover:scale-105 active:scale-95 focus:outline-none hover:shadow-primary/30 hover:shadow-xl pointer-events-auto ${
            isChatOpen
              ? "bg-slate-700 hover:bg-slate-800 text-white"
              : "bg-gradient-to-r from-primary to-indigo-600 hover:from-primary/90 hover:to-indigo-650 text-white"
          }`}
        >
          {isChatOpen ? (
            <X className="w-6 h-6 transition-transform duration-300 rotate-90" />
          ) : (
            <Sparkles className="w-6 h-6 transition-transform duration-300" />
          )}
        </button>
      </div>
    </section>
  );
}
