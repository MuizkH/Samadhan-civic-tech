import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useLanguage } from "@/app/providers/LanguageProvider";

/**
 * Persistent banner while the browser reports no network (PS #10). Without
 * it, every request simply fails and the app looks broken for no stated
 * reason.
 */
export function ConnectionBanner() {
  const { language } = useLanguage();
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="alert"
      className="fixed top-0 inset-x-0 z-[2000] bg-destructive text-destructive-foreground px-4 py-2 text-center text-xs font-semibold flex items-center justify-center gap-2"
    >
      <WifiOff className="w-3.5 h-3.5" />
      {language === "en"
        ? "You're offline. Reports and updates won't save until the connection is back."
        : "आप ऑफ़लाइन हैं। कनेक्शन लौटने तक रिपोर्ट और अपडेट सहेजे नहीं जाएंगे।"}
    </div>
  );
}
