import React, { useEffect, useRef } from "react";
import { Link, useLocation } from "react-router-dom";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { ROUTES } from "@/shared/config/routes";
import { Button } from "@/shared/components/ui/button";
import { PageMeta } from "@/shared/components/PageMeta";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MapPin,
  ArrowRight,
  CheckCircle2,
  Award,
  Sparkles,
  Zap,
  Map,
  Cpu,
  CheckCheck,
  ChevronRight,
  HardHat,
  AlertTriangle,
} from "lucide-react";

/**
 * Structured data for the landing page. Hoisted to module scope so the object
 * identity is stable — PageMeta keys its effect on it.
 */
const LANDING_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "GovernmentService",
  name: "Samadhan",
  alternateName: "समाधान",
  description:
    "Municipal civic issue reporting and resolution tracking. Citizens report problems with roads, water supply, electricity, sanitation, parks and buildings; reports are routed to the responsible department and tracked against a service-level deadline until resolved.",
  serviceType: "Civic issue reporting and grievance redressal",
  availableChannel: {
    "@type": "ServiceChannel",
    serviceUrl: "https://samadhan.gov.in/",
    availableLanguage: [
      { "@type": "Language", name: "English", alternateName: "en" },
      { "@type": "Language", name: "Hindi", alternateName: "hi" },
    ],
  },
  areaServed: {
    "@type": "AdministrativeArea",
    name: "Madhya Pradesh, India",
  },
  provider: {
    "@type": "GovernmentOrganization",
    name: "Samadhan Civic Platform",
    url: "https://samadhan.gov.in/",
  },
  audience: { "@type": "Audience", audienceType: "Residents" },
} as const;

/**
 * react-router types location.state as unknown, because any caller can put
 * anything there. Only this one key is read, so only this one key is checked.
 */
function scrollTargetFrom(state: unknown): string | null {
  if (typeof state === "object" && state !== null) {
    const target = (state as { scrollToSection?: unknown }).scrollToSection;
    if (typeof target === "string" && target) return target;
  }
  return null;
}

