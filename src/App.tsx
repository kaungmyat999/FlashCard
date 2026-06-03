import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  Search,
  Sparkles,
  BookOpen,
  Settings,
  Sun,
  Moon,
  RotateCw,
  Check,
  Trash2,
  AlertCircle,
  Calendar,
  GraduationCap,
  CheckCircle2,
  Key,
  HelpCircle,
  LogOut,
  ChevronLeft,
  Copy,
  Pencil,
  X,
  BarChart3,
  TrendingUp,
  Target,
  Flame,
  Upload,
} from 'lucide-react';
import type { Card, ReviewHistoryEntry } from './types';
import { calculateAnki, previewLabel, STARTING_EASE_FACTOR, type AnkiRating } from './utils/sm2';
import { generateExampleSentence, testGeminiApiKey } from './utils/gemini';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useAuth } from './hooks/useAuth';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import {
  fetchBlocks,
  createBlock,
  deleteBlock,
  fetchCards,
  insertCard,
  insertCards,
  updateCardScheduling,
  updateCardExample,
  updateCardContent,
  deleteCard as dbDeleteCard,
  insertReviewHistory,
  countReviewHistory,
  fetchReviewHistory,
  type DbBlock,
  type DbReviewHistory,
} from './utils/db';
import { computeStats, type StatsMetrics } from './utils/stats';
import { AuthScreen } from './components/AuthScreen';
import { ResetPasswordScreen } from './components/ResetPasswordScreen';
import './App.css';

