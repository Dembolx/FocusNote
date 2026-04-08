import { useEffect, useState, useRef, createContext, useContext, useCallback } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { Toaster, toast } from "sonner";
import { Check, Flame, X, Lock, ChevronDown, ChevronUp, Sparkles } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Configure axios defaults
axios.defaults.withCredentials = true;

// ============== AUTH CONTEXT ==============
const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    if (window.location.hash?.includes('session_id=')) {
      setLoading(false);
      return;
    }
    
    try {
      const response = await axios.get(`${API}/auth/me`);
      setUser(response.data);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`);
    } catch (e) {
      console.error("Logout error:", e);
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, loading, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

// ============== AUTH CALLBACK ==============
const AuthCallback = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processAuth = async () => {
      const hash = location.hash;
      const sessionIdMatch = hash.match(/session_id=([^&]+)/);
      
      if (!sessionIdMatch) {
        navigate("/", { replace: true });
        return;
      }

      const sessionId = sessionIdMatch[1];

      try {
        const response = await axios.post(`${API}/auth/session`, {
          session_id: sessionId
        });
        
        setUser(response.data);
        navigate("/dashboard", { replace: true, state: { user: response.data } });
      } catch (error) {
        console.error("Auth callback error:", error);
        toast.error("Authentication failed. Please try again.");
        navigate("/", { replace: true });
      }
    };

    processAuth();
  }, [location, navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[#7F77DD] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-[#64748B] font-medium">Signing you in...</p>
      </div>
    </div>
  );
};

// ============== PROTECTED ROUTE ==============
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="w-10 h-10 border-4 border-[#7F77DD] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />;
  }

  return children;
};

// ============== APP ROUTER ==============
const AppRouter = () => {
  const location = useLocation();

  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

// ============== LANDING PAGE ==============
const LandingPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate("/dashboard", { replace: true });
    }
  }, [user, navigate]);

  const handleLogin = () => {
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  const handleStartFree = () => {
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-white">
      {/* NAVBAR */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-[#F4F4F5]">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7F77DD] to-[#534AB7] flex items-center justify-center">
                <Check className="w-5 h-5 text-white" strokeWidth={3} />
              </div>
              <span className="font-bold text-xl text-[#1E1B4B]" style={{ fontFamily: 'Outfit, sans-serif' }}>FocusNote</span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={handleLogin}
                data-testid="login-btn-header"
                className="px-4 py-2 text-[#64748B] hover:text-[#1E1B4B] font-medium transition-colors"
              >
                Log in
              </button>
              <button
                onClick={handleStartFree}
                data-testid="start-free-nav"
                className="px-5 py-2.5 bg-[#7F77DD] hover:bg-[#534AB7] text-white font-medium rounded-xl transition-all duration-300 hover:-translate-y-0.5"
              >
                Start free →
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="px-6 pt-20 pb-24">
        <div className="max-w-4xl mx-auto text-center">
          <h1 
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1E1B4B] mb-6 leading-tight"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Your brain works differently.
            <br />
            <span className="text-[#7F77DD]">Your app should too.</span>
          </h1>
          <p className="text-xl text-[#64748B] mb-10 max-w-2xl mx-auto leading-relaxed">
            FocusNote turns your messy thoughts into 3 clear tasks. Nothing more.
          </p>

          <button
            onClick={handleStartFree}
            data-testid="hero-cta"
            className="px-8 py-4 bg-[#7F77DD] hover:bg-[#534AB7] text-white font-semibold text-lg rounded-2xl transition-all duration-300 hover:-translate-y-1 shadow-lg shadow-[#7F77DD]/25 mb-4"
          >
            Start free — no credit card needed →
          </button>
          
          <p className="text-sm text-[#94A3B8]">
            Join 500+ people with ADHD who finally feel organized
          </p>

          {/* Animated Demo */}
          <div className="mt-16 max-w-2xl mx-auto">
            <TypingDemo />
          </div>
        </div>
      </section>

      {/* PROBLEM SECTION */}
      <section className="px-6 py-24 bg-[#FAFAFA]">
        <div className="max-w-5xl mx-auto">
          <h2 
            className="text-3xl sm:text-4xl font-bold text-[#1E1B4B] text-center mb-16"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Sound familiar?
          </h2>

          <div className="grid md:grid-cols-3 gap-6">
            <ProblemCard text="Notion overwhelms me before I even start" />
            <ProblemCard text="My todo app makes me feel guilty for missing tasks" />
            <ProblemCard text="I write things down and still forget them" />
          </div>
        </div>
      </section>

      {/* SOLUTION SECTION */}
      <section className="px-6 py-24">
        <div className="max-w-5xl mx-auto">
          <h2 
            className="text-3xl sm:text-4xl font-bold text-[#1E1B4B] text-center mb-6"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            So we built something different
          </h2>
          <p className="text-lg text-[#64748B] text-center mb-16 max-w-2xl mx-auto">
            Just 3 tasks. That's it. Because done is better than perfect.
          </p>

          {/* Dashboard Mockup */}
          <DashboardMockup />
        </div>
      </section>

      {/* PRICING SECTION */}
      <section className="px-6 py-24 bg-[#FAFAFA]">
        <div className="max-w-4xl mx-auto">
          <h2 
            className="text-3xl sm:text-4xl font-bold text-[#1E1B4B] text-center mb-6"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Simple pricing
          </h2>
          <p className="text-lg text-[#64748B] text-center mb-12">
            Start free. Upgrade when you're ready.
          </p>

          {/* Pricing Cards */}
          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* Free Plan */}
            <div className="bg-white rounded-3xl p-8 border border-[#E5E7EB]">
              <h3 className="text-xl font-semibold text-[#1E1B4B] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Free
              </h3>
              <div className="mb-6">
                <span className="text-4xl font-bold text-[#1E1B4B]">$0</span>
                <span className="text-[#64748B]">/month</span>
              </div>
              <ul className="space-y-4 mb-8">
                <LandingPricingFeature text="Up to 10 tasks" />
                <LandingPricingFeature text="Brain dump (3 days)" />
                <LandingPricingFeature text="Basic AI parsing" />
              </ul>
              <button
                onClick={handleStartFree}
                className="w-full py-3 bg-[#F4F4F5] hover:bg-[#EBE9FE] text-[#1E1B4B] font-medium rounded-xl transition-colors"
              >
                Get started free
              </button>
            </div>

            {/* Pro Plan */}
            <div className="bg-white rounded-3xl p-8 border-2 border-[#534AB7] relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="px-4 py-1 bg-[#534AB7] text-white text-sm font-medium rounded-full">
                  Most popular
                </span>
              </div>
              <h3 className="text-xl font-semibold text-[#1E1B4B] mb-2 mt-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Pro
              </h3>
              <div className="mb-6">
                <span className="text-4xl font-bold text-[#1E1B4B]">$3</span>
                <span className="text-[#64748B]">/month</span>
              </div>
              <ul className="space-y-4 mb-8">
                <LandingPricingFeature text="Unlimited tasks" highlight />
                <LandingPricingFeature text="Focus Mode" highlight />
                <LandingPricingFeature text="Full brain dump history" highlight />
                <LandingPricingFeature text="Priority AI (faster)" highlight />
              </ul>
              <button
                onClick={handleStartFree}
                className="w-full py-3 bg-[#7F77DD] hover:bg-[#534AB7] text-white font-semibold rounded-xl transition-all duration-300 hover:-translate-y-0.5"
              >
                Start with Pro →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="px-6 py-12 border-t border-[#F4F4F5]">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7F77DD] to-[#534AB7] flex items-center justify-center">
                <Check className="w-4 h-4 text-white" strokeWidth={3} />
              </div>
              <span className="font-semibold text-[#1E1B4B]" style={{ fontFamily: 'Outfit, sans-serif' }}>FocusNote</span>
            </div>
            <div className="flex items-center gap-6 text-sm text-[#94A3B8]">
              <span>Made for ADHD brains</span>
              <span>·</span>
              <a href="#" className="hover:text-[#7F77DD] transition-colors">Privacy</a>
              <span>·</span>
              <a href="#" className="hover:text-[#7F77DD] transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

// ============== TYPING DEMO ANIMATION ==============
const TypingDemo = () => {
  const [phase, setPhase] = useState('typing'); // 'typing', 'processing', 'result'
  const [typedText, setTypedText] = useState('');
  const fullText = 'call dentist next tuesday';
  
  useEffect(() => {
    let timeout;
    
    if (phase === 'typing') {
      if (typedText.length < fullText.length) {
        timeout = setTimeout(() => {
          setTypedText(fullText.slice(0, typedText.length + 1));
        }, 80);
      } else {
        timeout = setTimeout(() => {
          setPhase('processing');
        }, 800);
      }
    } else if (phase === 'processing') {
      timeout = setTimeout(() => {
        setPhase('result');
      }, 1200);
    } else if (phase === 'result') {
      timeout = setTimeout(() => {
        setPhase('typing');
        setTypedText('');
      }, 4000);
    }
    
    return () => clearTimeout(timeout);
  }, [phase, typedText]);

  return (
    <div className="bg-[#FAFAFA] rounded-3xl p-8 border border-[#EBE9FE]">
      {/* Input Phase */}
      <div className={`transition-all duration-500 ${phase === 'result' ? 'opacity-0 h-0 overflow-hidden' : 'opacity-100'}`}>
        <div className="bg-white rounded-2xl p-4 border border-[#E5E7EB] mb-4">
          <div className="flex items-center gap-3">
            <Sparkles className="w-5 h-5 text-[#7F77DD]" />
            <span className="text-[#1E1B4B] text-lg">
              {typedText}
              <span className="animate-pulse text-[#7F77DD]">|</span>
            </span>
          </div>
        </div>
        
        {phase === 'processing' && (
          <div className="flex items-center justify-center gap-2 text-[#7F77DD]">
            <div className="w-2 h-2 bg-[#7F77DD] rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
            <div className="w-2 h-2 bg-[#7F77DD] rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
            <div className="w-2 h-2 bg-[#7F77DD] rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
          </div>
        )}
      </div>
      
      {/* Result Phase */}
      <div className={`transition-all duration-500 ${phase === 'result' ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden'}`}>
        <div className="bg-white rounded-2xl p-5 border border-[#EBE9FE] shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-xl bg-[#EBE9FE] flex items-center justify-center text-lg">
              🦷
            </div>
            <div className="flex-1">
              <p className="font-medium text-[#1E1B4B]">Call dentist</p>
              <p className="text-sm text-[#64748B]">Tuesday, Apr 15</p>
            </div>
            <div className="w-6 h-6 rounded-lg border-2 border-[#D1D5DB]"></div>
          </div>
        </div>
        <p className="text-center text-sm text-[#94A3B8] mt-4">
          ✨ Parsed automatically by AI
        </p>
      </div>
    </div>
  );
};

