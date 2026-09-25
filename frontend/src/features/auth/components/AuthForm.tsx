import { useState, useRef } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { useToast } from "@/shared/hooks/use-toast";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { authService } from "../services/authService";
import { loginSchema } from "../validation/loginSchema";
import { signupSchema } from "../validation/signupSchema";
import { ROUTES } from "@/shared/config/routes";
import {
  Shield,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Loader2,
  ArrowLeft,
  Globe,
  MapPin,
  Building,
  Key,
} from "lucide-react";
import { logger } from "@/shared/services/logger";
import { getErrorMessage } from "@/shared/lib/errorMessage";

/**
 * Autofill shortcuts for the seeded demo accounts. Display-only — these
 * emails/passwords exist in the database (see backend/prisma/seed.ts), so
 * sign-in still goes through the real /auth/login endpoint.
 */
interface DemoCredential {
  email: string;
  password: string;
  fullName: string;
  city: string;
  state: string;
  roleLabel: string;
}

const DEMO_CITY = "Bhopal";
const DEMO_STATE = "Madhya Pradesh";

const DEMO_CREDENTIALS: DemoCredential[] = [
  {
    email: "admin@samadhan.gov",
    password: "admin123",
    fullName: "Super Admin",
    roleLabel: "Super Admin",
    city: DEMO_CITY,
    state: DEMO_STATE,
  },
  {
    email: "dept.water@samadhan.gov",
    password: "dept123",
    fullName: "Jal Board Admin",
    roleLabel: "Water Supply",
    city: DEMO_CITY,
    state: DEMO_STATE,
  },
  {
    email: "dept.sanitation@samadhan.gov",
    password: "dept123",
    fullName: "Sanitation Admin",
    roleLabel: "Sanitation",
    city: DEMO_CITY,
    state: DEMO_STATE,
  },
  {
    email: "dept.electricity@samadhan.gov",
    password: "dept123",
    fullName: "Electricity Admin",
    roleLabel: "Electricity",
    city: DEMO_CITY,
    state: DEMO_STATE,
  },
  {
    email: "dept.pwd@samadhan.gov",
    password: "dept123",
    fullName: "PWD Admin",
    roleLabel: "Roads (PWD)",
    city: DEMO_CITY,
    state: DEMO_STATE,
  },
  {
    email: "dept.parks@samadhan.gov",
    password: "dept123",
    fullName: "Parks Admin",
    roleLabel: "Parks & Gardens",
    city: DEMO_CITY,
    state: DEMO_STATE,
  },
  {
    email: "dept.buildings@samadhan.gov",
    password: "dept123",
    fullName: "Buildings Admin",
    roleLabel: "Buildings",
    city: DEMO_CITY,
    state: DEMO_STATE,
  },
  {
    email: "dept.metro@samadhan.gov",
    password: "dept123",
    fullName: "Bhopal Metro Admin",
    roleLabel: "Metro & Transit",
    city: DEMO_CITY,
    state: DEMO_STATE,
  },
  {
    email: "citizen@samadhan.gov",
    password: "citizen123",
    fullName: "Citizen User",
    roleLabel: "Citizen",
    city: DEMO_CITY,
    state: DEMO_STATE,
  },
];