export default function Landing() {
  const { language } = useLanguage();
  const location = useLocation();

  const isHi = language === "hi";

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [23.233, 77.434],
        zoom: 15,
        zoomControl: false,
        dragging: false,
        touchZoom: false,
        doubleClickZoom: false,
        scrollWheelZoom: false,
        boxZoom: false,
        keyboard: false,
        attributionControl: false,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
      }).addTo(map);

      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const sectionId = scrollTargetFrom(location.state);
    if (sectionId) {
      window.history.replaceState({}, document.title);
      setTimeout(() => {
        const element = document.getElementById(sectionId);
        if (element) {
          const headerOffset = 80;
          const elementPosition = element.getBoundingClientRect().top;
          const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
          window.scrollTo({
            top: offsetPosition,
            behavior: "smooth",
          });
        }
      }, 100);
    }
  }, [location]);

  const stats = [
    {
      value: "50K+",
      label: isHi ? "हल की गई समस्याएं" : "Issues Resolved",
      subtext: isHi ? "सत्यापित समाधान" : "Verified across Bhopal",
    },
    {
      value: "2.5L+",
      label: isHi ? "सक्रिय नागरिक" : "Active Citizens",
      subtext: isHi ? "85 वार्डों में पंजीकृत" : "Across 85 Wards",
    },
    {
      value: "94%",
      label: isHi ? "समाधान दर" : "Resolution Rate",
      subtext: isHi ? "समय सीमा के भीतर" : "Within Official SLA",
    },
    {
      value: "24-48h",
      label: isHi ? "औसत निवारण समय" : "Avg. Resolution Time",
      subtext: isHi ? "त्वरित फील्ड कार्रवाई" : "Rapid Municipal Action",
    },
  ];

  const features = [
    {
      icon: <Cpu className="w-6 h-6 text-primary" />,
      badgeBg: "bg-primary/10",
      title: isHi ? "AI क्षति और गंभीरता पहचान" : "AI Damage & Severity Detection",
      description: isHi
        ? "तस्वीर अपलोड करते ही स्वचालित श्रेणी वर्गीकरण, गंभीरता स्कोर और डुप्लिकेट शिकायत पहचान।"
        : "Automated image recognition, severity grading, and immediate duplicate complaint filtering.",
    },
    {
      icon: <Map className="w-6 h-6 text-indigo-500" />,
      badgeBg: "bg-indigo-500/10",
      title: isHi ? "GIS-आधारित वार्ड लोकेशन मैपिंग" : "GIS-Based Ward & Location Mapping",
      description: isHi
        ? "सटीक जियो-कोऑर्डिनेट मैपिंग और वार्ड क्लस्टरिंग जिससे संबंधित अधिकारी तुरंत स्पॉट पर पहुंचे।"
        : "Precise geospatial coordinate mapping and ward-level clustering for pinpoint municipal routing.",
    },
    {
      icon: <CheckCheck className="w-6 h-6 text-emerald-500" />,
      badgeBg: "bg-emerald-500/10",
      title: isHi ? "पारदर्शी समाधान कार्यप्रवाह" : "Structured Resolution Workflows",
      description: isHi
        ? "लाइव प्रगति ट्रैकिंग, फील्ड इंजीनियर की फोटो प्रमाण और नागरिक पुष्टि के साथ पूर्ण ऑडिट ट्रेल।"
        : "End-to-end milestone tracking with engineer photo proofs, SLA timers, and citizen confirmation.",
    },
    {
      icon: <Zap className="w-6 h-6 text-amber-500" />,
      badgeBg: "bg-amber-500/10",
      title: isHi ? "रीयल-टाइम बहुभाषी अलर्ट" : "Real-Time Multilingual Alerts",
      description: isHi
        ? "हिंदी और अंग्रेजी में तुरंत स्थिति अपडेट और आपके क्षेत्र की गतिविधियों का लाइव सारांश।"
        : "Instant status notifications and seamless Hindi & English accessibility directly on your dashboard.",
    },
  ];

  const steps = [
    {
      num: "01",
      icon: <MapPin className="w-6 h-6 text-amber-500" />,
      iconBg: "bg-amber-500/10 border-amber-500/20",
      title: isHi ? "समस्या दर्ज करें" : "Report Civic Issue",
      description: isHi
        ? "फोटो खींचें, संक्षिप्त विवरण दें और ऑटो-डिटेक्टेड जीपीएस लोकेशन के साथ सबमिट करें।"
        : "Snap a photo, add details or a voice note with automatic GPS coordinates and ward detection.",
    },
    {
      num: "02",
      icon: <Sparkles className="w-6 h-6 text-rose-500" />,
      iconBg: "bg-rose-500/10 border-rose-500/20",
      title: isHi ? "AI वर्गीकरण व रूटिंग" : "AI Verification & Routing",
      description: isHi
        ? "AI इंजन श्रेणी पहचानता है, प्राथमिकता तय करता है और सीधे संबंधित नगर निगम विभाग को भेजता है।"
        : "The AI engine classifies the issue, assigns urgency score, and routes directly to the designated department.",
    },
    {
      num: "03",
      icon: <HardHat className="w-6 h-6 text-sky-500" />,
      iconBg: "bg-sky-500/10 border-sky-500/20",
      title: isHi ? "फील्ड मरम्मत कार्रवाई" : "Municipal Action & Repair",
      description: isHi
        ? "क्षेत्रीय इंजीनियर वर्क आर्डर प्राप्त करते हैं, टीम तैनात करते हैं और समाधान फोटो अपलोड करते हैं।"
        : "Field engineers receive work orders, dispatch repair teams, and upload resolution proof photos.",
    },
    {
      num: "04",
      icon: <Award className="w-6 h-6 text-emerald-500" />,
      iconBg: "bg-emerald-500/10 border-emerald-500/20",
      title: isHi ? "नागरिक सत्यापन व पुरस्कार" : "Citizen Verification & XP",
      description: isHi
        ? "नागरिक समाधान की पुष्टि करते हैं, कम्युनिटी हीरो XP व बैज जीतते हैं और वार्ड स्कोर बढ़ाते हैं।"
        : "Community verifies the fix, earns Community Hero XP, unlocks badges, and boosts ward civic score.",
    },
  ];

  const departments = [
    {
      code: "BMC",
      name: isHi ? "भोपाल नगर निगम (BMC)" : "Bhopal Municipal Corporation (BMC)",
      desc: isHi ? "शहरी निकाय, स्वच्छता एवं कचरा प्रबंधन" : "Urban Local Body & Public Sanitation Services",
      color: "bg-amber-500/10 text-amber-600 border-amber-500/20",
    },
    {
      code: "PWD",
      name: isHi ? "लोक निर्माण विभाग (PWD)" : "Public Works Department (PWD)",
      desc: isHi
        ? "मुख्य सड़कें, फ्लाईओवर व पुल निर्माण"
        : "Main Arterial Roads, Flyovers & Bridge Infrastructure",
      color: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    },
    {
      code: "BSCDCL",
      name: isHi ? "भोपाल स्मार्ट सिटी डेवलपमेंट (BSCDCL)" : "Bhopal Smart City Development Corp",
      desc: isHi ? "स्मार्ट सेंसर ग्रिड एवं आईओटी निगरानी" : "Smart Sensor Grid & Urban IoT Surveillance",
      color: "bg-purple-500/10 text-purple-600 border-purple-500/20",
    },
    {
      code: "MPMKVVCL",
      name: isHi ? "मध्य क्षेत्र विद्युत वितरण कंपनी" : "MP Madhya Kshetra Vidyut Vitaran",
      desc: isHi
        ? "विद्युत ग्रिड, ट्रांसफार्मर एवं स्ट्रीटलाइट"
        : "Power Distribution & Streetlighting Grids",
      color: "bg-orange-500/10 text-orange-600 border-orange-500/20",
    },
    {
      code: "NVDA",
      name: isHi ? "नर्मदा घाटी एवं जल कार्य विभाग" : "Narmada Valley & Water Works",
      desc: isHi ? "पेयजल आपूर्ति, पाइपलाइन व सीवरेज" : "Water Supply Pipelines & Sewerage Networks",
      color: "bg-teal-500/10 text-teal-600 border-teal-500/20",
    },
    {
      code: "TP",
      name: isHi ? "ट्रैफिक पुलिस एवं नागरिक सुरक्षा" : "Traffic Police & Civic Enforcement",
      desc: isHi
        ? "सड़क सुरक्षा, सिग्नल समन्वय व अतिक्रमण"
        : "Road Safety, Signal Systems & Encroachment Removal",
      color: "bg-rose-500/10 text-rose-600 border-rose-500/20",
    },
  ];

  return (
    <div className="relative min-h-screen bg-background text-foreground selection:bg-primary/20">
      <PageMeta
        title="Samadhan — Report civic issues and track how they get fixed"
        description="Report potholes, water supply failures, streetlight outages and sanitation problems to the right municipal department, then follow the work order until it is resolved."
        path="/"
        jsonLd={LANDING_JSON_LD}
      />
      {/* ── TOP HERO SECTION ── */}
      <section className="relative pt-6 pb-6 sm:pt-8 sm:pb-8 lg:pt-14 lg:pb-12 overflow-hidden border-b border-border/40">
        {/* Abstract Indian Flag Background & Grid Pattern */}
        <div className="absolute inset-0 pointer-events-none select-none z-0 overflow-hidden flex items-center justify-center">
          <div className="w-[125%] sm:w-[115%] md:w-[105%] max-w-6xl aspect-[500/300] opacity-[0.14] dark:opacity-[0.06] transform -rotate-[10deg] scale-110 -translate-x-[4%] -translate-y-[8%]">
            <IndianFlagBrush />
          </div>

          {/* Subtle Grid Pattern Overlay */}
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23000' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
        </div>

        <div className="container mx-auto px-6 sm:px-8 lg:px-12 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Left Content Column */}
            <div className="lg:col-span-7 text-left flex flex-col items-start justify-center">
              {/* Main Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-[60px] font-black text-foreground tracking-tight leading-[1.08] mb-6">
                {isHi ? (
                  <>
                    एक शहर। <br />
                    एक मंच। <br />
                    <span className="text-[#0B3B60] dark:text-sky-400">एक योजना।</span>
                  </>
                ) : (
                  <>
                    One Platform. <br />
                    <span className="text-[#0B3B60] dark:text-sky-400 font-extrabold">One Plan.</span>
                  </>
                )}
              </h1>

              {/* Subtext */}
              <p className="text-base sm:text-lg text-slate-600 dark:text-slate-400 max-w-xl leading-relaxed font-medium mb-3">
                {isHi
                  ? "रीयल-टाइम समन्वय के माध्यम से दोहरे उत्खनन और अंतर-विभागीय संघर्ष को समाप्त करें।"
                  : "Eliminate duplicate excavation and inter-departmental conflict via real-time coordination."}
              </p>

              <p className="text-sm sm:text-base text-slate-700 dark:text-slate-300 max-w-xl leading-relaxed font-semibold mb-8">
                {isHi
                  ? "भोपाल नगर निगम और स्मार्ट सिटी मिशन के तत्वावधान में।"
                  : "Under the aegis of Bhopal Municipal Corporation & Smart Cities Mission."}
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-4 mb-10">
                <Link to={ROUTES.SIGN_IN}>
                  <Button className="bg-[#0B3B60] hover:bg-[#082a45] text-white font-bold px-6 py-6 rounded-2xl shadow-lg shadow-[#0B3B60]/20 gap-2 text-sm group transition-all">
                    <span>{isHi ? "पोर्टल पर लॉग इन करें" : "Login to Portal"}</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </Link>
                <Link to={ROUTES.DASHBOARD}>
                  <Button
                    variant="outline"
                    className="font-bold px-6 py-6 rounded-2xl border-border/80 hover:bg-muted/60 text-foreground gap-2 text-sm transition-all bg-[#0B3B60]/5 dark:bg-[#38bdf8]/5 border-[#0B3B60]/20 dark:border-[#38bdf8]/20"
                  >
                    <span>{isHi ? "नागरिक पोर्टल देखें" : "View Citizen Portal"}</span>
                  </Button>
                </Link>
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full pt-6 border-t border-border/60">
                {stats.map((stat, idx) => (
                  <div key={idx} className="space-y-0.5">
                    <p className="text-xl sm:text-2xl font-extrabold text-foreground tracking-tight">
                      {stat.value}
                    </p>
                    <p className="text-xs font-bold text-foreground/80">{stat.label}</p>
                    <p className="text-[10px] text-muted-foreground">{stat.subtext}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Hero Visual Mockup: GIS Radar & Live Issues */}
            <div className="lg:col-span-5 relative">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                {/* Main Card */}
                <div className="bg-card border-2 border-border/90 rounded-3xl p-4 shadow-xl space-y-3 text-left relative overflow-hidden backdrop-blur-sm">
                  {/* Card Header */}
                  <div className="flex items-center justify-between pb-2.5 border-b border-border/60">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                        🏛️
                      </div>
                      <div>
                        <p className="text-xs font-bold text-foreground">
                          {isHi ? "भोपाल स्मार्ट सिटी • जीआईएस ग्रिड" : "Smart City Bhopal • GIS Grid"}
                        </p>
                        <p className="text-[10px] text-muted-foreground font-medium">
                          Ward 34 • MP Nagar Zone
                        </p>
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                      Live Feed
                    </span>
                  </div>

                  {/* Mock Radar Grid Visual */}
                  <div className="relative h-56 sm:h-64 w-full rounded-2xl border border-border/60 overflow-hidden flex items-center justify-center">
                    {/* Leaflet Map base */}
                    <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0" />

                    {/* Subtle Overlay to blend the map and grid/pins */}
                    <div className="absolute inset-0 bg-[#f8fafc]/10 dark:bg-slate-950/20 pointer-events-none z-10" />

                    {/* Grid Pattern Lines */}
                    <div
                      className="absolute inset-0 opacity-15 pointer-events-none z-15"
                      style={{
                        backgroundImage: `linear-gradient(to right, #888 1px, transparent 1px), linear-gradient(to bottom, #888 1px, transparent 1px)`,
                        backgroundSize: "28px 28px",
                      }}
                    />

                    {/* Concentric Radar Rings */}
                    <div className="absolute w-44 h-44 rounded-full border border-primary/20 animate-ping opacity-25 z-20 pointer-events-none" />
                    <div className="absolute w-36 h-36 rounded-full border border-primary/35 z-20 pointer-events-none" />
                    <div className="absolute w-20 h-20 rounded-full border border-primary/45 bg-primary/5 z-20 pointer-events-none" />

                    {/* Center Pin */}
                    <div className="relative z-30 w-7 h-7 rounded-full bg-rose-500/20 border-2 border-rose-500 flex items-center justify-center shadow-lg shadow-rose-500/30">
                      <div className="w-2 rounded-full bg-rose-500" />
                    </div>

                    {/* Surrounding Issue Nodes */}
                    <div className="absolute top-10 left-10 flex items-center gap-1 px-2 py-0.5 bg-card/90 backdrop-blur-md rounded-xl border border-border/80 shadow-sm text-[10px] font-bold z-35">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>{isHi ? "रोड लाइट हल" : "Light Fixed"}</span>
                    </div>

                    <div className="absolute bottom-10 left-12 flex items-center gap-1 px-2 py-0.5 bg-card/90 backdrop-blur-md rounded-xl border border-border/80 shadow-sm text-[10px] font-bold z-35">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      <span>{isHi ? "जल पाइपलाइन" : "Water Pipe"}</span>
                    </div>

                    <div className="absolute top-12 right-8 flex items-center gap-1 px-2 py-0.5 bg-card/90 backdrop-blur-md rounded-xl border border-border/80 shadow-sm text-[10px] font-bold z-35">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                      <span>{isHi ? "गड्ढा मरम्मत" : "Pothole"}</span>
                    </div>

                    <div className="absolute bottom-5 right-6 flex items-center gap-1 px-2 py-0.5 bg-card/90 backdrop-blur-md rounded-xl border border-border/80 shadow-sm text-[10px] font-bold z-35">
                      <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                      <span>{isHi ? "सफाई कार्य" : "Sanitation"}</span>
                    </div>
                  </div>

                  {/* Card Bottom Status */}
                  <div className="flex items-center justify-between pt-0.5 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      {isHi ? "5 सक्रिय परियोजनाएं" : "5 Active Projects"}
                    </span>
                    <Link
                      to={ROUTES.CIVIC_MAP}
                      className="text-xs font-bold text-primary hover:underline flex items-center gap-0.5"
                    >
                      <span>{isHi ? "मानचित्र खोलें" : "Open Radar"}</span>
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 2: EVERYTHING YOUR CITY NEEDS ── */}
      <section
        id="solution-section"
        className="pt-6 pb-10 sm:pt-8 sm:pb-12 bg-muted/20 border-b border-border/40"
      >
        <div className="container mx-auto px-4 sm:px-6 text-center max-w-5xl space-y-8">
          <div className="space-y-2 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {isHi ? "आपके शहर की हर जरूरत, एक ही स्थान पर" : "Everything your city needs, in one place"}
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {isHi
                ? "नागरिकों और नगर पालिका विभागों के बीच बिना किसी देरी या डुप्लिकेट शिकायतों के सहज समन्वय के लिए निर्मित।"
                : "Built for citizens and municipal departments to coordinate civic infrastructure without conflicts, delays, or duplicated effort."}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left">
            {features.map((f, i) => (
              <div
                key={i}
                className="bg-card rounded-3xl border border-border/80 p-5 sm:p-6 shadow-sm hover:shadow-md hover:border-primary/40 transition-all space-y-2.5 group"
              >
                <div
                  className={`w-10 h-10 rounded-2xl ${f.badgeBg} flex items-center justify-center transition-transform group-hover:scale-105`}
                >
                  {f.icon}
                </div>
                <h3 className="text-base font-bold text-foreground">{f.title}</h3>
                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 3: HOW REDRESSAL WORKS (4 STEP CARDS) ── */}
      <section id="how-it-works-section" className="py-10 sm:py-12 border-b border-border/40">
        <div className="container mx-auto px-4 sm:px-6 text-center max-w-5xl space-y-8">
          <div className="space-y-2 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {isHi ? "नागरिक समस्या समाधान कैसे कार्य करता है" : "How Coordinated Redressal Works"}
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {isHi
                ? "हमारी स्वचालित प्रणाली शिकायत दर्ज करने से लेकर फील्ड सत्यापन व समाधान तक हर कदम पर मार्गदर्शन करती है।"
                : "Our automated system guides issues through proposal, AI verification, municipal repair, and final community verification."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-left">
            {steps.map((s, i) => (
              <div
                key={i}
                className="bg-card rounded-3xl border border-border/80 p-5 shadow-sm flex flex-col justify-between space-y-4 hover:shadow-md transition-all relative overflow-hidden"
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`w-10 h-10 rounded-2xl border ${s.iconBg} flex items-center justify-center`}
                  >
                    {s.icon}
                  </div>
                  <span className="text-xs font-black text-muted-foreground/60 tracking-wider">{s.num}</span>
                </div>
                <div className="space-y-1.5">
                  <h3 className="text-sm font-bold text-foreground">{s.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 4: INTEGRATED BHOPAL DEPARTMENTS ── */}
      <section id="departments-section" className="py-10 sm:py-12 bg-muted/20 border-b border-border/40">
        <div className="container mx-auto px-4 sm:px-6 text-center max-w-5xl space-y-8">
          <div className="space-y-2 max-w-2xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight">
              {isHi ? "एकीकृत भोपाल नगर पालिका विभाग" : "Integrated Bhopal Departments"}
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {isHi
                ? "मध्य प्रदेश शासन और नगर निकायों के बीच रीयल-टाइम शिकायत समाधान एवं डेटा सिंक्रनाइज़ेशन।"
                : "Real-time pipeline data and project synchronization across Madhya Pradesh state and municipal bodies."}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-left">
            {departments.map((dept, i) => (
              <div
                key={i}
                className="bg-card rounded-3xl border border-border/80 p-4 shadow-sm hover:border-primary/40 transition-all flex items-start gap-3.5"
              >
                <div
                  className={`w-9 h-9 rounded-xl border flex items-center justify-center font-bold text-xs shrink-0 ${dept.color}`}
                >
                  {dept.code.slice(0, 2)}
                </div>
                <div className="space-y-0.5 min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold text-foreground leading-snug truncate">
                    {dept.name}
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                    {dept.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 5: PUBLIC TRANSPARENCY ── */}
      <section id="citizen-portal-section" className="py-10 sm:py-12 border-b border-border/40">
        <div className="container mx-auto px-4 sm:px-6 max-w-5xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Left Info Column */}
            <div className="lg:col-span-5 text-left space-y-4">
              <span className="inline-flex items-center px-3 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 uppercase tracking-wider">
                {isHi ? "सार्वजनिक पारदर्शिता" : "PUBLIC TRANSPARENCY"}
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-foreground tracking-tight leading-tight">
                {isHi
                  ? "नागरिकों का सशक्तिकरण। जवाबदेह शासन।"
                  : "Empowering Citizens. Ensuring Accountable Infrastructure."}
              </h2>
              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {isHi
                  ? "समाधान मंच स्थानीय निवासियों को सीधे नगर निगम के समन्वय डेटा से जोड़ता है। नागरिक सक्रिय मरम्मत कार्य देख सकते हैं, सुरक्षा चिंताएं दर्ज कर सकते हैं और फीडबैक दे सकते हैं।"
                  : "Samadhan connects local residents directly with municipal coordination data. Citizens can view live issues, report safety concerns, or provide feedback on public infrastructure."}
              </p>
              <Link
                to={ROUTES.DASHBOARD}
                className="inline-flex items-center gap-2 text-xs sm:text-sm font-bold text-primary hover:underline"
              >
                <span>{isHi ? "सार्वजनिक पोर्टल खोलें" : "Enter Public Portal"}</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {/* Right 3 Action Cards */}
            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-left">
              {/* Card 1: Live Map */}
              <div className="bg-card rounded-3xl border border-border/80 p-4 shadow-sm hover:border-primary/40 transition-all flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <Map className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-foreground">
                    {isHi ? "लाइव नागरिक मानचित्र" : "Live Civic Map"}
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {isHi
                      ? "भोपाल में सक्रिय और हल की गई समस्याओं को रीयल-टाइम में देखें।"
                      : "View active and resolved civic issues across Bhopal in real-time."}
                  </p>
                </div>
                <Link
                  to={ROUTES.CIVIC_MAP}
                  className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
                >
                  <span>{isHi ? "मानचित्र खोलें" : "Open Map"}</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>

              {/* Card 2: Report */}
              <div className="bg-card rounded-3xl border border-border/80 p-4 shadow-sm hover:border-primary/40 transition-all flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-foreground">
                    {isHi ? "शिकायत दर्ज करें" : "Report Civic Issue"}
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {isHi
                      ? "सड़क, पानी या स्वच्छता संबंधी समस्याओं की तुरंत रिपोर्ट करें।"
                      : "File complaints regarding potholes, water leaks, or public sanitation."}
                  </p>
                </div>
                <Link
                  to={ROUTES.REPORT_ISSUE}
                  className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
                >
                  <span>{isHi ? "रिपोर्ट करें" : "File Report"}</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>

              {/* Card 3: Hero Leaderboard */}
              <div className="bg-card rounded-3xl border border-border/80 p-4 shadow-sm hover:border-primary/40 transition-all flex flex-col justify-between space-y-3">
                <div className="space-y-2">
                  <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Award className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs sm:text-sm font-bold text-foreground">
                    {isHi ? "कम्युनिटी लीडरबोर्ड" : "Community Hero"}
                  </h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {isHi
                      ? "समस्या समाधान सत्यापित करें, अंक अर्जित करें और अपने वार्ड का नेतृत्व करें।"
                      : "Verify civic repairs, earn XP badges, and lead your neighborhood ranking."}
                  </p>
                </div>
                <Link
                  to={`${ROUTES.PROFILE}?tab=hero`}
                  className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
                >
                  <span>{isHi ? "लीडरबोर्ड देखें" : "View Rankings"}</span>
                  <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SECTION 6: READY TO COORDINATE SMARTER (NAVY CTA BANNER) ── */}
      <section className="py-6 sm:py-8">
        <div className="container mx-auto px-4 sm:px-6 max-w-3xl">
          <div className="bg-[#0B3B60] text-white rounded-2xl p-5 sm:p-7 text-center space-y-3 shadow-lg relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute -right-16 -bottom-16 w-48 h-48 bg-sky-400/20 rounded-full blur-2xl pointer-events-none" />
            <div className="absolute -left-16 -top-16 w-48 h-48 bg-primary/30 rounded-full blur-2xl pointer-events-none" />

            <h2 className="text-xl sm:text-2xl font-extrabold tracking-tight relative z-10">
              {isHi ? "क्या आप स्मार्ट समाधान के लिए तैयार हैं?" : "Ready to coordinate smarter?"}
            </h2>
            <p className="text-xs text-white/80 max-w-lg mx-auto leading-relaxed relative z-10">
              {isHi
                ? "भोपाल भर के हजारों नागरिकों और नगर निगम टीमों से जुड़ें जो पहले से ही बेहतर बुनियादी ढांचे के लिए समाधान का उपयोग कर रहे हैं।"
                : "Join citizens and municipal departments across Bhopal already using Samadhan to eliminate civic delays and build better infrastructure."}
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1 relative z-10">
              <Link to={ROUTES.REPORT_ISSUE}>
                <Button className="bg-white hover:bg-white/90 text-[#0B3B60] font-bold px-5 py-2.5 rounded-xl shadow-md gap-1.5 text-xs transition-all">
                  <span>{isHi ? "समस्या दर्ज करें" : "Report an Issue"}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
              <Link to={ROUTES.CIVIC_MAP}>
                <Button
                  variant="outline"
                  className="border-white/30 text-white hover:bg-white/10 font-bold px-5 py-2.5 rounded-xl gap-1.5 text-xs transition-all"
                >
                  <Map className="w-3.5 h-3.5 text-white" />
                  <span>{isHi ? "नागरिक पोर्टल देखें" : "Citizen Portal"}</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Clean Vector Indian Flag SVG ──────────────────────────────
function _CleanIndianFlag() {
  return (
    <svg
      viewBox="0 0 500 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full filter drop-shadow-sm"
    >
      <defs>
        {/* Gradients for smooth, clean vector 3D look */}
        <linearGradient id="flag-saffron-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF9933" />
          <stop offset="100%" stopColor="#E67E22" />
        </linearGradient>
        <linearGradient id="flag-green-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#138808" />
          <stop offset="100%" stopColor="#0F6F06" />
        </linearGradient>
        <linearGradient id="flag-white-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="100%" stopColor="#F5F5F5" />
        </linearGradient>
      </defs>

      {/* Flag Stripes (rendered with precise wave curves) */}
      <g>
        {/* Saffron Stripe */}
        <path
          d="M 40,60 C 130,45 220,75 310,60 C 390,48 450,58 470,60 L 470,105 C 450,103 390,93 310,105 C 220,120 130,90 40,105 Z"
          fill="url(#flag-saffron-grad)"
        />

        {/* White Stripe */}
        <path
          d="M 40,105 C 130,90 220,120 310,105 C 390,93 450,103 470,105 L 470,150 C 450,148 390,138 310,150 C 220,165 130,135 40,150 Z"
          fill="url(#flag-white-grad)"
        />

        {/* Green Stripe */}
        <path
          d="M 40,150 C 130,135 220,165 310,150 C 390,138 450,148 470,150 L 470,195 C 450,193 390,183 310,195 C 220,210 130,180 40,195 Z"
          fill="url(#flag-green-grad)"
        />
      </g>

      {/* Ashoka Chakra */}
      <g transform="translate(255, 127)">
        <circle cx="0" cy="0" r="21" stroke="#000080" strokeWidth="2.5" fill="none" />
        <circle cx="0" cy="0" r="3.5" fill="#000080" />
        {/* 24 Spokes */}
        {[...Array(24)].map((_, i) => {
          const angle = (i * 360) / 24;
          const rad = (angle * Math.PI) / 180;
          const x2 = 21 * Math.cos(rad);
          const y2 = 21 * Math.sin(rad);
          return <line key={i} x1={0} y1={0} x2={x2} y2={y2} stroke="#000080" strokeWidth="1.2" />;
        })}
        {/* Tiny dots on the outer edge */}
        {[...Array(24)].map((_, i) => {
          const angle = ((i + 0.5) * 360) / 24;
          const rad = (angle * Math.PI) / 180;
          const cx = 19.5 * Math.cos(rad);
          const cy = 19.5 * Math.sin(rad);
          return <circle key={`dot-${i}`} cx={cx} cy={cy} r="0.7" fill="#000080" />;
        })}
      </g>
    </svg>
  );
}

// ── Stylized Brush Painted Indian Flag SVG ──────────────────────
function IndianFlagBrush() {
  return (
    <svg
      viewBox="0 0 500 300"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-full h-full filter drop-shadow-md"
    >
      <defs>
        {/* The filter to create the rough, organic hand-painted brush edges */}
        <filter id="brush-edges" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" result="noise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="15"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        {/* Gradient for subtle flag texture */}
        <linearGradient id="brush-saffron" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#FF9933" />
          <stop offset="100%" stopColor="#FF771F" />
        </linearGradient>
        <linearGradient id="brush-green" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#138808" />
          <stop offset="100%" stopColor="#0B6B04" />
        </linearGradient>
      </defs>

      {/* Flag Stripes (rendered with the displacement filter) */}
      <g filter="url(#brush-edges)">
        {/* Saffron Stripe (slightly wavy path) */}
        <path
          d="M 40,55 C 120,40 240,65 360,45 C 430,35 470,50 480,55 L 475,100 C 460,95 420,85 360,95 C 240,115 120,85 35,100 Z"
          fill="url(#brush-saffron)"
          opacity="0.95"
        />

        {/* White Stripe (slightly overlapping the saffron and green) */}
        <path
          d="M 33,103 C 115,88 235,112 355,95 C 425,85 465,97 478,103 L 473,150 C 458,145 418,135 355,145 C 235,162 115,135 30,150 Z"
          fill="#FFFFFF"
          opacity="0.98"
        />

        {/* Green Stripe */}
        <path
          d="M 28,153 C 110,138 230,162 350,145 C 420,135 460,147 473,153 L 468,198 C 453,193 413,183 350,193 C 230,210 110,183 25,198 Z"
          fill="url(#brush-green)"
          opacity="0.95"
        />

        {/* Small paint splatters for realistic brush effect */}
        <circle cx="25" cy="50" r="3" fill="#FF9933" opacity="0.7" />
        <circle cx="485" cy="70" r="4" fill="#FF9933" opacity="0.6" />
        <circle cx="490" cy="165" r="3" fill="#138808" opacity="0.6" />
        <circle cx="15" cy="180" r="5" fill="#138808" opacity="0.7" />
        <circle cx="18" cy="120" r="2" fill="#777777" opacity="0.4" />
      </g>

      {/* Ashoka Chakra (not filtered, needs to remain sharp and clean) */}
      <g transform="translate(250, 125)">
        <circle cx="0" cy="0" r="23" stroke="#000080" strokeWidth="2.5" fill="none" />
        <circle cx="0" cy="0" r="4" fill="#000080" />
        {/* 24 Spokes */}
        {[...Array(24)].map((_, i) => {
          const angle = (i * 360) / 24;
          const rad = (angle * Math.PI) / 180;
          const x2 = 23 * Math.cos(rad);
          const y2 = 23 * Math.sin(rad);
          return <line key={i} x1={0} y1={0} x2={x2} y2={y2} stroke="#000080" strokeWidth="1.2" />;
        })}
        {/* Tiny decorative circles between spokes at the outer edge */}
        {[...Array(24)].map((_, i) => {
          const angle = ((i + 0.5) * 360) / 24;
          const rad = (angle * Math.PI) / 180;
          const cx = 21.5 * Math.cos(rad);
          const cy = 21.5 * Math.sin(rad);
          return <circle key={`dot-${i}`} cx={cx} cy={cy} r="0.8" fill="#000080" />;
        })}
      </g>
    </svg>
  );
}