// ============== PROBLEM CARD ==============
const ProblemCard = ({ text }) => (
  <div className="bg-white rounded-2xl p-8 border border-[#E5E7EB] text-center">
    <div className="w-12 h-12 mx-auto mb-4 bg-[#FFF7ED] rounded-2xl flex items-center justify-center">
      <span className="text-2xl">😩</span>
    </div>
    <p className="text-[#1E1B4B] font-medium leading-relaxed">"{text}"</p>
  </div>
);

// ============== DASHBOARD MOCKUP ==============
const DashboardMockup = () => {
  const tasks = [
    { emoji: '🦷', title: 'Call dentist', time: 'Today, 3pm', priority: 'high' },
    { emoji: '📧', title: 'Reply to Sarah', time: 'Today', priority: 'medium' },
    { emoji: '🛒', title: 'Buy groceries', time: 'Tomorrow', priority: 'low' },
  ];

  return (
    <div className="bg-white rounded-3xl shadow-2xl shadow-[#7F77DD]/10 border border-[#EBE9FE] overflow-hidden max-w-lg mx-auto">
      {/* Mock Header */}
      <div className="px-6 py-4 border-b border-[#F4F4F5] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#7F77DD] to-[#534AB7]"></div>
          <span className="font-semibold text-sm text-[#1E1B4B]">FocusNote</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-[#FFF7ED] rounded-lg">
          <Flame className="w-3 h-3 text-[#F97316]" />
          <span className="text-xs font-medium text-[#1E1B4B]">5 days</span>
        </div>
      </div>
      
      {/* Mock Content */}
      <div className="p-6">
        <p className="text-sm text-[#64748B] mb-4">Today</p>
        <div className="space-y-3">
          {tasks.map((task, i) => (
            <div 
              key={i}
              className="flex items-center gap-3 p-3 bg-[#FAFAFA] rounded-xl"
              style={{ animationDelay: `${i * 100}ms` }}
            >
              <div className="w-5 h-5 rounded-md border-2 border-[#D1D5DB]"></div>
              <span className="text-lg">{task.emoji}</span>
              <div className="flex-1">
                <p className="text-sm font-medium text-[#1E1B4B]">{task.title}</p>
              </div>
              <span className="text-xs text-[#94A3B8]">{task.time}</span>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-[#94A3B8] mt-6">
          Just 3 tasks. Nothing more.
        </p>
      </div>
    </div>
  );
};

// ============== LANDING PRICING FEATURE ==============
const LandingPricingFeature = ({ text, highlight }) => (
  <li className="flex items-center gap-3">
    <Check className={`w-5 h-5 ${highlight ? 'text-[#7F77DD]' : 'text-[#10B981]'}`} strokeWidth={2.5} />
    <span className="text-[#1E1B4B]">{text}</span>
  </li>
);

const FeatureCard = ({ icon, title, description }) => (
  <div className="bg-white rounded-2xl p-8 shadow-soft">
    <div className="w-14 h-14 rounded-2xl bg-[#EBE9FE] flex items-center justify-center mb-5 mx-auto">
      {icon}
    </div>
    <h3 className="font-semibold text-lg text-[#1E1B4B] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h3>
    <p className="text-[#64748B]">{description}</p>
  </div>
);

// ============== DASHBOARD ==============
const Dashboard = () => {
  const { user, logout, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [dashboardData, setDashboardData] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showFocusMode, setShowFocusMode] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showAllTasks, setShowAllTasks] = useState(false);
  const [brainDumpExpanded, setBrainDumpExpanded] = useState(false);
  const [brainDumpContent, setBrainDumpContent] = useState("");
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [completingTaskId, setCompletingTaskId] = useState(null);
  
  const autoSaveTimer = useRef(null);

  // Check for Stripe payment success
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get('session_id');
    const paymentStatus = params.get('payment');
    
    if (paymentStatus === 'success' && sessionId) {
      pollPaymentStatus(sessionId);
      navigate('/dashboard', { replace: true });
    } else if (sessionId) {
      pollPaymentStatus(sessionId);
      navigate('/dashboard', { replace: true });
    }
  }, [location.search, navigate]);

  const pollPaymentStatus = async (sessionId, attempts = 0) => {
    if (attempts >= 5) {
      toast.info("Payment processing. Check your email for confirmation.");
      return;
    }

    try {
      const response = await axios.get(`${API}/subscriptions/status/${sessionId}`);
      
      if (response.data.payment_status === 'paid') {
        toast.success("Welcome to Pro! You're unstoppable. 🚀");
        fetchDashboard();
        return;
      } else if (response.data.status === 'expired') {
        toast.error("Payment session expired. Please try again.");
        return;
      }

      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), 2000);
    } catch (error) {
      console.error("Payment status error:", error);
    }
  };

  // Fetch dashboard data
  const fetchDashboard = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/dashboard`);
      setDashboardData(response.data);
      setUser(response.data.user);
      
      // Set initial brain dump content
      if (response.data.brain_dumps?.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        const todayDump = response.data.brain_dumps.find(d => d.created_at?.startsWith(today));
        if (todayDump) {
          setBrainDumpContent(todayDump.content);
        }
      }
    } catch (error) {
      console.error("Dashboard fetch error:", error);
    }
  }, [setUser]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  // Auto-save brain dump silently
  useEffect(() => {
    if (!brainDumpContent.trim()) return;
    
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current);
    }
    
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await axios.put(`${API}/brain-dumps/autosave`, { content: brainDumpContent });
        setLastSavedTime(new Date());
      } catch (error) {
        console.error("Auto-save error:", error);
      }
    }, 3000);
    
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [brainDumpContent]);

  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isProcessing) return;

    // Check free plan limit
    if (dashboardData?.is_at_limit) {
      toast.error("You've reached the free plan limit. Upgrade to add more tasks!");
      return;
    }

    setIsProcessing(true);
    try {
      await axios.post(`${API}/tasks/parse`, { raw_input: inputValue.trim() });
      setInputValue("");
      toast.success("Task captured!");
      fetchDashboard();
    } catch (error) {
      console.error("Task creation error:", error);
      toast.error("Failed to create task. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTaskComplete = async (taskId) => {
    setCompletingTaskId(taskId);
    
    // Delay for animation
    setTimeout(async () => {
      try {
        await axios.patch(`${API}/tasks/${taskId}`, { status: "done" });
        toast.success("Nice work! Task completed.");
        fetchDashboard();
      } catch (error) {
        console.error("Task update error:", error);
        toast.error("Failed to complete task");
      } finally {
        setCompletingTaskId(null);
      }
    }, 600);
  };

  const handleTaskSkip = async (taskId) => {
    try {
      await axios.patch(`${API}/tasks/${taskId}`, { status: "snoozed" });
      setShowFocusMode(false);
      fetchDashboard();
    } catch (error) {
      console.error("Task skip error:", error);
    }
  };

  const handleUpgrade = async () => {
    try {
      const response = await axios.post(`${API}/stripe/create-checkout-session`, {
        origin_url: window.location.origin
      });
      window.location.href = response.data.url;
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Failed to start checkout");
    }
  };

  if (!dashboardData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="w-10 h-10 border-4 border-[#7F77DD] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const isPro = dashboardData.user?.plan === "pro";
  
  // Only show streak warning if streak >= 1 AND no task completed today
  const showStreakWarning = (dashboardData.streak?.streak || 0) >= 1 && 
                            !dashboardData.streak?.completed_today;

  return (
    <div className="min-h-screen bg-white">
      {/* Focus Mode Overlay */}
      {showFocusMode && dashboardData.most_urgent_task && (
        <FocusModeOverlay
          task={dashboardData.most_urgent_task}
          onComplete={() => handleTaskComplete(dashboardData.most_urgent_task.task_id)}
          onSkip={() => handleTaskSkip(dashboardData.most_urgent_task.task_id)}
          onClose={() => setShowFocusMode(false)}
        />
      )}

      {/* Upgrade Modal for Focus Mode */}
      {showUpgradeModal && (
        <UpgradeModal 
          onClose={() => setShowUpgradeModal(false)}
          onUpgrade={handleUpgrade}
        />
      )}

      {/* Top Bar */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-[#F4F4F5]">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo + Streak */}
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7F77DD] to-[#534AB7] flex items-center justify-center">
                  <Check className="w-5 h-5 text-white" strokeWidth={3} />
                </div>
                <span className="font-bold text-lg text-[#1E1B4B]" style={{ fontFamily: 'Outfit, sans-serif' }}>FocusNote</span>
              </div>
              
              {/* Streak Counter - right next to logo */}
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#FFF7ED] rounded-lg" data-testid="streak-counter">
                <Flame className="w-4 h-4 text-[#F97316]" />
                <span className="font-semibold text-sm text-[#1E1B4B]">
                  {dashboardData.streak?.streak || 0} days
                </span>
              </div>
            </div>

            {/* User Avatar */}
            <div className="flex items-center gap-3">
              {!isPro && (
                <button
                  onClick={handleUpgrade}
                  data-testid="upgrade-btn"
                  className="text-sm font-medium text-[#7F77DD] hover:text-[#534AB7] transition-colors"
                >
                  Upgrade
                </button>
              )}
              <button
                onClick={() => navigate("/profile")}
                data-testid="profile-btn"
                className="relative"
              >
                {dashboardData.user?.avatar_url ? (
                  <img src={dashboardData.user.avatar_url} alt="" className="w-9 h-9 rounded-full border-2 border-[#EBE9FE]" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#7F77DD] flex items-center justify-center text-white font-medium text-sm">
                    {dashboardData.user?.name?.[0]?.toUpperCase() || "U"}
                  </div>
                )}
                {isPro && (
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-gradient-to-r from-[#7F77DD] to-[#534AB7] rounded-full flex items-center justify-center">
                    <Sparkles className="w-2.5 h-2.5 text-white" />
                  </div>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-10">
        {/* Streak Warning - only show if streak >= 1 AND no task completed today */}
        {showStreakWarning && (
          <div className="mb-8 p-4 bg-[#FFF7ED] rounded-2xl border border-[#FFEDD5]">
            <p className="text-[#9A3412] text-sm font-medium flex items-center gap-2">
              <Flame className="w-4 h-4" />
              Keep your streak alive! Complete a task today.
            </p>
          </div>
        )}

        {/* Free Plan Limit Banner */}
        {dashboardData.is_at_limit && (
          <div className="mb-8 p-5 bg-gradient-to-r from-[#EBE9FE] to-[#F4F4F5] rounded-2xl border border-[#7F77DD]/20">
            <p className="text-[#1E1B4B] font-medium mb-2">You're on a roll!</p>
            <p className="text-[#64748B] text-sm mb-3">You've reached 10 active tasks on the free plan.</p>
            <button
              onClick={handleUpgrade}
              className="text-[#7F77DD] font-medium text-sm hover:text-[#534AB7] transition-colors"
            >
              Upgrade to keep going →
            </button>
          </div>
        )}

        {/* Input Area */}
        <form onSubmit={handleTaskSubmit} className="mb-12">
          <div className={`bg-white rounded-3xl p-1 border-2 transition-all duration-300 ${
            inputValue ? 'border-[#7F77DD] shadow-lg shadow-[#7F77DD]/10' : 'border-[#F4F4F5]'
          }`}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="What's on your mind? Just write it..."
              disabled={isProcessing || dashboardData.is_at_limit}
              data-testid="ai-task-input"
              className="w-full px-6 py-5 text-lg bg-transparent outline-none placeholder:text-[#94A3B8] text-[#1E1B4B]"
              style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
            />
          </div>
          {isProcessing && (
            <p className="text-center text-[#7F77DD] text-sm mt-3 animate-pulse">
              Understanding your thought...
            </p>
          )}
        </form>

        {/* Today's Focus */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-[#1E1B4B]" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Today
            </h2>
            {/* Focus Mode Button */}
            {isPro ? (
              <button
                onClick={() => setShowFocusMode(true)}
                disabled={!dashboardData.most_urgent_task}
                data-testid="focus-mode-btn"
                className="px-4 py-2 bg-[#7F77DD] hover:bg-[#534AB7] text-white text-sm font-medium rounded-xl transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Focus Mode
              </button>
            ) : (
              <button
                onClick={() => setShowUpgradeModal(true)}
                data-testid="focus-mode-locked"
                className="px-4 py-2 bg-[#F4F4F5] text-[#94A3B8] text-sm font-medium rounded-xl flex items-center gap-2 hover:bg-[#EBE9FE] transition-colors"
              >
                <Lock className="w-4 h-4" />
                Focus Mode
              </button>
            )}
          </div>

          {dashboardData.today_tasks?.length === 0 ? (
            <EmptyState 
              title="All clear for today"
              description="Add a task above or enjoy the calm"
            />
          ) : (
            <div className="space-y-3" data-testid="today-tasks">
              {(showAllTasks ? dashboardData.all_today_tasks : dashboardData.today_tasks)?.map((task) => (
                <TaskCard
                  key={task.task_id}
                  task={task}
                  onComplete={handleTaskComplete}
                  isCompleting={completingTaskId === task.task_id}
                />
              ))}
              
              {!showAllTasks && dashboardData.today_overflow > 0 && (
                <button
                  onClick={() => setShowAllTasks(true)}
                  className="w-full py-3 text-[#7F77DD] font-medium text-sm hover:bg-[#EBE9FE] rounded-xl transition-colors"
                >
                  + {dashboardData.today_overflow} more tasks
                </button>
              )}
              
              {showAllTasks && dashboardData.today_overflow > 0 && (
                <button
                  onClick={() => setShowAllTasks(false)}
                  className="w-full py-3 text-[#64748B] font-medium text-sm hover:bg-[#F4F4F5] rounded-xl transition-colors"
                >
                  Show less
                </button>
              )}
            </div>
          )}
        </section>

        {/* Upcoming */}
        {dashboardData.upcoming_tasks?.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-semibold text-[#1E1B4B] mb-6" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Upcoming
            </h2>
            <div className="space-y-3" data-testid="upcoming-tasks">
              {dashboardData.upcoming_tasks.map((task) => (
                <TaskCard
                  key={task.task_id}
                  task={task}
                  onComplete={handleTaskComplete}
                  isCompleting={completingTaskId === task.task_id}
                  showDate
                />
              ))}
            </div>
          </section>
        )}

        {/* Brain Dump */}
        <section className="mb-12">
          <button
            onClick={() => setBrainDumpExpanded(!brainDumpExpanded)}
            className="w-full flex items-center justify-between py-4 text-left"
          >
            <h2 className="text-xl font-semibold text-[#1E1B4B]" style={{ fontFamily: 'Outfit, sans-serif' }}>
              Brain Dump
            </h2>
            {brainDumpExpanded ? (
              <ChevronUp className="w-5 h-5 text-[#64748B]" />
            ) : (
              <ChevronDown className="w-5 h-5 text-[#64748B]" />
            )}
          </button>
          
          {brainDumpExpanded && (
            <div className="animate-fade-in-up" data-testid="brain-dump-section">
              <div className="relative">
                <textarea
                  value={brainDumpContent}
                  onChange={(e) => setBrainDumpContent(e.target.value)}
                  placeholder="Let it all out... No pressure, no judgment. This saves automatically."
                  data-testid="brain-dump-input"
                  className="w-full h-48 p-6 bg-[#FAFAFA] rounded-2xl outline-none resize-none text-[#1E1B4B] placeholder:text-[#94A3B8] leading-relaxed border-2 border-transparent focus:border-[#EBE9FE] transition-colors"
                  style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
                />
                {lastSavedTime && (
                  <div className="absolute bottom-4 right-4 text-xs text-[#C4C4C4]">
                    saved {lastSavedTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                  </div>
                )}
              </div>
              
              {!isPro && dashboardData.brain_dumps?.length > 0 && (
                <p className="mt-4 text-sm text-[#64748B]">
                  Showing last 3 days.{" "}
                  <button onClick={handleUpgrade} className="text-[#7F77DD] font-medium">
                    Upgrade for full history
                  </button>
                </p>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

// ============== TASK CARD ==============
const TaskCard = ({ task, onComplete, isCompleting, showDate = false }) => {
  const formatTime = (dateStr) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    } catch {
      return null;
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    try {
      const date = new Date(dateStr);
      const today = new Date();
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      if (date.toDateString() === today.toDateString()) return "Today";
      if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
      
      return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    } catch {
      return null;
    }
  };

  return (
    <div 
      className={`group flex items-center gap-4 p-4 bg-white rounded-2xl border border-[#F4F4F5] hover:border-[#EBE9FE] transition-all duration-300 ${
        isCompleting ? 'animate-complete' : ''
      }`}
      data-testid={`task-card-${task.task_id}`}
      style={{
        animation: isCompleting ? 'taskComplete 0.6s ease-out forwards' : undefined
      }}
    >
      {/* Checkbox */}
      <button
        onClick={() => onComplete(task.task_id)}
        disabled={isCompleting}
        data-testid={`task-checkbox-${task.task_id}`}
        className={`relative w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-all duration-300 ${
          isCompleting 
            ? 'bg-[#A7F3D0] border-[#A7F3D0]' 
            : 'border-[#D1D5DB] hover:border-[#7F77DD] hover:bg-[#EBE9FE]'
        }`}
      >
        {isCompleting && (
          <Check className="w-4 h-4 text-[#065F46] animate-check" strokeWidth={3} />
        )}
      </button>

      {/* Task Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xl">{task.emoji}</span>
          <span className={`font-medium text-[#1E1B4B] ${isCompleting ? 'line-through text-[#94A3B8]' : ''}`}>
            {task.title}
          </span>
        </div>
      </div>

      {/* Time/Date */}
      {(task.due_date || showDate) && (
        <span className="text-sm text-[#64748B] whitespace-nowrap">
          {showDate ? formatDate(task.due_date) : formatTime(task.due_date)}
        </span>
      )}
    </div>
  );
};