function App() {
  const { user, loading: authLoading, signOut, isRecoveryMode } = useAuth();

  // Local-only preferences
  const [theme, setTheme] = useLocalStorage<'dark' | 'light'>('theme', 'dark');
  const [selectedModel, setSelectedModel] = useLocalStorage<string>('selected_model', 'gemini-3-flash-preview');

  // Gemini API key — persisted in Supabase user metadata so it syncs across
  // every device. We call getUser() (a live server fetch) rather than reading
  // user.user_metadata from the session JWT, because the JWT is minted at login
  // time and won't reflect a key saved on another device until the token rotates.
  const [apiKey, setApiKeyState] = useState('');
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!userId) {
      setApiKeyState('');
      return;
    }
    let cancelled = false;
    supabase?.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      const serverKey = (data.user?.user_metadata?.gemini_api_key as string) ?? '';
      // One-time migration: promote any legacy localStorage key to the server.
      const legacyKey = localStorage.getItem(`gemini_api_key:${userId}`) ?? '';
      if (!serverKey && legacyKey) {
        supabase?.auth.updateUser({ data: { gemini_api_key: legacyKey } });
        localStorage.removeItem(`gemini_api_key:${userId}`);
        setApiKeyState(legacyKey);
      } else {
        if (legacyKey) localStorage.removeItem(`gemini_api_key:${userId}`);
        setApiKeyState(serverKey);
      }
    });
    return () => { cancelled = true; };
  }, [userId]);

  const setApiKey = (next: string) => {
    setApiKeyState(next);
    if (!user) return;
    supabase?.auth.updateUser({ data: { gemini_api_key: next || null } });
  };

  // Server data
  const [blocks, setBlocks] = useState<DbBlock[]>([]);
  const [blocksLoading, setBlocksLoading] = useState(false);
  const [currentBlockId, setCurrentBlockId] = useState<string | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [reviewCount, setReviewCount] = useState(0);
  const [serverError, setServerError] = useState<string | null>(null);

  // UI state
  const [currentView, setCurrentView] = useState<'dashboard' | 'study' | 'add' | 'settings' | 'stats'>('dashboard');
  const [stats, setStats] = useState<StatsMetrics | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newBlockName, setNewBlockName] = useState('');
  const [newBlockDesc, setNewBlockDesc] = useState('');
  const [newWord, setNewWord] = useState('');
  const [newDefinition, setNewDefinition] = useState('');

  // Card row UI: edit + copy feedback
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editWord, setEditWord] = useState('');
  const [editDefinition, setEditDefinition] = useState('');
  const [copiedCardId, setCopiedCardId] = useState<string | null>(null);

  // Study session state
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionCardIds, setSessionCardIds] = useState<string[]>([]);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [showingBack, setShowingBack] = useState(false);
  const [isGeneratingExample, setIsGeneratingExample] = useState(false);
  const [generatorError, setGeneratorError] = useState<string | null>(null);
  const [completedSessionCards, setCompletedSessionCards] = useState(0);

  // Settings panel
  const [diagnosticStatus, setDiagnosticStatus] = useState<{ success: boolean; message: string; checked: boolean } | null>(null);
  const [isTestingKey, setIsTestingKey] = useState(false);
  const [isEditingKey, setIsEditingKey] = useState(false);
  const [keyJustSaved, setKeyJustSaved] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Load blocks + review count whenever the user changes.
  const refreshBlocks = useCallback(async () => {
    if (!user) return;
    setBlocksLoading(true);
    setServerError(null);
    try {
      const [bs, rc] = await Promise.all([fetchBlocks(), countReviewHistory(user.id)]);
      setBlocks(bs);
      setReviewCount(rc);
    } catch (err: any) {
      setServerError(err?.message ?? 'Failed to load blocks.');
    } finally {
      setBlocksLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user || currentView !== 'stats') return;
    let cancelled = false;
    setStatsLoading(true);
    fetchReviewHistory(user.id)
      .then((rows: DbReviewHistory[]) => {
        if (!cancelled) setStats(computeStats(rows));
      })
      .catch((err) => {
        if (!cancelled) setServerError(err?.message ?? 'Failed to load stats.');
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, currentView]);

  useEffect(() => {
    if (user) {
      refreshBlocks();
    } else {
      setBlocks([]);
      setCards([]);
      setCurrentBlockId(null);
      setReviewCount(0);
    }
  }, [user, refreshBlocks]);

  // Load cards when a block is opened.
  useEffect(() => {
    let cancelled = false;
    if (!currentBlockId) {
      setCards([]);
      return;
    }
    setCardsLoading(true);
    setServerError(null);
    fetchCards(currentBlockId)
      .then((data) => {
        if (!cancelled) setCards(data);
      })
      .catch((err) => {
        if (!cancelled) setServerError(err?.message ?? 'Failed to load cards.');
      })
      .finally(() => {
        if (!cancelled) setCardsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentBlockId]);

  // ── Derived ───────────────────────────────────────
  const now = new Date();
  const dueCards = cards.filter((card) => new Date(card.dueDate) <= now);
  const newCards = cards.filter((card) => card.repetitions === 0);
  const totalCardsCount = cards.length;
  const currentBlock = blocks.find((b) => b.id === currentBlockId) ?? null;

  // ── Handlers: blocks ──────────────────────────────
  const handleCreateBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newBlockName.trim()) return;
    try {
      const created = await createBlock(user.id, newBlockName.trim(), newBlockDesc.trim());
      setBlocks((prev) => [...prev, created]);
      setNewBlockName('');
      setNewBlockDesc('');
    } catch (err: any) {
      setServerError(err?.message ?? 'Failed to create block.');
    }
  };

  const handleDeleteBlock = async (blockId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this block and all its cards?')) return;
    try {
      await deleteBlock(blockId);
      setBlocks((prev) => prev.filter((b) => b.id !== blockId));
      if (currentBlockId === blockId) {
        setCurrentBlockId(null);
      }
    } catch (err: any) {
      setServerError(err?.message ?? 'Failed to delete block.');
    }
  };

  const openBlock = (blockId: string) => {
    setCurrentBlockId(blockId);
    setCurrentView('dashboard');
    setSessionActive(false);
    setSearchQuery('');
  };

  const closeBlock = () => {
    setCurrentBlockId(null);
    setSessionActive(false);
    setCurrentView('dashboard');
  };

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (err: any) {
      setServerError(err?.message ?? 'Sign-out failed.');
    }
  };

  // ── Handlers: study session ───────────────────────
  const startStudySession = () => {
    const due = cards.filter((card) => new Date(card.dueDate) <= now);
    if (due.length === 0) return;
    const shuffled = [...due].sort(() => Math.random() - 0.5);
    setSessionCardIds(shuffled.map((c) => c.id));
    setSessionIndex(0);
    setShowingBack(false);
    setCompletedSessionCards(0);
    setSessionActive(true);
    setCurrentView('study');
    setGeneratorError(null);
  };

  const handleScoreCard = async (rating: AnkiRating) => {
    const activeCardId = sessionCardIds[sessionIndex];
    const originalCard = cards.find((c) => c.id === activeCardId);
    if (!originalCard || !user) return;

    const next = calculateAnki(
      {
        state: originalCard.state,
        learningStep: originalCard.learningStep,
        interval: originalCard.interval,
        easeFactor: originalCard.easeFactor,
        repetitions: originalCard.repetitions,
      },
      rating
    );
    const updatedCard: Card = { ...originalCard, ...next };

    setCards((prev) => prev.map((c) => (c.id === activeCardId ? updatedCard : c)));
    setCompletedSessionCards((prev) => prev + 1);

    if (sessionIndex < sessionCardIds.length - 1) {
      setSessionIndex((prev) => prev + 1);
      setShowingBack(false);
      setGeneratorError(null);
    } else {
      setSessionActive(false);
    }

    const historyEntry: ReviewHistoryEntry = {
      cardId: originalCard.id,
      word: originalCard.word,
      timestamp: new Date().toISOString(),
      quality: rating,
      oldInterval: originalCard.interval,
      newInterval: updatedCard.interval,
      oldEaseFactor: originalCard.easeFactor,
      newEaseFactor: updatedCard.easeFactor,
    };

    try {
      await Promise.all([
        updateCardScheduling(originalCard.id, {
          interval: updatedCard.interval,
          easeFactor: updatedCard.easeFactor,
          repetitions: updatedCard.repetitions,
          dueDate: updatedCard.dueDate,
          state: updatedCard.state,
          learningStep: updatedCard.learningStep,
        }),
        insertReviewHistory({
          card_id: originalCard.id,
          user_id: user.id,
          word: historyEntry.word,
          quality: historyEntry.quality,
          old_interval: historyEntry.oldInterval,
          new_interval: historyEntry.newInterval,
          old_ease_factor: historyEntry.oldEaseFactor,
          new_ease_factor: historyEntry.newEaseFactor,
        }),
      ]);
      setReviewCount((prev) => prev + 1);
    } catch (err: any) {
      setServerError(err?.message ?? 'Failed to save review.');
    }
  };

  const handleTriggerExampleGeneration = async (cardId: string) => {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    setIsGeneratingExample(true);
    setGeneratorError(null);
    try {
      const sentence = await generateExampleSentence(card.word, card.definition, apiKey, selectedModel);
      setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, exampleSentence: sentence } : c)));
      await updateCardExample(cardId, sentence);
    } catch (err: any) {
      setGeneratorError(err?.message || 'Failed to generate example. Please check your network and API key.');
    } finally {
      setIsGeneratingExample(false);
    }
  };

  const handleTestApiKey = async () => {
    setIsTestingKey(true);
    setDiagnosticStatus(null);
    try {
      const result = await testGeminiApiKey(apiKey);
      setDiagnosticStatus({ success: result.success, message: result.message, checked: true });
    } catch (err: any) {
      setDiagnosticStatus({ success: false, message: err?.message || 'Verification request failed.', checked: true });
    } finally {
      setIsTestingKey(false);
    }
  };

  const handleAddNewCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !currentBlockId || !newWord.trim() || !newDefinition.trim()) return;
    try {
      const created = await insertCard(
        {
          word: newWord.trim(),
          definition: newDefinition.trim(),
          exampleSentence: null,
          interval: 0,
          easeFactor: STARTING_EASE_FACTOR,
          repetitions: 0,
          dueDate: new Date().toISOString(),
          state: 'new',
          learningStep: 0,
        },
        currentBlockId,
        user.id
      );
      setCards((prev) => [created, ...prev]);
      setNewWord('');
      setNewDefinition('');
      setCurrentView('dashboard');
    } catch (err: any) {
      setServerError(err?.message ?? 'Failed to add card.');
    }
  };

  const startEditingCard = (card: Card, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCardId(card.id);
    setEditWord(card.word);
    setEditDefinition(card.definition);
  };

  const cancelEditingCard = () => {
    setEditingCardId(null);
    setEditWord('');
    setEditDefinition('');
  };

  const saveEditedCard = async (cardId: string) => {
    const word = editWord.trim();
    const definition = editDefinition.trim();
    if (!word || !definition) return;
    setCards((prev) => prev.map((c) => (c.id === cardId ? { ...c, word, definition } : c)));
    cancelEditingCard();
    try {
      await updateCardContent(cardId, { word, definition });
    } catch (err: any) {
      setServerError(err?.message ?? 'Failed to save card.');
    }
  };

  const handleCopyWord = async (card: Card, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(card.word);
      setCopiedCardId(card.id);
      setTimeout(() => {
        setCopiedCardId((cur) => (cur === card.id ? null : cur));
      }, 1200);
    } catch (err: any) {
      setServerError(err?.message ?? 'Clipboard write failed.');
    }
  };

  const [copiedAll, setCopiedAll] = useState(false);

  // Text-file import
  const [importWords, setImportWords] = useState<string[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const handleCopyAllWords = async (words: string[]) => {
    if (words.length === 0) return;
    try {
      await navigator.clipboard.writeText(words.join('\n'));
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 1500);
    } catch (err: any) {
      setServerError(err?.message ?? 'Clipboard write failed.');
    }
  };

  const handleDeleteCard = async (cardId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this card?')) return;
    try {
      await dbDeleteCard(cardId);
      setCards((prev) => prev.filter((c) => c.id !== cardId));
    } catch (err: any) {
      setServerError(err?.message ?? 'Failed to delete card.');
    }
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string) ?? '';
      const seen = new Set<string>();
      const parsed: string[] = [];
      for (const raw of text.split(/\s+/)) {
        const w = raw.trim();
        if (!w) continue;
        const key = w.toLowerCase();
        if (!seen.has(key)) { seen.add(key); parsed.push(w); }
      }
      const existingLower = new Set(cards.map((c) => c.word.toLowerCase()));
      setImportWords(parsed.filter((w) => !existingLower.has(w.toLowerCase())));
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!importWords?.length || !user || !currentBlockId) return;
    setIsImporting(true);
    try {
      const created = await insertCards(
        importWords.map((word) => ({
          word,
          definition: '',
          exampleSentence: null,
          interval: 0,
          easeFactor: STARTING_EASE_FACTOR,
          repetitions: 0,
          dueDate: new Date().toISOString(),
          state: 'new' as const,
          learningStep: 0,
        })),
        currentBlockId,
        user.id
      );
      setCards((prev) => [...created, ...prev]);
      setImportWords(null);
    } catch (err: any) {
      setServerError(err?.message ?? 'Failed to import words.');
    } finally {
      setIsImporting(false);
    }
  };

  const filteredCards = cards.filter(
    (c) =>
      c.word.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.definition.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const renderExampleText = (sentence: string, targetWord: string) => {
    if (!sentence) return null;
    const escapedWord = targetWord.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`(${escapedWord}\\w*)`, 'gi');
    const parts = sentence.split(regex);
    return (
      <span className="example-text">
        &ldquo;
        {parts.map((part, i) => {
          if (part.toLowerCase().startsWith(targetWord.toLowerCase())) {
            return <strong key={i}>{part}</strong>;
          }
          return part;
        })}
        &rdquo;
      </span>
    );
  };

  const currentStudyingCard =
    sessionActive && sessionCardIds.length > 0
      ? cards.find((c) => c.id === sessionCardIds[sessionIndex])
      : null;

  // ── Render gates ──────────────────────────────────
  if (!isSupabaseConfigured) {
    return (
      <div className="app-container">
        <main className="main-content" style={{ maxWidth: 520, margin: '0 auto', paddingTop: '4rem' }}>
          <div className="glass-form-card">
            <h2 className="form-title">Supabase not configured</h2>
            <p className="form-desc">
              Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in <code>.env.local</code>,
              then restart <code>npm run dev</code>.
            </p>
          </div>
        </main>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="app-container">
        <main className="main-content" style={{ textAlign: 'center', paddingTop: '6rem', color: 'var(--text-secondary)' }}>
          Loading...
        </main>
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  if (isRecoveryMode) {
    return <ResetPasswordScreen />;
  }

  // ── Authenticated UI ─────────────────────────────
  return (
    <div className="app-container">
      <nav className="glass-nav">
        <div className="logo-container">
          {currentBlock ? (
            <button className="nav-btn" onClick={closeBlock} title="Back to blocks">
              <ChevronLeft size={18} />
              <span>Blocks</span>
            </button>
          ) : (
            <button
              type="button"
              className="logo-home"
              onClick={() => {
                setSessionActive(false);
                setCurrentBlockId(null);
                setCurrentView('dashboard');
              }}
              title="Home"
            >
              <GraduationCap className="logo-icon" size={28} />
              <span>FlashCard AI</span>
            </button>
          )}
        </div>
        <div className="nav-links">
          {currentBlock && (
            <>
              <button
                className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`}
                onClick={() => {
                  setSessionActive(false);
                  setCurrentView('dashboard');
                }}
              >
                <BookOpen size={18} />
                <span>Cards</span>
              </button>
              <button
                className={`nav-btn ${currentView === 'add' ? 'active' : ''}`}
                onClick={() => {
                  setSessionActive(false);
                  setCurrentView('add');
                }}
              >
                <Plus size={18} />
                <span>Add Card</span>
              </button>
            </>
          )}
          <button
            className={`nav-btn ${currentView === 'stats' ? 'active' : ''}`}
            onClick={() => {
              setSessionActive(false);
              setCurrentView('stats');
            }}
          >
            <BarChart3 size={18} />
            <span>Stats</span>
          </button>
          <button
            className={`nav-btn ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => {
              setSessionActive(false);
              setCurrentView('settings');
            }}
          >
            <Settings size={18} />
            <span>Settings</span>
          </button>
          <button className="nav-btn" onClick={handleSignOut} title={user.email ?? 'Sign out'}>
            <LogOut size={18} />
            <span>Sign out</span>
          </button>
          <button className="theme-toggle-btn" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </nav>

      <main className="main-content">
        {!apiKey && currentView !== 'settings' && (
          <div className="alert-banner animate-fade-in">
            <div className="alert-content">
              <AlertCircle className="alert-icon" size={20} />
              <span>
                Gemini API Key is not set. Example sentence generation will be unavailable until a key is added.
              </span>
            </div>
            <button className="alert-link-btn" onClick={() => setCurrentView('settings')}>
              Set Key
            </button>
          </div>
        )}

        {serverError && (
          <div className="alert-banner animate-fade-in">
            <div className="alert-content">
              <AlertCircle className="alert-icon" size={20} />
              <span>{serverError}</span>
            </div>
            <button className="alert-link-btn" onClick={() => setServerError(null)}>
              Dismiss
            </button>
          </div>
        )}

        {/* SETTINGS — accessible whether or not a block is open */}
        {currentView === 'settings' && (
          <SettingsPanel
            apiKey={apiKey}
            setApiKey={setApiKey}
            isEditingKey={isEditingKey}
            setIsEditingKey={setIsEditingKey}
            handleTestApiKey={handleTestApiKey}
            isTestingKey={isTestingKey}
            diagnosticStatus={diagnosticStatus}
            setDiagnosticStatus={setDiagnosticStatus}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            keyJustSaved={keyJustSaved}
            setKeyJustSaved={setKeyJustSaved}
            onDone={() => setCurrentView('dashboard')}
          />
        )}

        {/* STATS — global, not block-scoped */}
        {currentView === 'stats' && (
          <StatsPanel stats={stats} loading={statsLoading} />
        )}

        {/* BLOCKS LIST — when no block selected */}
        {currentView !== 'settings' && currentView !== 'stats' && !currentBlock && (
          <div className="animate-fade-in">
            <div className="study-now-card">
              <h2 className="study-title">Stack your memory, one block at a time.</h2>
              <p className="study-subtitle">
                A block is a focused playlist for your brain — group words by topic, language, or whatever you're chasing. Spaced repetition handles the timing; you just show up.
              </p>
            </div>

            <form onSubmit={handleCreateBlock} className="glass-form-card" style={{ marginBottom: '1.5rem' }}>
              <h3 className="section-title" style={{ marginTop: 0 }}>New block</h3>
              <div className="form-group">
                <label htmlFor="block-name" className="form-label">Name</label>
                <input
                  id="block-name"
                  className="form-input"
                  required
                  placeholder="e.g. GRE Verbs"
                  value={newBlockName}
                  onChange={(e) => setNewBlockName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="block-desc" className="form-label">Description (optional)</label>
                <input
                  id="block-desc"
                  className="form-input"
                  placeholder="What's this block for?"
                  value={newBlockDesc}
                  onChange={(e) => setNewBlockDesc(e.target.value)}
                />
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary btn-submit">
                  <Plus size={16} />
                  Create block
                </button>
              </div>
            </form>

            <h3 className="section-title">All blocks ({blocks.length})</h3>
            {blocksLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-secondary)' }}>Loading blocks...</div>
            ) : blocks.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                <HelpCircle size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <p>No blocks yet. Create your first one above.</p>
              </div>
            ) : (
              <div className="cards-list">
                {blocks.map((block) => (
                  <div
                    key={block.id}
                    className="word-item"
                    style={{ cursor: 'pointer' }}
                    onClick={() => openBlock(block.id)}
                  >
                    <div>
                      <div className="word-header">
                        <h4 className="word-title">{block.name}</h4>
                      </div>
                      {block.description && <p className="word-definition">{block.description}</p>}
                    </div>
                    <div className="word-footer">
                      <span>Created {new Date(block.created_at).toLocaleDateString()}</span>
                      <button
                        className="btn-icon"
                        onClick={(e) => handleDeleteBlock(block.id, e)}
                        title="Delete block"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* BLOCK DETAIL — dashboard for one block */}
        {currentView === 'dashboard' && currentBlock && (
          <div className="animate-fade-in">
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-icon-wrapper due">
                  <Calendar size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">{dueCards.length}</span>
                  <span className="stat-label">Due Today</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon-wrapper new">
                  <Sparkles size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">{newCards.length}</span>
                  <span className="stat-label">New Words</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon-wrapper total">
                  <BookOpen size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">{totalCardsCount}</span>
                  <span className="stat-label">Total in Block</span>
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-icon-wrapper due" style={{ background: 'var(--success-glow)', color: 'var(--success)' }}>
                  <Check size={24} />
                </div>
                <div className="stat-info">
                  <span className="stat-value">{reviewCount}</span>
                  <span className="stat-label">Reviews Done</span>
                </div>
              </div>
            </div>

            <div className="study-now-card">
              <h2 className="study-title">{currentBlock.name}</h2>
              <p className="study-subtitle">
                {cardsLoading
                  ? 'Loading cards…'
                  : dueCards.length > 0
                  ? `You have ${dueCards.length} vocabulary words ready for review using the Spaced Repetition SM-2 scheduling.`
                  : 'All caught up for this block. Add more words to grow it.'}
              </p>
              <button className="btn-primary" onClick={startStudySession} disabled={dueCards.length === 0}>
                <GraduationCap size={20} />
                <span>Start Session ({dueCards.length} due)</span>
              </button>
            </div>

            <input
              ref={importFileInputRef}
              type="file"
              accept=".txt,text/plain"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />

            <div className="search-section">
              <h3 className="section-title">Cards in this block</h3>
              <div className="table-toolbar">
                <div className="search-input-wrapper" style={{ flex: 1 }}>
                  <Search className="search-icon" size={18} />
                  <input
                    type="text"
                    placeholder="Search word or definition..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="search-input"
                  />
                </div>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => importFileInputRef.current?.click()}
                  title="Import words from a .txt file (one word per whitespace/newline)"
                  style={{
                    flex: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.5rem 0.9rem',
                    fontSize: '0.85rem',
                    borderRadius: '8px',
                    whiteSpace: 'nowrap',
                    width: 'auto',
                  }}
                >
                  <Upload size={16} />
                  <span>Import .txt</span>
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => handleCopyAllWords(filteredCards.map((c) => c.word))}
                  disabled={filteredCards.length === 0}
                  title="Copy all listed words to clipboard (one per line)"
                  style={{
                    flex: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.5rem 0.9rem',
                    fontSize: '0.85rem',
                    borderRadius: '8px',
                    whiteSpace: 'nowrap',
                    width: 'auto',
                  }}
                >
                  {copiedAll ? <Check size={16} /> : <Copy size={16} />}
                  <span>
                    {copiedAll ? 'Copied' : `Copy all (${filteredCards.length})`}
                  </span>
                </button>
              </div>
            </div>

            {importWords !== null && (
              <div className="glass-form-card" style={{ maxWidth: '100%', marginBottom: '1.5rem' }}>
                <h3 className="section-title" style={{ marginTop: 0 }}>
                  Import preview — {importWords.length} new word{importWords.length !== 1 ? 's' : ''} found
                </h3>
                {importWords.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    No new words to import — all words from this file already exist in the block.
                  </p>
                ) : (
                  <div style={{
                    maxHeight: '150px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.4rem',
                    padding: '0.75rem',
                    background: 'rgba(0,0,0,0.1)',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                  }}>
                    {importWords.map((w, i) => (
                      <span key={i} className="tag-badge" style={{ background: 'var(--primary-glow)', color: 'var(--primary)' }}>
                        {w}
                      </span>
                    ))}
                  </div>
                )}
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                  Cards will be created with empty definitions — edit each card after import to fill them in.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setImportWords(null)}
                    disabled={isImporting}
                    style={{ flex: 'none', padding: '0.5rem 1.25rem', fontSize: '0.9rem' }}
                  >
                    Cancel
                  </button>
                  {importWords.length > 0 && (
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleConfirmImport}
                      disabled={isImporting}
                    >
                      <Upload size={16} />
                      <span>{isImporting ? 'Importing…' : `Import ${importWords.length} word${importWords.length !== 1 ? 's' : ''}`}</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {filteredCards.length > 0 ? (
              <div className="cards-table-wrapper">
                <table className="cards-table">
                  <thead>
                    <tr>
                      <th style={{ width: '18%' }}>Word</th>
                      <th>Definition</th>
                      <th style={{ width: '8%' }}>State</th>
                      <th style={{ width: '10%' }}>Due</th>
                      <th style={{ width: '12%' }}>EF / Reps</th>
                      <th style={{ width: '12%', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCards.map((card) => {
                      const isCardDue = new Date(card.dueDate) <= now;
                      const isEditing = editingCardId === card.id;
                      const wasCopied = copiedCardId === card.id;
                      if (isEditing) {
                        return (
                          <tr key={card.id} className="cards-row editing">
                            <td>
                              <input
                                className="form-input"
                                value={editWord}
                                onChange={(e) => setEditWord(e.target.value)}
                                placeholder="Word"
                                autoFocus
                              />
                            </td>
                            <td colSpan={4}>
                              <textarea
                                className="form-input form-textarea"
                                value={editDefinition}
                                onChange={(e) => setEditDefinition(e.target.value)}
                                placeholder="Definition"
                              />
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <div className="row-actions">
                                <button
                                  className="btn-icon"
                                  onClick={() => saveEditedCard(card.id)}
                                  title="Save"
                                  disabled={!editWord.trim() || !editDefinition.trim()}
                                >
                                  <Check size={16} />
                                </button>
                                <button
                                  className="btn-icon"
                                  onClick={cancelEditingCard}
                                  title="Cancel"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }
                      return (
                        <tr key={card.id} className="cards-row">
                          <td className="cell-word">{card.word}</td>
                          <td className="cell-definition">{card.definition}</td>
                          <td>
                            <span
                              className="tag-badge"
                              style={{
                                background: 'rgba(255,255,255,0.04)',
                                color: 'var(--text-secondary)',
                                textTransform: 'capitalize',
                              }}
                            >
                              {card.state}
                            </span>
                          </td>
                          <td>
                            <span className={`tag-badge ${isCardDue ? 'due-tag' : 'future-tag'}`}>
                              {isCardDue ? 'Due' : new Date(card.dueDate).toLocaleDateString()}
                            </span>
                          </td>
                          <td className="cell-meta">
                            {card.easeFactor.toFixed(2)} / {card.repetitions}
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <div className="row-actions">
                              <button
                                className="btn-icon"
                                onClick={(e) => handleCopyWord(card, e)}
                                title="Copy word"
                              >
                                {wasCopied ? <Check size={16} /> : <Copy size={16} />}
                              </button>
                              <button
                                className="btn-icon"
                                onClick={(e) => startEditingCard(card, e)}
                                title="Edit card"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                className="btn-icon"
                                onClick={(e) => handleDeleteCard(card.id, e)}
                                title="Delete card"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
                <HelpCircle size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                <p>
                  {cardsLoading
                    ? 'Loading…'
                    : searchQuery
                    ? 'No matching words found.'
                    : "No cards in this block yet. Click 'Add Card' above to get started!"}
                </p>
              </div>
            )}
          </div>
        )}

        {currentView === 'study' && currentBlock && (
          <div className="animate-fade-in study-container">
            {sessionActive && currentStudyingCard ? (
              <>
                <div className="study-progress-bar">
                  <div
                    className="study-progress-fill"
                    style={{ width: `${(completedSessionCards / sessionCardIds.length) * 100}%` }}
                  ></div>
                </div>
                <div className="study-progress-text">
                  Card {sessionIndex + 1} of {sessionCardIds.length}
                </div>

                <div className="flashcard-wrapper" onClick={() => setShowingBack(!showingBack)}>
                  <div className={`flashcard ${showingBack ? 'flipped' : ''}`}>
                    <div className="card-face card-front">
                      <div className="card-content-wrapper">
                        <h2 className="flashcard-word">{currentStudyingCard.word}</h2>
                        <div className="flashcard-hint">
                          <RotateCw size={14} />
                          <span>Click to reveal definition</span>
                        </div>
                      </div>
                    </div>

                    <div className="card-face card-back" onClick={(e) => e.stopPropagation()}>
                      <div className="card-content-wrapper" style={{ width: '100%' }}>
                        <div className="flashcard-hint" style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                          <span>Word meaning</span>
                        </div>
                        <h3 className="flashcard-definition">{currentStudyingCard.definition}</h3>
                      </div>

                      <div className="example-section">
                        {currentStudyingCard.exampleSentence ? (
                          <>
                            {renderExampleText(currentStudyingCard.exampleSentence, currentStudyingCard.word)}
                            <button
                              className="btn-ai"
                              style={{ marginTop: '0.5rem' }}
                              onClick={() => handleTriggerExampleGeneration(currentStudyingCard.id)}
                              disabled={isGeneratingExample}
                            >
                              <Sparkles size={14} />
                              <span>Regenerate Example</span>
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="btn-ai"
                              onClick={() => handleTriggerExampleGeneration(currentStudyingCard.id)}
                              disabled={isGeneratingExample}
                            >
                              <Sparkles size={14} />
                              {isGeneratingExample ? 'Generating sentence...' : 'Get Example Sentence'}
                            </button>
                            {isGeneratingExample && (
                              <div
                                className={`shimmer-loading${theme === 'light' ? '-light' : ''}`}
                                style={{ width: '80%', height: '1.25rem', borderRadius: '4px', marginTop: '0.5rem' }}
                              ></div>
                            )}
                          </>
                        )}
                        {generatorError && <span className="sentence-error">{generatorError}</span>}
                      </div>

                      <div className="flashcard-hint" style={{ marginTop: '1rem', cursor: 'pointer' }} onClick={() => setShowingBack(false)}>
                        <RotateCw size={14} />
                        <span>Flip back</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="study-controls">
                  {showingBack ? (
                    <div className="rating-grid">
                      <button className="btn-rate again" onClick={() => handleScoreCard(1)}>
                        <span className="rate-label">Again</span>
                        <span className="rate-desc">{previewLabel(currentStudyingCard, 1)}</span>
                      </button>
                      <button className="btn-rate hard" onClick={() => handleScoreCard(2)}>
                        <span className="rate-label">Hard</span>
                        <span className="rate-desc">{previewLabel(currentStudyingCard, 2)}</span>
                      </button>
                      <button className="btn-rate good" onClick={() => handleScoreCard(3)}>
                        <span className="rate-label">Good</span>
                        <span className="rate-desc">{previewLabel(currentStudyingCard, 3)}</span>
                      </button>
                      <button className="btn-rate easy" onClick={() => handleScoreCard(4)}>
                        <span className="rate-label">Easy</span>
                        <span className="rate-desc">{previewLabel(currentStudyingCard, 4)}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="action-instruction">
                      Tap the card to reveal the definition and record your recall quality.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="session-summary">
                <div className="summary-circle">
                  <CheckCircle2 size={40} />
                </div>
                <h2 className="summary-title">Session Complete!</h2>
                <p className="summary-text">
                  Amazing work! You've reviewed all outstanding flashcards in this block using the spaced repetition system.
                </p>
                <button className="btn-primary" onClick={() => setCurrentView('dashboard')}>
                  Back to block
                </button>
              </div>
            )}
          </div>
        )}

        {currentView === 'add' && currentBlock && (
          <div className="animate-fade-in">
            <form onSubmit={handleAddNewCard} className="glass-form-card">
              <h2 className="form-title">Add Vocabulary</h2>
              <p className="form-desc">
                Add a new word to <strong>{currentBlock.name}</strong>. Spaced repetition coordinates reviews automatically.
              </p>

              <div className="form-group">
                <label htmlFor="word-input" className="form-label">Vocabulary Word</label>
                <input
                  id="word-input"
                  type="text"
                  required
                  placeholder="e.g. Ephemeral"
                  value={newWord}
                  onChange={(e) => setNewWord(e.target.value)}
                  className="form-input"
                />
              </div>

              <div className="form-group">
                <label htmlFor="definition-input" className="form-label">Definition / Meaning</label>
                <textarea
                  id="definition-input"
                  required
                  placeholder="e.g. Lasting for a very short time; transient."
                  value={newDefinition}
                  onChange={(e) => setNewDefinition(e.target.value)}
                  className="form-input form-textarea"
                />
              </div>

              <div className="form-actions">
                <button type="button" className="btn-secondary" onClick={() => setCurrentView('dashboard')}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary btn-submit">
                  Save Card
                </button>
              </div>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────
// Settings panel (no data-reset since data lives in Supabase)
// ─────────────────────────────────────────────
interface SettingsPanelProps {
  apiKey: string;
  setApiKey: (v: string) => void;
  isEditingKey: boolean;
  setIsEditingKey: (v: boolean) => void;
  handleTestApiKey: () => void;
  isTestingKey: boolean;
  diagnosticStatus: { success: boolean; message: string; checked: boolean } | null;
  setDiagnosticStatus: (v: { success: boolean; message: string; checked: boolean } | null) => void;
  selectedModel: string;
  setSelectedModel: (v: string) => void;
  keyJustSaved: boolean;
  setKeyJustSaved: (v: boolean) => void;
  onDone: () => void;
}

function SettingsPanel(props: SettingsPanelProps) {
  const {
    apiKey,
    setApiKey,
    isEditingKey,
    setIsEditingKey,
    handleTestApiKey,
    isTestingKey,
    diagnosticStatus,
    setDiagnosticStatus,
    selectedModel,
    setSelectedModel,
    keyJustSaved,
    setKeyJustSaved,
    onDone,
  } = props;

  const handleSaveKey = () => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    setApiKey(trimmed); // forces a write to localStorage with the trimmed value
    setIsEditingKey(false);
    setKeyJustSaved(true);
    setTimeout(() => setKeyJustSaved(false), 1800);
  };

  return (
    <div className="animate-fade-in">
      <div className="glass-form-card">
        <h2 className="form-title">Settings</h2>
        <p className="form-desc">Configure your Gemini API settings to power AI example sentences.</p>

        <div className="form-group">
          <label htmlFor="api-key-input" className="form-label">Google Gemini API Key</label>

          {apiKey && !isEditingKey ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div
                style={{
                  background: 'rgba(16, 185, 129, 0.06)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  borderRadius: '10px',
                  padding: '0.85rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '1rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <CheckCircle2 size={16} style={{ color: 'var(--success)', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--text-primary)', letterSpacing: '0.08em' }}>
                    {'•'.repeat(24)}
                  </span>
                  {keyJustSaved && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--success)', fontWeight: 600 }}>
                      Saved
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditingKey(true);
                    setDiagnosticStatus(null);
                  }}
                  className="btn-secondary"
                  style={{ padding: '0.3rem 0.85rem', fontSize: '0.8rem', flex: 'none', borderRadius: '7px' }}
                >
                  Change Key
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
                <button
                  type="button"
                  onClick={handleTestApiKey}
                  disabled={isTestingKey}
                  className="btn-secondary"
                  style={{ padding: '0.45rem 1.25rem', fontSize: '0.85rem', flex: 'none', borderRadius: '8px' }}
                >
                  {isTestingKey ? 'Verifying...' : 'Verify API Connection'}
                </button>
                {diagnosticStatus && (
                  <div style={{ fontSize: '0.85rem', fontWeight: 500, color: diagnosticStatus.success ? 'var(--success)' : 'var(--danger)', lineHeight: '1.4' }}>
                    {diagnosticStatus.message}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="input-password-wrapper">
                <input
                  id="api-key-input"
                  type="password"
                  placeholder="AIzaSy..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="form-input"
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleSaveKey}
                  disabled={!apiKey.trim()}
                  className="btn-primary"
                  style={{ padding: '0.45rem 1.25rem', fontSize: '0.85rem', flex: 'none' }}
                >
                  Save Key
                </button>
                {isEditingKey && (
                  <button
                    type="button"
                    onClick={() => setIsEditingKey(false)}
                    className="btn-secondary"
                    style={{ padding: '0.45rem 1.25rem', fontSize: '0.85rem', flex: 'none', borderRadius: '8px' }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="info-box" style={{ marginTop: '0.75rem' }}>
            <Key className="info-box-icon" size={16} />
            <div>
              <span>Don't have an API key? Get one free at{' '}</span>
              <a href="https://aistudio.google.com/" target="_blank" rel="noopener noreferrer" className="info-link">
                Google AI Studio
              </a>
              <span>. Your key is stored locally in this browser under your account only — each user signs in and enters their own key. It is never sent to any third-party server.</span>
            </div>
          </div>
        </div>

        <div className="form-group" style={{ marginTop: '1.5rem' }}>
          <label htmlFor="model-input" className="form-label">Google Gemini Model</label>
          <input
            id="model-input"
            type="text"
            placeholder="e.g. gemini-3-flash-preview"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="form-input"
          />
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Gemini 3 Flash Preview', value: 'gemini-3-flash-preview' },
              { label: 'Gemma 4 (26B)', value: 'gemma-4-26b-a4b-it' },
            ].map(({ label, value }) => (
              <button
                key={value}
                type="button"
                onClick={() => setSelectedModel(value)}
                className="nav-btn"
                style={{
                  fontSize: '0.75rem',
                  padding: '0.25rem 0.65rem',
                  borderRadius: '6px',
                  background: selectedModel === value ? 'var(--primary-glow)' : 'rgba(255,255,255,0.04)',
                  borderColor: selectedModel === value ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  color: selectedModel === value ? 'var(--primary)' : 'var(--text-secondary)',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-actions" style={{ marginTop: '2rem' }}>
          <button type="button" className="btn-primary" style={{ width: '100%', display: 'block' }} onClick={onDone}>
            Save & Back
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Stats panel
// ─────────────────────────────────────────────
function StatsPanel({ stats, loading }: { stats: StatsMetrics | null; loading: boolean }) {
  if (loading || !stats) {
    return (
      <div className="animate-fade-in" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
        {loading ? 'Loading stats...' : 'No review data yet.'}
      </div>
    );
  }

  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const maxDay = stats.reviewsPerDay.reduce((m, b) => Math.max(m, b.total), 0);

  return (
    <div className="animate-fade-in">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon-wrapper due" style={{ background: 'var(--success-glow)', color: 'var(--success)' }}>
            <Target size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{pct(stats.retentionRate)}</span>
            <span className="stat-label">Retention (overall)</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrapper new">
            <TrendingUp size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{pct(stats.retentionRate7d)}</span>
            <span className="stat-label">Retention (7 days)</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrapper total">
            <BarChart3 size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.learningRatePerWeek.toFixed(1)}</span>
            <span className="stat-label">New cards learned / week</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon-wrapper due">
            <Flame size={24} />
          </div>
          <div className="stat-info">
            <span className="stat-value">{stats.activeDays}</span>
            <span className="stat-label">Active days</span>
          </div>
        </div>
      </div>

      <div className="study-now-card">
        <h2 className="study-title">Activity (last 14 days)</h2>
        <p className="study-subtitle">
          {stats.reviewsToday} reviews today · {stats.totalReviews} total · {stats.passedReviews} passed ·
          {' '}{stats.uniqueWordsReviewed} unique words · {stats.cardsGraduated} cards graduated
        </p>
        <div className="activity-bars">
          {stats.reviewsPerDay.map((b) => {
            const heightPct = maxDay === 0 ? 0 : Math.max(4, (b.total / maxDay) * 100);
            const passHeight = b.total === 0 ? 0 : (b.passed / b.total) * heightPct;
            const label = b.date.slice(5); // MM-DD
            return (
              <div key={b.date} className="activity-bar-col" title={`${b.date}: ${b.passed}/${b.total} passed`}>
                <div className="activity-bar-stack">
                  <div className="activity-bar-total" style={{ height: `${heightPct}%` }} />
                  <div className="activity-bar-pass" style={{ height: `${passHeight}%` }} />
                </div>
                <span className="activity-bar-label">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="glass-form-card" style={{ marginTop: '1.5rem' }}>
        <h3 className="section-title" style={{ marginTop: 0 }}>How these are calculated</h3>
        <ul style={{ color: 'var(--text-secondary)', lineHeight: 1.7, paddingLeft: '1.25rem' }}>
          <li><strong>Retention rate</strong> = reviews scored Hard / Good / Easy ÷ all reviews. Again (1) is a fail.</li>
          <li><strong>Learning rate</strong> = number of cards that graduated out of learning (old interval = 0 → new interval ≥ 1 day), divided by the number of weeks since your first review.</li>
          <li><strong>Active days</strong> = distinct calendar days on which you reviewed at least one card.</li>
          <li>The bar chart shows reviews per day; the lighter portion is your passes.</li>
        </ul>
      </div>
    </div>
  );
}

export default App;