export function AuthForm() {
  const location = useLocation();
  const isSignUp = location.pathname === ROUTES.SIGN_UP;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, language, setLanguage } = useLanguage();

  const demoCredentialsRef = useRef<HTMLDivElement>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleScrollToDemo = () => {
    demoCredentialsRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSelectDemo = (demo: DemoCredential) => {
    setEmail(demo.email);
    setPassword(demo.password);
    if (isSignUp) {
      setFullName(demo.fullName);
      setCity(demo.city);
      setState(demo.state);
      setConfirmPassword(demo.password);
    }
    toast({
      title: language === "en" ? "Demo Account Selected" : "डेमो खाता चुना गया",
      description: `${demo.roleLabel} (${demo.email})`,
    });
  };

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "hi" : "en");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isSignUp) {
        // Validate signup Zod schema
        const validation = signupSchema.safeParse({
          fullName,
          email,
          city,
          state,
          password,
          confirmPassword,
        });

        if (!validation.success) {
          const firstErr = validation.error.errors[0]?.message || "Validation failed";
          toast({
            title: language === "en" ? "Error" : "त्रुटि",
            description: firstErr,
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        await authService.signUp({
          fullName: validation.data.fullName,
          email: validation.data.email,
          city: validation.data.city,
          state: validation.data.state,
          password: validation.data.password,
          confirmPassword: validation.data.confirmPassword,
        });

        toast({
          title: language === "en" ? "Account created!" : "खाता बन गया!",
          description:
            language === "en"
              ? "Welcome to Samadhan. You can now sign in."
              : "समाधान में आपका स्वागत है। अब आप साइन इन कर सकते हैं।",
        });
        navigate(ROUTES.SIGN_IN);
      } else {
        // Validate login Zod schema
        const validation = loginSchema.safeParse({ email, password });

        if (!validation.success) {
          const firstErr = validation.error.errors[0]?.message || "Validation failed";
          toast({
            title: language === "en" ? "Error" : "त्रुटि",
            description: firstErr,
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        const signInResult = await authService.signIn({
          email: validation.data.email,
          password: validation.data.password,
        });

        let isAdmin = false;
        if (signInResult?.user) {
          try {
            const { adminService } = await import("@/features/admin/services/adminService");
            isAdmin = await adminService.checkIsAdmin(signInResult.user.id);
          } catch (e) {
            logger.error("Failed to check admin status on sign in:", e);
          }
        }

        toast({
          title: language === "en" ? "Welcome back!" : "वापस स्वागत है!",
          description:
            language === "en" ? "You have successfully signed in." : "आपने सफलतापूर्वक साइन इन कर लिया है।",
        });

        if (isAdmin) {
          navigate(ROUTES.ADMIN);
        } else {
          navigate(ROUTES.DASHBOARD);
        }
      }
    } catch (error) {
      logger.error("Authentication action failed:", error);
      toast({
        title: language === "en" ? "Error" : "त्रुटि",
        description: getErrorMessage(error, "An authentication error occurred."),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* ── ORIGINAL FULL SCREEN SPLIT LOGIN LAYOUT ── */}
      <div className="flex flex-1 w-full min-h-screen">
        {/* Left Panel - Branding */}
        <div className="hidden lg:flex lg:w-1/2 civic-gradient relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23fff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
              }}
            />
          </div>

          <div className="relative z-10 flex flex-col justify-center px-12 text-primary-foreground">
            <Link to={ROUTES.LANDING} className="flex items-center gap-3 mb-12">
              <div className="w-14 h-14 rounded-2xl bg-primary-foreground/20 flex items-center justify-center shadow-lg">
                <span className="text-primary-foreground font-bold text-2xl">स</span>
              </div>
              <div>
                <h1 className="font-bold text-2xl">Samadhan</h1>
                <p className="text-sm text-primary-foreground/70">समाधान</p>
              </div>
            </Link>

            <h2 className="text-4xl font-bold mb-6 leading-tight">
              {language === "en"
                ? "Empowering Citizens Through Technology"
                : "प्रौद्योगिकी के माध्यम से नागरिकों को सशक्त बनाना"}
            </h2>
            <p className="text-lg text-primary-foreground/80 mb-8">
              {language === "en"
                ? "Report issues, access schemes, and get AI assistance—all in one place."
                : "समस्याओं की रिपोर्ट करें, योजनाओं तक पहुंचें, और AI सहायता प्राप्त करें—सब एक जगह।"}
            </p>

            <div className="flex items-center gap-6">
              <div className="text-center">
                <p className="text-3xl font-bold">50K+</p>
                <p className="text-sm text-primary-foreground/70">{t("hero.issuesResolved")}</p>
              </div>
              <div className="w-px h-12 bg-primary-foreground/20" />
              <div className="text-center">
                <p className="text-3xl font-bold">2.5L+</p>
                <p className="text-sm text-primary-foreground/70">{t("hero.activeCitizens")}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Form */}
        <div className="flex-1 flex flex-col min-h-screen justify-between">
          {/* Top Bar */}
          <div className="flex items-center justify-between p-4 sm:p-6">
            <Link
              to={ROUTES.LANDING}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="text-sm">{language === "en" ? "Back to Home" : "होम पर वापस"}</span>
            </Link>
            <Button variant="ghost" size="sm" onClick={toggleLanguage} className="gap-2">
              <Globe className="w-4 h-4" />
              {language === "en" ? "हिंदी" : "English"}
            </Button>
          </div>

          {/* Form Container */}
          <div className="flex-1 flex items-center justify-center px-4 sm:px-8 py-8">
            <div className="w-full max-w-md">
              {/* Mobile Logo */}
              <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
                <div className="w-12 h-12 rounded-xl civic-gradient flex items-center justify-center shadow-md">
                  <span className="text-primary-foreground font-bold text-xl">स</span>
                </div>
                <div>
                  <h1 className="font-bold text-xl text-foreground">Samadhan</h1>
                  <p className="text-xs text-muted-foreground">समाधान</p>
                </div>
              </div>

              <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-foreground mb-2">
                  {isSignUp ? t("auth.createAccount") : t("auth.welcomeBack")}
                </h2>
                <p className="text-muted-foreground">
                  {isSignUp ? t("auth.joinCommunity") : t("auth.signInContinue")}
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {isSignUp && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="fullName">{t("auth.fullName")}</Label>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          id="fullName"
                          type="text"
                          placeholder={language === "en" ? "Enter your full name" : "अपना पूरा नाम दर्ज करें"}
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="pl-10"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="city">{language === "en" ? "City *" : "शहर *"}</Label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="city"
                            type="text"
                            placeholder={language === "en" ? "e.g. Bhopal" : "जैसे भोपाल"}
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            className="pl-10"
                            required
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="state">{language === "en" ? "State *" : "राज्य *"}</Label>
                        <div className="relative">
                          <Building className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            id="state"
                            type="text"
                            placeholder={language === "en" ? "e.g. Madhya Pradesh" : "जैसे मध्य प्रदेश"}
                            value={state}
                            onChange={(e) => setState(e.target.value)}
                            className="pl-10"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder={language === "en" ? "Enter your email" : "अपना ईमेल दर्ज करें"}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">{t("auth.password")}</Label>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder={language === "en" ? "Enter your password" : "अपना पासवर्ड दर्ज करें"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-10 pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {isSignUp && (
                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        placeholder={language === "en" ? "Confirm your password" : "अपना पासवर्ड पुष्टि करें"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10"
                        required
                      />
                    </div>
                  </div>
                )}

                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      {isSignUp ? t("auth.signingUp") : t("auth.signingIn")}
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4 mr-2" />
                      {isSignUp ? t("auth.signUp") : t("auth.signIn")}
                    </>
                  )}
                </Button>
              </form>

              <p className="text-center text-sm text-muted-foreground mt-6">
                {isSignUp ? t("auth.hasAccount") : t("auth.noAccount")}{" "}
                <Link
                  to={isSignUp ? ROUTES.SIGN_IN : ROUTES.SIGN_UP}
                  className="text-primary font-medium hover:underline"
                >
                  {isSignUp ? t("auth.signIn") : t("auth.signUp")}
                </Link>
              </p>
            </div>
          </div>

          {/* Bottom spacer padding to balance layout */}
          <div className="h-12" />
        </div>
      </div>

      {/* ── DEMO ACCESS CREDENTIALS CARD - SEEN AFTER SCROLL ── */}
      {!isLoading && (
        <div
          ref={demoCredentialsRef}
          className="w-full bg-[#f8fafc] dark:bg-muted/10 border-t border-border/60 p-6 text-center space-y-3 shadow-inner"
        >
          <div className="max-w-4xl mx-auto">
            <p className="text-xs font-bold text-muted-foreground tracking-wider uppercase mb-3">
              {language === "en" ? "DEMO ACCESS CREDENTIALS" : "डेमो लॉगिन क्रेडेंशियल्स"}
            </p>
            <div className="flex flex-wrap gap-2.5 justify-center">
              {DEMO_CREDENTIALS.map((demo) => (
                <button
                  key={demo.email}
                  type="button"
                  onClick={() => handleSelectDemo(demo)}
                  className="bg-card border border-border/80 hover:border-primary/50 rounded-lg px-3 py-1 text-xs font-mono font-medium hover:bg-muted text-foreground transition-all cursor-pointer shadow-sm hover:shadow"
                  title={`${demo.fullName} - ${demo.city}, ${demo.state}`}
                >
                  {demo.email}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground mt-2">
              {language === "en"
                ? "Click credentials to auto-fill details (Bhopal, Madhya Pradesh)"
                : "विवरण भरने के लिए क्रेडेंशियल्स पर क्लिक करें (भोपाल, मध्य प्रदेश)"}
            </p>
          </div>
        </div>
      )}

      {/* Floating Demo Credentials scroll-down button */}
      {!isLoading && (
        <Button
          onClick={handleScrollToDemo}
          className="fixed bottom-6 right-6 z-50 shadow-lg gap-2 bg-[#b45309] hover:bg-[#92400e] text-white rounded-full px-5 py-2.5 text-xs font-bold cursor-pointer border border-[#d97706]/20 transition-all hover:scale-105"
        >
          <Key className="w-3.5 h-3.5" />
          {language === "en" ? "Demo Credentials" : "डेमो क्रेडेंशियल्स"}
        </Button>
      )}
    </div>
  );
}