// ============== FOCUS MODE OVERLAY ==============
const FocusModeOverlay = ({ task, onComplete, onSkip, onClose }) => {
  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-8">
      {/* Close Button */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 p-2 text-[#94A3B8] hover:text-[#1E1B4B] transition-colors"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Task */}
      <div className="text-center max-w-xl">
        <span className="text-6xl mb-8 block">{task.emoji}</span>
        <h1 
          className="text-3xl sm:text-4xl font-bold text-[#1E1B4B] mb-4"
          style={{ fontFamily: 'Outfit, sans-serif' }}
        >
          {task.title}
        </h1>
        {task.due_date && (
          <p className="text-lg text-[#64748B]">
            {new Date(task.due_date).toLocaleString("en-US", { 
              weekday: "long",
              hour: "numeric", 
              minute: "2-digit" 
            })}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4 mt-12">
        <button
          onClick={onSkip}
          data-testid="focus-skip-btn"
          className="px-8 py-4 text-[#64748B] font-medium rounded-2xl hover:bg-[#F4F4F5] transition-colors"
        >
          Skip for now
        </button>
        <button
          onClick={onComplete}
          data-testid="focus-done-btn"
          className="px-8 py-4 bg-[#7F77DD] hover:bg-[#534AB7] text-white font-semibold rounded-2xl transition-all duration-300 hover:-translate-y-0.5 shadow-lg shadow-[#7F77DD]/25"
        >
          Done!
        </button>
      </div>
    </div>
  );
};

// ============== EMPTY STATE ==============
const EmptyState = ({ title, description }) => (
  <div className="text-center py-12 px-6 bg-[#FAFAFA] rounded-2xl">
    <p className="font-medium text-[#1E1B4B] mb-1" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</p>
    <p className="text-[#64748B] text-sm">{description}</p>
  </div>
);

// ============== UPGRADE MODAL ==============
const UpgradeModal = ({ onClose, onUpgrade }) => {
  const navigate = useNavigate();
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl animate-fade-in-up">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-[#94A3B8] hover:text-[#1E1B4B] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-[#EBE9FE] rounded-2xl flex items-center justify-center">
            <Lock className="w-8 h-8 text-[#7F77DD]" />
          </div>
          
          <h3 
            className="text-xl font-bold text-[#1E1B4B] mb-2"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Focus Mode is a Pro feature
          </h3>
          
          <p className="text-[#64748B] mb-6">
            Upgrade for $3/month to unlock distraction-free focus and unlimited tasks.
          </p>
          
          <button
            onClick={() => { onClose(); navigate("/pricing"); }}
            data-testid="upgrade-modal-btn"
            className="w-full py-3 bg-[#7F77DD] hover:bg-[#534AB7] text-white font-semibold rounded-xl transition-all duration-300"
          >
            Upgrade for $3/month →
          </button>
          
          <button
            onClick={onClose}
            className="w-full py-3 mt-2 text-[#64748B] font-medium hover:text-[#1E1B4B] transition-colors"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
};

// ============== PROFILE PAGE ==============
const Profile = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      const response = await axios.get(`${API}/profile`);
      setProfile(response.data);
    } catch (error) {
      console.error("Profile fetch error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = async () => {
    navigate("/pricing");
  };

  const handleManageSubscription = async () => {
    try {
      const response = await axios.get(`${API}/stripe/portal`);
      window.location.href = response.data.url;
    } catch (error) {
      console.error("Portal error:", error);
      toast.error("Failed to open subscription portal");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="w-10 h-10 border-4 border-[#7F77DD] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div 
        className="h-40 bg-cover bg-center"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1773113513343-ddae50a4efdc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTF8MHwxfHNlYXJjaHwzfHxjYWxtaW5nJTIwbmF0dXJlJTIwbWluaW1hbGlzdHxlbnwwfHx8fDE3NzU2MzczNTh8MA&ixlib=rb-4.1.0&q=85')"
        }}
      />

      <main className="max-w-xl mx-auto px-6 -mt-12">
        <div className="bg-white rounded-3xl shadow-soft p-8 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-4">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="" className="w-16 h-16 rounded-2xl border-4 border-white shadow-lg" />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-[#7F77DD] flex items-center justify-center text-white text-xl font-bold border-4 border-white shadow-lg">
                  {profile?.name?.[0]?.toUpperCase() || "U"}
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold text-[#1E1B4B]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {profile?.name}
                </h1>
                <p className="text-[#64748B] text-sm">{profile?.email}</p>
                {profile?.plan === "pro" && (
                  <span className="inline-block mt-1 px-2 py-0.5 bg-gradient-to-r from-[#7F77DD] to-[#534AB7] text-white text-xs font-medium rounded-full">
                    Pro
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => navigate("/dashboard")} className="text-[#64748B] hover:text-[#1E1B4B]">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Streak */}
          <div className="bg-[#FFF7ED] rounded-2xl p-5 mb-6">
            <div className="flex items-center gap-3">
              <Flame className="w-8 h-8 text-[#F97316]" />
              <div>
                <p className="text-sm text-[#64748B]">Current Streak</p>
                <p className="text-2xl font-bold text-[#1E1B4B]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                  {profile?.streak_count || 0} days
                </p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-[#F4F4F5] rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-[#1E1B4B]">{profile?.total_tasks || 0}</p>
              <p className="text-sm text-[#64748B]">Total Tasks</p>
            </div>
            <div className="bg-[#F4F4F5] rounded-xl p-4 text-center">
              <p className="text-2xl font-bold text-[#1E1B4B]">{profile?.completed_tasks || 0}</p>
              <p className="text-sm text-[#64748B]">Completed</p>
            </div>
          </div>

          {/* Upgrade */}
          {profile?.plan === "free" ? (
            <div className="bg-gradient-to-r from-[#EBE9FE] to-[#F4F4F5] rounded-2xl p-5 border border-[#7F77DD]/20">
              <h3 className="font-semibold text-[#1E1B4B] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Upgrade to Pro
              </h3>
              <ul className="text-[#64748B] text-sm mb-4 space-y-1">
                <li>• Unlimited tasks</li>
                <li>• Focus Mode</li>
                <li>• Full brain dump history</li>
              </ul>
              <button
                onClick={() => navigate("/pricing")}
                data-testid="profile-upgrade-btn"
                className="w-full py-3 bg-[#7F77DD] hover:bg-[#534AB7] text-white font-medium rounded-xl transition-all duration-300"
              >
                View pricing →
              </button>
            </div>
          ) : (
            <div className="bg-[#F4F4F5] rounded-2xl p-5">
              <h3 className="font-semibold text-[#1E1B4B] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>
                Pro Subscription
              </h3>
              <p className="text-[#64748B] text-sm mb-4">
                Manage your billing and subscription settings.
              </p>
              <button
                onClick={handleManageSubscription}
                data-testid="manage-subscription-btn"
                className="w-full py-3 bg-white border border-[#E5E7EB] hover:border-[#7F77DD] text-[#1E1B4B] font-medium rounded-xl transition-all duration-300"
              >
                Manage subscription
              </button>
            </div>
          )}
        </div>

        <button
          onClick={logout}
          data-testid="profile-logout-btn"
          className="w-full py-4 text-[#64748B] hover:text-[#EF4444] font-medium transition-colors text-center"
        >
          Sign Out
        </button>
      </main>
    </div>
  );
};

// ============== PRICING PAGE ==============
const PricingPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async () => {
    if (!user) {
      // Redirect to login first
      const redirectUrl = window.location.origin + '/pricing';
      window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/stripe/create-checkout-session`, {
        origin_url: window.location.origin
      });
      window.location.href = response.data.url;
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Failed to start checkout. Please try again.");
      setLoading(false);
    }
  };

  const isPro = user?.plan === "pro";

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-[#F4F4F5]">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <button 
              onClick={() => navigate(user ? "/dashboard" : "/")}
              className="flex items-center gap-2"
            >
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#7F77DD] to-[#534AB7] flex items-center justify-center">
                <Check className="w-5 h-5 text-white" strokeWidth={3} />
              </div>
              <span className="font-bold text-lg text-[#1E1B4B]" style={{ fontFamily: 'Outfit, sans-serif' }}>FocusNote</span>
            </button>
            
            {user ? (
              <button
                onClick={() => navigate("/dashboard")}
                className="text-[#64748B] hover:text-[#1E1B4B] transition-colors"
              >
                Back to dashboard
              </button>
            ) : (
              <button
                onClick={() => {
                  const redirectUrl = window.location.origin + '/dashboard';
                  window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
                }}
                className="px-4 py-2 text-[#7F77DD] font-medium hover:text-[#534AB7] transition-colors"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Pricing Content */}
      <main className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 
            className="text-3xl sm:text-4xl font-bold text-[#1E1B4B] mb-4"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Simple, calm pricing
          </h1>
          <p className="text-[#64748B] text-lg">
            Choose the plan that works for you. No hidden fees.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {/* Free Plan */}
          <div className="bg-white rounded-3xl p-8 border border-[#E5E7EB]" data-testid="free-plan-card">
            <h3 
              className="text-xl font-semibold text-[#1E1B4B] mb-2"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Free
            </h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-[#1E1B4B]">$0</span>
              <span className="text-[#64748B]">/month</span>
            </div>
            
            <ul className="space-y-4 mb-8">
              <PricingFeature text="Up to 10 tasks" />
              <PricingFeature text="Brain dump (3 days)" />
              <PricingFeature text="Basic AI parsing" />
              <PricingFeature text="Streak tracking" disabled />
              <PricingFeature text="Focus Mode" disabled />
            </ul>

            {(!user || user?.plan === "free") && !isPro ? (
              <button
                disabled
                className="w-full py-3 bg-[#F4F4F5] text-[#94A3B8] font-medium rounded-xl cursor-not-allowed"
              >
                Current plan
              </button>
            ) : (
              <button
                disabled
                className="w-full py-3 bg-[#F4F4F5] text-[#94A3B8] font-medium rounded-xl cursor-not-allowed"
              >
                Downgrade
              </button>
            )}
          </div>

          {/* Pro Plan */}
          <div 
            className="bg-white rounded-3xl p-8 border-2 border-[#534AB7] relative"
            data-testid="pro-plan-card"
          >
            {/* Most Popular Badge */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
              <span className="px-4 py-1 bg-[#534AB7] text-white text-sm font-medium rounded-full">
                Most popular
              </span>
            </div>

            <h3 
              className="text-xl font-semibold text-[#1E1B4B] mb-2 mt-2"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              Pro
            </h3>
            <div className="mb-6">
              <span className="text-4xl font-bold text-[#1E1B4B]">$3</span>
              <span className="text-[#64748B]">/month</span>
            </div>
            
            <ul className="space-y-4 mb-8">
              <PricingFeature text="Unlimited tasks" highlight />
              <PricingFeature text="Focus Mode" highlight />
              <PricingFeature text="Full brain dump history" highlight />
              <PricingFeature text="Priority AI (faster)" highlight />
              <PricingFeature text="Gentle reminders" highlight />
            </ul>

            {isPro ? (
              <button
                onClick={() => navigate("/profile")}
                className="w-full py-3 bg-[#F4F4F5] text-[#1E1B4B] font-medium rounded-xl hover:bg-[#EBE9FE] transition-colors"
              >
                Manage subscription
              </button>
            ) : (
              <button
                onClick={handleUpgrade}
                disabled={loading}
                data-testid="upgrade-now-btn"
                className="w-full py-3 bg-[#7F77DD] hover:bg-[#534AB7] text-white font-semibold rounded-xl transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50"
              >
                {loading ? "Loading..." : "Upgrade now →"}
              </button>
            )}
          </div>
        </div>

        {/* FAQ or Trust */}
        <div className="text-center mt-12">
          <p className="text-[#94A3B8] text-sm">
            Cancel anytime. No questions asked.
          </p>
        </div>
      </main>
    </div>
  );
};

const PricingFeature = ({ text, disabled, highlight }) => (
  <li className="flex items-center gap-3">
    {disabled ? (
      <X className="w-5 h-5 text-[#D1D5DB]" />
    ) : (
      <Check className={`w-5 h-5 ${highlight ? 'text-[#7F77DD]' : 'text-[#10B981]'}`} strokeWidth={2.5} />
    )}
    <span className={disabled ? 'text-[#94A3B8]' : 'text-[#1E1B4B]'}>{text}</span>
  </li>
);

// ============== MAIN APP ==============
function App() {
  return (
    <div className="App">
      <Toaster 
        position="top-center"
        toastOptions={{
          style: {
            background: '#fff',
            color: '#1E1B4B',
            borderRadius: '16px',
            border: '1px solid #EBE9FE',
            boxShadow: '0 8px 30px rgb(0 0 0 / 0.04)'
          }
        }}
      />
      <BrowserRouter>
        <AuthProvider>
          <AppRouter />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

export default App;
