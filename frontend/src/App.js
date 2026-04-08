import { useEffect, useState, useRef, createContext, useContext, useCallback } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import { Toaster, toast } from "sonner";

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
    // CRITICAL: If returning from OAuth callback, skip the /me check.
    // AuthCallback will exchange the session_id and establish the session first.
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

  // Check URL fragment for session_id synchronously during render
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
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
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + '/dashboard';
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] relative overflow-hidden">
      {/* Background texture */}
      <div 
        className="absolute inset-0 opacity-10 pointer-events-none"
        style={{
          backgroundImage: "url('https://static.prod-images.emergentagent.com/jobs/83ac8970-8288-4a16-a96f-226e4aa4d5c2/images/df24f437da402e58e5db1103ba19b774810d17fa998d387adcdd4bd82225d90b.png')",
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      />

      {/* Header */}
      <header className="relative z-10 px-6 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7F77DD] to-[#534AB7] flex items-center justify-center">
              <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="font-bold text-xl text-[#1E1B4B]" style={{ fontFamily: 'Outfit, sans-serif' }}>FocusNote</span>
          </div>
          <button
            onClick={handleLogin}
            data-testid="login-btn-header"
            className="px-5 py-2.5 bg-[#7F77DD] hover:bg-[#534AB7] text-white font-medium rounded-xl transition-all duration-300 hover:-translate-y-0.5 shadow-soft"
          >
            Sign In
          </button>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 px-6 pt-16 pb-24">
        <div className="max-w-4xl mx-auto text-center">
          <h1 
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-[#1E1B4B] mb-6 leading-tight"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Task management that{" "}
            <span className="text-[#7F77DD]">gets you</span>
          </h1>
          <p className="text-lg text-[#64748B] mb-12 max-w-2xl mx-auto leading-relaxed">
            A calm, AI-powered task manager designed for minds that work differently. 
            Just type what you need to do — we'll organize the rest.
          </p>

          {/* Demo input */}
          <div className="max-w-2xl mx-auto mb-12">
            <div className="bg-white rounded-3xl shadow-soft p-2 border border-[#EBE9FE]">
              <div className="flex items-center gap-3 px-4 py-3">
                <span className="text-2xl">✨</span>
                <span className="text-[#94A3B8] text-lg">Try: "call dentist next Tuesday"</span>
              </div>
            </div>
          </div>

          <button
            onClick={handleLogin}
            data-testid="get-started-btn"
            className="px-8 py-4 bg-[#7F77DD] hover:bg-[#534AB7] text-white font-semibold text-lg rounded-2xl transition-all duration-300 hover:-translate-y-1 shadow-lg shadow-[#7F77DD]/25"
          >
            Get Started — It's Free
          </button>

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-8 mt-24">
            <div className="bg-white rounded-2xl p-8 shadow-soft">
              <div className="w-14 h-14 rounded-2xl bg-[#EBE9FE] flex items-center justify-center mb-5 mx-auto">
                <svg className="w-7 h-7 text-[#7F77DD]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="font-semibold text-lg text-[#1E1B4B] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>AI-Powered Input</h3>
              <p className="text-[#64748B]">Just type naturally. Our AI understands dates, priorities, and context automatically.</p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-soft">
              <div className="w-14 h-14 rounded-2xl bg-[#EBE9FE] flex items-center justify-center mb-5 mx-auto">
                <svg className="w-7 h-7 text-[#7F77DD]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-lg text-[#1E1B4B] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Brain Dump Safe Space</h3>
              <p className="text-[#64748B]">A judgment-free zone to unload your thoughts without any pressure to organize.</p>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-soft">
              <div className="w-14 h-14 rounded-2xl bg-[#EBE9FE] flex items-center justify-center mb-5 mx-auto">
                <svg className="w-7 h-7 text-[#7F77DD]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707" />
                </svg>
              </div>
              <h3 className="font-semibold text-lg text-[#1E1B4B] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>Calm by Design</h3>
              <p className="text-[#64748B]">No anxiety-inducing notifications, no overwhelming dashboards. Just peace.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-8 border-t border-[#EBE9FE]">
        <p className="text-center text-[#94A3B8] text-sm">
          Made with care for beautiful minds
        </p>
      </footer>
    </div>
  );
};

// ============== DASHBOARD ==============
const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [tasks, setTasks] = useState([]);
  const [brainDumps, setBrainDumps] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState("tasks");
  const [dumpContent, setDumpContent] = useState("");

  // Check for Stripe session_id on mount
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get('session_id');
    
    if (sessionId) {
      pollPaymentStatus(sessionId);
      // Clear URL params
      navigate('/dashboard', { replace: true });
    }
  }, [location.search, navigate]);

  const pollPaymentStatus = async (sessionId, attempts = 0) => {
    const maxAttempts = 5;
    
    if (attempts >= maxAttempts) {
      toast.info("Payment processing. Check your email for confirmation.");
      return;
    }

    try {
      const response = await axios.get(`${API}/subscriptions/status/${sessionId}`);
      
      if (response.data.payment_status === 'paid') {
        toast.success("Welcome to Pro! Your account has been upgraded.");
        // Refresh user data
        window.location.reload();
        return;
      } else if (response.data.status === 'expired') {
        toast.error("Payment session expired. Please try again.");
        return;
      }

      // Continue polling
      setTimeout(() => pollPaymentStatus(sessionId, attempts + 1), 2000);
    } catch (error) {
      console.error("Payment status error:", error);
    }
  };

  // Fetch tasks and brain dumps
  useEffect(() => {
    fetchTasks();
    fetchBrainDumps();
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await axios.get(`${API}/tasks`);
      setTasks(response.data);
    } catch (error) {
      console.error("Fetch tasks error:", error);
    }
  };

  const fetchBrainDumps = async () => {
    try {
      const response = await axios.get(`${API}/brain-dumps`);
      setBrainDumps(response.data);
    } catch (error) {
      console.error("Fetch brain dumps error:", error);
    }
  };

  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isProcessing) return;

    setIsProcessing(true);
    try {
      const response = await axios.post(`${API}/tasks/parse`, {
        raw_input: inputValue.trim()
      });
      setTasks(prev => [response.data, ...prev]);
      setInputValue("");
      toast.success("Task captured!");
    } catch (error) {
      console.error("Task creation error:", error);
      toast.error("Failed to create task. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTaskStatusUpdate = async (taskId, newStatus) => {
    try {
      await axios.patch(`${API}/tasks/${taskId}`, { status: newStatus });
      setTasks(prev => prev.map(t => 
        t.task_id === taskId ? { ...t, status: newStatus } : t
      ));
      if (newStatus === "done") {
        toast.success("Nice work!");
      }
    } catch (error) {
      console.error("Task update error:", error);
      toast.error("Failed to update task");
    }
  };

  const handleTaskDelete = async (taskId) => {
    try {
      await axios.delete(`${API}/tasks/${taskId}`);
      setTasks(prev => prev.filter(t => t.task_id !== taskId));
      toast.success("Task removed");
    } catch (error) {
      console.error("Task delete error:", error);
      toast.error("Failed to delete task");
    }
  };

  const handleBrainDumpSave = async () => {
    if (!dumpContent.trim()) return;

    try {
      const response = await axios.post(`${API}/brain-dumps`, {
        content: dumpContent.trim()
      });
      setBrainDumps(prev => [response.data, ...prev]);
      setDumpContent("");
      toast.success("Thought captured");
    } catch (error) {
      console.error("Brain dump error:", error);
      toast.error("Failed to save");
    }
  };

  const handleBrainDumpDelete = async (dumpId) => {
    try {
      await axios.delete(`${API}/brain-dumps/${dumpId}`);
      setBrainDumps(prev => prev.filter(d => d.dump_id !== dumpId));
    } catch (error) {
      console.error("Brain dump delete error:", error);
    }
  };

  const handleUpgrade = async () => {
    try {
      const response = await axios.post(`${API}/subscriptions/checkout`, {
        origin_url: window.location.origin
      });
      window.location.href = response.data.url;
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Failed to start checkout");
    }
  };

  const activeTasks = tasks.filter(t => t.status === "active");
  const completedTasks = tasks.filter(t => t.status === "done");

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Navigation */}
      <nav className="glass-nav sticky top-0 z-50 border-b border-[#EBE9FE]">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#7F77DD] to-[#534AB7] flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="font-bold text-lg text-[#1E1B4B]" style={{ fontFamily: 'Outfit, sans-serif' }}>FocusNote</span>
            </div>

            <div className="flex items-center gap-4">
              {user?.plan === "free" && (
                <button
                  onClick={handleUpgrade}
                  data-testid="upgrade-btn"
                  className="px-4 py-2 text-sm font-medium text-[#7F77DD] hover:bg-[#EBE9FE] rounded-xl transition-all duration-300"
                >
                  Upgrade to Pro
                </button>
              )}
              <button
                onClick={() => navigate("/profile")}
                data-testid="profile-btn"
                className="flex items-center gap-2 px-3 py-2 hover:bg-[#EBE9FE] rounded-xl transition-all duration-300"
              >
                {user?.avatar_url ? (
                  <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#7F77DD] flex items-center justify-center text-white font-medium text-sm">
                    {user?.name?.[0]?.toUpperCase() || "U"}
                  </div>
                )}
              </button>
              <button
                onClick={logout}
                data-testid="logout-btn"
                className="text-[#64748B] hover:text-[#1E1B4B] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* Greeting */}
        <div className="mb-10">
          <h1 
            className="text-2xl sm:text-3xl font-bold text-[#1E1B4B] mb-2"
            style={{ fontFamily: 'Outfit, sans-serif' }}
          >
            Hey, {user?.name?.split(" ")[0] || "there"} 👋
          </h1>
          <p className="text-[#64748B]">What's on your mind?</p>
        </div>

        {/* AI Input */}
        <form onSubmit={handleTaskSubmit} className="mb-12">
          <div className="bg-white rounded-3xl shadow-soft p-2 border border-[#EBE9FE] hover:border-[#7F77DD] transition-colors duration-300">
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="call dentist next Tuesday, finish report by Friday..."
                disabled={isProcessing}
                data-testid="ai-task-input"
                className="flex-1 px-6 py-5 text-lg bg-transparent outline-none placeholder:text-[#94A3B8] text-[#1E1B4B]"
              />
              {isProcessing ? (
                <div className="w-12 h-12 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-[#7F77DD] border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <button
                  type="submit"
                  data-testid="submit-task-btn"
                  className="w-12 h-12 flex items-center justify-center rounded-2xl bg-[#7F77DD] hover:bg-[#534AB7] text-white transition-all duration-300 hover:-translate-y-0.5 mr-1"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          <p className="text-center text-[#94A3B8] text-sm mt-3">
            Press Enter to capture your thought
          </p>
        </form>

        {/* Tabs */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => setActiveTab("tasks")}
            data-testid="tasks-tab"
            className={`px-5 py-2.5 rounded-xl font-medium transition-all duration-300 ${
              activeTab === "tasks"
                ? "bg-[#7F77DD] text-white"
                : "text-[#64748B] hover:bg-[#EBE9FE]"
            }`}
          >
            Tasks
          </button>
          <button
            onClick={() => setActiveTab("done")}
            data-testid="done-tab"
            className={`px-5 py-2.5 rounded-xl font-medium transition-all duration-300 ${
              activeTab === "done"
                ? "bg-[#7F77DD] text-white"
                : "text-[#64748B] hover:bg-[#EBE9FE]"
            }`}
          >
            Done
          </button>
          <button
            onClick={() => setActiveTab("dump")}
            data-testid="dump-tab"
            className={`px-5 py-2.5 rounded-xl font-medium transition-all duration-300 ${
              activeTab === "dump"
                ? "bg-[#7F77DD] text-white"
                : "text-[#64748B] hover:bg-[#EBE9FE]"
            }`}
          >
            Brain Dump
          </button>
        </div>

        {/* Tasks Tab */}
        {activeTab === "tasks" && (
          <div className="space-y-4" data-testid="tasks-list">
            {activeTasks.length === 0 ? (
              <EmptyState 
                title="No active tasks"
                description="Type something above to capture your first task"
              />
            ) : (
              activeTasks.map((task) => (
                <TaskCard
                  key={task.task_id}
                  task={task}
                  onStatusChange={handleTaskStatusUpdate}
                  onDelete={handleTaskDelete}
                />
              ))
            )}
          </div>
        )}

        {/* Done Tab */}
        {activeTab === "done" && (
          <div className="space-y-4" data-testid="done-list">
            {completedTasks.length === 0 ? (
              <EmptyState 
                title="Nothing completed yet"
                description="Complete some tasks and they'll appear here"
              />
            ) : (
              completedTasks.map((task) => (
                <TaskCard
                  key={task.task_id}
                  task={task}
                  onStatusChange={handleTaskStatusUpdate}
                  onDelete={handleTaskDelete}
                />
              ))
            )}
          </div>
        )}

        {/* Brain Dump Tab */}
        {activeTab === "dump" && (
          <div data-testid="brain-dump-section">
            <div className="bg-white rounded-3xl shadow-soft p-6 mb-8 border border-transparent hover:border-[#EBE9FE] transition-colors duration-300">
              <textarea
                value={dumpContent}
                onChange={(e) => setDumpContent(e.target.value)}
                placeholder="Let it all out... No pressure to organize anything here."
                data-testid="brain-dump-input"
                className="w-full h-40 bg-transparent outline-none resize-none text-[#1E1B4B] placeholder:text-[#94A3B8] leading-relaxed"
              />
              {dumpContent.trim() && (
                <div className="flex justify-end mt-4">
                  <button
                    onClick={handleBrainDumpSave}
                    data-testid="save-dump-btn"
                    className="px-5 py-2.5 bg-[#7F77DD] hover:bg-[#534AB7] text-white font-medium rounded-xl transition-all duration-300"
                  >
                    Save thought
                  </button>
                </div>
              )}
            </div>

            <div className="space-y-4">
              {brainDumps.length === 0 ? (
                <EmptyState 
                  title="Your safe space"
                  description="Dump your thoughts here — no judgment, no pressure"
                  image="https://static.prod-images.emergentagent.com/jobs/83ac8970-8288-4a16-a96f-226e4aa4d5c2/images/1b660733c874d176b4e6fc5084b8ebbffc824c6a24741fd0f451234c904cdca6.png"
                />
              ) : (
                brainDumps.map((dump) => (
                  <BrainDumpCard
                    key={dump.dump_id}
                    dump={dump}
                    onDelete={handleBrainDumpDelete}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// ============== TASK CARD ==============
const TaskCard = ({ task, onStatusChange, onDelete }) => {
  const formatDate = (dateStr) => {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const getPriorityClass = (priority) => {
    switch (priority) {
      case "high": return "bg-[#FDE68A] text-[#92400E]";
      case "medium": return "bg-[#EBE9FE] text-[#534AB7]";
      default: return "bg-[#F4F4F5] text-[#64748B]";
    }
  };

  const isDone = task.status === "done";

  return (
    <div 
      className={`task-card bg-white rounded-2xl p-5 shadow-soft border border-transparent hover:border-[#EBE9FE] transition-all duration-300 ${isDone ? "opacity-60" : ""}`}
      data-testid={`task-card-${task.task_id}`}
    >
      <div className="flex items-start gap-4">
        <button
          onClick={() => onStatusChange(task.task_id, isDone ? "active" : "done")}
          data-testid={`task-checkbox-${task.task_id}`}
          className={`mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all duration-300 ${
            isDone 
              ? "bg-[#7F77DD] border-[#7F77DD] text-white" 
              : "border-[#D1D5DB] hover:border-[#7F77DD]"
          }`}
        >
          {isDone && (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">{task.emoji}</span>
            <h3 className={`font-medium text-[#1E1B4B] ${isDone ? "line-through" : ""}`}>
              {task.title}
            </h3>
          </div>
          
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {task.due_date && (
              <span className="text-xs px-2 py-1 rounded-lg bg-[#F4F4F5] text-[#64748B]">
                {formatDate(task.due_date)}
              </span>
            )}
            <span className={`text-xs px-2 py-1 rounded-lg capitalize ${getPriorityClass(task.priority)}`}>
              {task.priority}
            </span>
            <span className="text-xs px-2 py-1 rounded-lg bg-[#F4F4F5] text-[#64748B] capitalize">
              {task.type}
            </span>
          </div>
        </div>

        <button
          onClick={() => onDelete(task.task_id)}
          data-testid={`task-delete-${task.task_id}`}
          className="text-[#94A3B8] hover:text-[#EF4444] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// ============== BRAIN DUMP CARD ==============
const BrainDumpCard = ({ dump, onDelete }) => {
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  };

  return (
    <div 
      className="bg-white rounded-2xl p-5 shadow-soft border border-transparent hover:border-[#EBE9FE] transition-all duration-300"
      data-testid={`dump-card-${dump.dump_id}`}
    >
      <p className="text-[#1E1B4B] whitespace-pre-wrap mb-3">{dump.content}</p>
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#94A3B8]">{formatDate(dump.created_at)}</span>
        <button
          onClick={() => onDelete(dump.dump_id)}
          data-testid={`dump-delete-${dump.dump_id}`}
          className="text-[#94A3B8] hover:text-[#EF4444] transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// ============== EMPTY STATE ==============
const EmptyState = ({ title, description, image }) => (
  <div className="text-center py-12">
    {image && (
      <img 
        src={image} 
        alt="" 
        className="w-32 h-32 mx-auto mb-6 opacity-50"
      />
    )}
    <h3 className="font-medium text-[#1E1B4B] mb-2" style={{ fontFamily: 'Outfit, sans-serif' }}>{title}</h3>
    <p className="text-[#64748B] text-sm">{description}</p>
  </div>
);

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
    try {
      const response = await axios.post(`${API}/subscriptions/checkout`, {
        origin_url: window.location.origin
      });
      window.location.href = response.data.url;
    } catch (error) {
      console.error("Checkout error:", error);
      toast.error("Failed to start checkout");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA]">
        <div className="w-10 h-10 border-4 border-[#7F77DD] border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Header image */}
      <div 
        className="h-48 bg-cover bg-center"
        style={{
          backgroundImage: "url('https://images.unsplash.com/photo-1773113513343-ddae50a4efdc?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2OTF8MHwxfHNlYXJjaHwzfHxjYWxtaW5nJTIwbmF0dXJlJTIwbWluaW1hbGlzdHxlbnwwfHx8fDE3NzU2MzczNTh8MA&ixlib=rb-4.1.0&q=85')"
        }}
      />

      <main className="max-w-2xl mx-auto px-6 -mt-16">
        {/* Profile card */}
        <div className="bg-white rounded-3xl shadow-soft p-8 mb-8">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-5">
              {profile?.avatar_url ? (
                <img 
                  src={profile.avatar_url} 
                  alt="" 
                  className="w-20 h-20 rounded-2xl border-4 border-white shadow-lg"
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-[#7F77DD] flex items-center justify-center text-white text-2xl font-bold border-4 border-white shadow-lg">
                  {profile?.name?.[0]?.toUpperCase() || "U"}
                </div>
              )}
              <div>
                <h1 
                  className="text-2xl font-bold text-[#1E1B4B]"
                  style={{ fontFamily: 'Outfit, sans-serif' }}
                >
                  {profile?.name}
                </h1>
                <p className="text-[#64748B]">{profile?.email}</p>
                {profile?.plan === "pro" && (
                  <span className="inline-block mt-2 px-3 py-1 bg-gradient-to-r from-[#7F77DD] to-[#534AB7] text-white text-xs font-medium rounded-full">
                    Pro Member
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => navigate("/dashboard")}
              className="text-[#64748B] hover:text-[#1E1B4B] transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Streak */}
          <div className="bg-[#F4F4F5] rounded-2xl p-6 mb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-[#64748B] mb-1">Current Streak</p>
                <div className="flex items-center gap-2">
                  <span className="text-3xl">🌱</span>
                  <span 
                    className="text-2xl font-bold text-[#1E1B4B]"
                    style={{ fontFamily: 'Outfit, sans-serif' }}
                  >
                    {profile?.streak_count || 0} days
                  </span>
                </div>
              </div>
              <div className="w-16 h-16 rounded-full bg-[#EBE9FE] flex items-center justify-center">
                <div 
                  className="w-12 h-12 rounded-full bg-[#7F77DD]"
                  style={{
                    background: `conic-gradient(#7F77DD ${Math.min((profile?.streak_count || 0) * 10, 100)}%, #EBE9FE 0%)`
                  }}
                />
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-[#F4F4F5] rounded-2xl p-5 text-center">
              <p className="text-sm text-[#64748B] mb-1">Total Tasks</p>
              <p className="text-2xl font-bold text-[#1E1B4B]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {profile?.total_tasks || 0}
              </p>
            </div>
            <div className="bg-[#F4F4F5] rounded-2xl p-5 text-center">
              <p className="text-sm text-[#64748B] mb-1">Completed</p>
              <p className="text-2xl font-bold text-[#1E1B4B]" style={{ fontFamily: 'Outfit, sans-serif' }}>
                {profile?.completed_tasks || 0}
              </p>
            </div>
          </div>

          {/* Upgrade CTA */}
          {profile?.plan === "free" && (
            <div className="bg-gradient-to-r from-[#EBE9FE] to-[#F4F4F5] rounded-2xl p-6 border border-[#7F77DD]/20">
              <h3 
                className="font-semibold text-[#1E1B4B] mb-2"
                style={{ fontFamily: 'Outfit, sans-serif' }}
              >
                Upgrade to Pro
              </h3>
              <p className="text-[#64748B] text-sm mb-4">
                Unlock unlimited tasks, advanced AI features, and more calming themes.
              </p>
              <button
                onClick={handleUpgrade}
                data-testid="profile-upgrade-btn"
                className="w-full py-3 bg-[#7F77DD] hover:bg-[#534AB7] text-white font-medium rounded-xl transition-all duration-300"
              >
                Upgrade for $9.99/month
              </button>
            </div>
          )}
        </div>

        {/* Logout */}
        <button
          onClick={logout}
          data-testid="profile-logout-btn"
          className="w-full py-4 text-[#64748B] hover:text-[#EF4444] font-medium transition-colors"
        >
          Sign Out
        </button>
      </main>
    </div>
  );
};

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
