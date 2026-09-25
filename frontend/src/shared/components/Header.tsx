import React, { useState, useEffect, forwardRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/shared/components/ui/button";
import { useLanguage } from "@/app/providers/LanguageProvider";
import { useAuth } from "@/features/auth";
import { ROUTES } from "@/shared/config/routes";
import { isFeatureEnabled, FeatureFlagName } from "@/shared/config/featureFlags";
import { adminService } from "@/features/admin/services/adminService";
import { UserRole } from "@/shared/types/domain/UserRole";
import { logger } from "@/shared/services/logger";
import {
  Menu,
  X,
  Globe,
  Bell,
  User,
  FileText,
  MapPin,
  Map,
  Shield,
  LogIn,
  LogOut,
  Loader2,
  Sparkles,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { notificationService, AppNotification } from "@/shared/services/notificationService";
import { CommunityHeroWidget } from "@/features/profile/components/CommunityHeroWidget";
import { NotificationBell } from "@/shared/components/NotificationBell";

interface NavItem {
  labelKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  flag?: FeatureFlagName;
}

const navItems: NavItem[] = [
  { labelKey: "nav.dashboard", href: ROUTES.DASHBOARD, icon: MapPin },
  { labelKey: "nav.report", href: ROUTES.REPORT_ISSUE, icon: FileText },
  { labelKey: "nav.map", href: ROUTES.CIVIC_MAP, icon: Map, flag: "CIVIC_MAP" },
];

interface LandingNavItem {
  labelKey: string;
  sectionId: string;
  labelEn: string;
  labelHi: string;
}

const landingNavItems: LandingNavItem[] = [
  { labelKey: "nav.solution", sectionId: "solution-section", labelEn: "Solution", labelHi: "समाधान" },
  {
    labelKey: "nav.howItWorks",
    sectionId: "how-it-works-section",
    labelEn: "How It Works",
    labelHi: "यह कैसे काम करता है",
  },
  {
    labelKey: "nav.forDepartments",
    sectionId: "departments-section",
    labelEn: "For Departments",
    labelHi: "विभागों के लिए",
  },
  {
    labelKey: "nav.citizenPortal",
    sectionId: "citizen-portal-section",
    labelEn: "Citizen Portal",
    labelHi: "नागरिक पोर्टल",
  },
];

export const Header = forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>((props, ref) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { language, setLanguage, t } = useLanguage();
  const { user, loading, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleScrollToSection = (sectionId: string) => {
    if (location.pathname !== ROUTES.HOME && location.pathname !== "/") {
      navigate("/", { state: { scrollToSection: sectionId } });
    } else {
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
    }
  };

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  useEffect(() => {
    const unsubscribe = notificationService.subscribe((list) => {
      setNotifications(list);
    });
    return () => unsubscribe();
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const toggleLanguage = () => {
    setLanguage(language === "en" ? "hi" : "en");
  };

  const isActive = (href: string) => location.pathname === href;

  const handleSignOut = async () => {
    await signOut();
  };

  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    if (user?.id) {
      adminService
        .getUserRole(user.id)
        .then((res) => {
          setIsAdmin(res.role === UserRole.DEPARTMENT_ADMIN || res.role === UserRole.SUPER_ADMIN);
        })
        .catch((err) => {
          logger.info("Failed to retrieve user role for header navigation:", err);
          setIsAdmin(false);
        });
    } else {
      setIsAdmin(false);
    }
  }, [user]);

  const visibleNavItems = user
    ? [
        ...navItems.filter((item) => !item.flag || isFeatureEnabled(item.flag)),
        ...(isAdmin ? [{ labelKey: "nav.queue", href: ROUTES.ADMIN, icon: Shield }] : []),
      ]
    : [];

  return (
    <header
      ref={ref}
      className="fixed top-0 left-0 right-0 z-[1050] bg-card/80 backdrop-blur-xl border-b border-border"
      {...props}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to={ROUTES.HOME} className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl civic-gradient flex items-center justify-center shadow-md">
              <span className="text-primary-foreground font-bold text-lg">स</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="font-bold text-lg text-foreground">Samadhan</h1>
              <p className="text-[10px] text-muted-foreground -mt-1">समाधान</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center gap-1">
            {/* Form Analyzer — always visible, no auth required */}
            <Link
              to={ROUTES.FORM_ANALYZER}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isActive(ROUTES.FORM_ANALYZER)
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Sparkles className="w-4 h-4 text-primary" />
              {language === "hi" ? "फॉर्म सहायक" : "Form Analyzer"}
            </Link>

            {user
              ? visibleNavItems.map((item) => (
                  <Link
                    key={item.labelKey}
                    to={item.href}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      isActive(item.href)
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    <item.icon className="w-4 h-4" />
                    {t(item.labelKey)}
                  </Link>
                ))
              : landingNavItems.map((item) => (
                  <button
                    key={item.labelKey}
                    onClick={() => handleScrollToSection(item.sectionId)}
                    className="px-4 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer bg-transparent border-0"
                  >
                    {language === "en" ? item.labelEn : item.labelHi}
                  </button>
                ))}
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            {/* Language Toggle */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleLanguage}
              className="hidden sm:flex items-center gap-2"
            >
              <Globe className="w-4 h-4" />
              <span className="text-xs font-medium">{language === "en" ? "English" : "हिंदी"}</span>
            </Button>

            {/* Notifications Dropdown — signed-out visitors only. Signed-in
                users get the backend-connected NotificationBell below;
                showing both here would render two separate, inconsistent
                bells. */}
            {!user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="iconSm" className="relative">
                    <Bell className="w-4 h-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-secondary text-secondary-foreground text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                        {unreadCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
                  <div className="px-3 py-2 font-semibold text-sm border-b border-border flex justify-between items-center">
                    <span>{language === "en" ? "Notifications" : "अधिसूचनाएं"}</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={() => notificationService.markAllAsRead()}
                        className="text-xs text-primary hover:underline font-normal"
                      >
                        {language === "en" ? "Mark all read" : "सभी पढ़े हुए मानें"}
                      </button>
                    )}
                  </div>
                  {notifications.length === 0 ? (
                    <div className="py-6 text-center text-xs text-muted-foreground">
                      {language === "en" ? "No new alerts" : "कोई नई सूचनाएं नहीं"}
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <DropdownMenuItem
                        key={n.id}
                        onClick={() => notificationService.markAsRead(n.id)}
                        className={`flex flex-col items-start p-3 gap-1 border-b border-border last:border-b-0 cursor-pointer ${
                          !n.read ? "bg-muted/40 font-medium" : ""
                        }`}
                      >
                        <div className="flex justify-between w-full text-xs">
                          <span
                            className={`font-bold ${
                              n.type === "error"
                                ? "text-destructive"
                                : n.type === "warning"
                                  ? "text-warning"
                                  : "text-primary"
                            }`}
                          >
                            {n.title}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(n.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground text-left leading-normal">{n.message}</p>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* User Menu or Sign In */}
            {loading ? (
              <Button variant="ghost" size="iconSm" disabled>
                <Loader2 className="w-4 h-4 animate-spin" />
              </Button>
            ) : user ? (
              <>
                <NotificationBell />
                {user.user_metadata?.role === "citizen" ? (
                  <CommunityHeroWidget />
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        className="flex gap-2 items-center rounded-full px-3 py-1.5 h-auto hover:bg-muted border border-border select-none bg-primary/5 transition-all duration-300"
                      >
                        <Shield className="w-4 h-4 text-primary" />
                        <span className="text-xs font-bold text-foreground">
                          {user.user_metadata?.role === "super_admin" ? "Super" : "Officer"}
                        </span>
                        <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center overflow-hidden">
                          <User className="w-3.5 h-3.5" />
                        </div>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="end"
                      className="w-80 p-5 rounded-2xl border border-border shadow-2xl bg-card animate-in fade-in slide-in-from-top-2 duration-200 text-left"
                    >
                      {/* Header */}
                      <div className="flex items-start gap-3.5 mb-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Shield className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-foreground truncate text-sm">
                            {user.user_metadata?.fullName || user.email?.split("@")[0] || "Officer"}
                          </h4>
                          <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mt-0.5">
                            {user.user_metadata?.role === "super_admin"
                              ? language === "en"
                                ? "Super Administrator"
                                : "मुख्य प्रशासक"
                              : language === "en"
                                ? "Department Admin"
                                : "विभाग अधिकारी"}
                          </p>
                        </div>
                      </div>

                      {/* Quick Stats Grid */}
                      <div className="grid grid-cols-2 gap-2.5 mb-4 text-xs">
                        <div className="bg-muted/30 p-2 rounded-xl border border-border/20">
                          <p className="text-muted-foreground text-[9px] uppercase font-bold tracking-wider">
                            {language === "en" ? "Jurisdiction" : "अधिकार क्षेत्र"}
                          </p>
                          <p className="text-sm font-bold text-foreground truncate">
                            {user.user_metadata?.city || "Bhopal"}
                          </p>
                        </div>
                        <div className="bg-muted/30 p-2 rounded-xl border border-border/20">
                          <p className="text-muted-foreground text-[9px] uppercase font-bold tracking-wider">
                            {language === "en" ? "Department" : "विभाग"}
                          </p>
                          <p className="text-sm font-bold text-foreground truncate">
                            {user.user_metadata?.role === "super_admin"
                              ? language === "en"
                                ? "All Board"
                                : "सभी बोर्ड"
                              : language === "en"
                                ? "Metro Transit"
                                : "मेट्रो ट्रांजिट"}
                          </p>
                        </div>
                      </div>

                      {/* SLA Progress Bar */}
                      <div className="space-y-1.5 mb-4">
                        <div className="flex items-center justify-between text-[10px] font-semibold">
                          <span className="text-muted-foreground">
                            {language === "en" ? "SLA Compliance" : "एसएलए अनुपालन"}
                          </span>
                          <span className="text-foreground font-bold text-emerald-500">94%</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: "94%" }}
                          />
                        </div>
                        <p className="text-[9px] text-muted-foreground text-right">
                          {language === "en"
                            ? "Target: 24h average resolution"
                            : "लक्ष्य: 24 घंटे औसत समाधान"}
                        </p>
                      </div>

                      {/* Contribution Breakdown */}
                      <div className="border-t border-border/40 py-3 flex items-center justify-between text-[10px] text-muted-foreground mb-4">
                        <div className="text-center">
                          <p className="font-bold text-foreground text-xs">12</p>
                          <p>{language === "en" ? "Assigned" : "सौंपा गया"}</p>
                        </div>
                        <div className="h-6 w-px bg-border/40" />
                        <div className="text-center">
                          <p className="font-bold text-foreground text-xs">94</p>
                          <p>{language === "en" ? "Resolved" : "हल"}</p>
                        </div>
                        <div className="h-6 w-px bg-border/40" />
                        <div className="text-center">
                          <p className="font-bold text-foreground text-xs">0</p>
                          <p>{language === "en" ? "Overdue" : "विलंबित"}</p>
                        </div>
                      </div>

                      {/* CTA Links */}
                      <div className="space-y-2">
                        <Link
                          to={ROUTES.ADMIN}
                          className="w-full inline-flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground text-xs font-bold rounded-xl hover:bg-primary/95 transition-all shadow-md"
                        >
                          {language === "en" ? "Go to Admin Queue →" : "प्रशासक कतार पर जाएं →"}
                        </Link>

                        <div className="flex gap-2 pt-1">
                          <Link
                            to={ROUTES.PROFILE}
                            className="flex-1 inline-flex items-center justify-center px-3 py-1.5 border border-border text-foreground hover:bg-muted text-[11px] font-medium rounded-lg transition-all"
                          >
                            <User className="w-3.5 h-3.5 mr-1.5" />
                            {language === "en" ? "My Profile" : "मेरी प्रोफ़ाइल"}
                          </Link>
                          <button
                            onClick={handleSignOut}
                            className="flex-1 inline-flex items-center justify-center px-3 py-1.5 border border-destructive/20 text-destructive hover:bg-destructive/5 text-[11px] font-medium rounded-lg transition-all"
                          >
                            <LogOut className="w-3.5 h-3.5 mr-1.5" />
                            {language === "en" ? "Sign Out" : "साइन आउट"}
                          </button>
                        </div>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </>
            ) : (
              <Link to={ROUTES.SIGN_IN}>
                <Button variant="outline" size="sm" className="hidden sm:flex gap-2">
                  <LogIn className="w-4 h-4" />
                  {t("nav.signin")}
                </Button>
              </Link>
            )}

            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="iconSm"
              className="lg:hidden"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <nav className="lg:hidden py-4 border-t border-border animate-slide-up">
            <div className="flex flex-col gap-1">
              {/* Form Analyzer — pinned at top, always visible */}
              <Link
                to={ROUTES.FORM_ANALYZER}
                className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  isActive(ROUTES.FORM_ANALYZER)
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                <Sparkles className="w-5 h-5 text-primary" />
                {language === "hi" ? "फॉर्म सहायक" : "Form Analyzer"}
              </Link>

              {user
                ? visibleNavItems.map((item) => (
                    <Link
                      key={item.labelKey}
                      to={item.href}
                      className={`flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                        isActive(item.href)
                          ? "text-primary bg-primary/10"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <item.icon className="w-5 h-5" />
                      {t(item.labelKey)}
                    </Link>
                  ))
                : landingNavItems.map((item) => (
                    <button
                      key={item.labelKey}
                      onClick={() => {
                        handleScrollToSection(item.sectionId);
                        setIsMenuOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors w-full text-left cursor-pointer bg-transparent border-0"
                    >
                      {language === "en" ? item.labelEn : item.labelHi}
                    </button>
                  ))}

              {/* Auth Links */}
              <div className="mt-2 pt-2 border-t border-border space-y-1">
                {user ? (
                  <>
                    <Link
                      to={ROUTES.PROFILE}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <User className="w-5 h-5" />
                      {language === "en" ? "My Profile" : "मेरी प्रोफ़ाइल"}
                    </Link>
                    <Link
                      to={`${ROUTES.PROFILE}?tab=issues`}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <FileText className="w-5 h-5" />
                      {language === "en" ? "My Issues" : "मेरी समस्याएं"}
                    </Link>
                    <Link
                      to={`${ROUTES.PROFILE}?tab=notifications`}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <Bell className="w-5 h-5" />
                      {language === "en" ? "Notifications" : "अधिसूचनाएं"}
                    </Link>
                    <button
                      onClick={() => {
                        handleSignOut();
                        setIsMenuOpen(false);
                      }}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-destructive hover:bg-muted rounded-lg transition-colors w-full"
                    >
                      <LogOut className="w-5 h-5" />
                      {language === "en" ? "Sign Out" : "साइन आउट"}
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to={ROUTES.SIGN_IN}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <LogIn className="w-5 h-5" />
                      {t("nav.signin")}
                    </Link>
                    <Link
                      to={ROUTES.SIGN_UP}
                      className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-primary bg-primary/10 rounded-lg"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <User className="w-5 h-5" />
                      {t("nav.signup")}
                    </Link>
                  </>
                )}
              </div>

              <div className="mt-2 pt-2 border-t border-border">
                <Button variant="ghost" onClick={toggleLanguage} className="w-full justify-start gap-3">
                  <Globe className="w-5 h-5" />
                  {language === "en" ? "English" : "हिंदी"}
                </Button>
              </div>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
});

Header.displayName = "Header";
