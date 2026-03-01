// src/pages/TieSheet.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSelector, useDispatch } from 'react-redux';
import axios from 'axios';
import debounce from 'lodash/debounce';
import BracketPrintPage from '../components/TieSheet/BracketPrintPage';
import { setPrintData, clearPrintData } from '../store/bracketsSlice';
import {
  sanitizeId,
  getFullImageUrl,
  normalizeString,
  MEDAL_PLACEHOLDER,
  generateSingleEliminationGameStructure,
} from '../components/TieSheet/bracketUtils';
import useBracketGenerator from '../components/TieSheet/useBracketGenerator.jsx';
import BracketFilters from '../components/TieSheet/BracketFilters';
import BracketHeader from '../components/TieSheet/BracketHeader';
import BracketTable from '../components/TieSheet/BracketTable';
import MedalSection from '../components/TieSheet/MedalSection';
import SignatureSection from '../components/TieSheet/SignatureSection';
import BracketActions from '../components/TieSheet/BracketActions';
import BracketFooter from '../components/TieSheet/BracketFooter';
import { createPDFDoc, createAndOpenPDFInNewTab, getMultipleBracketsFilename } from '../components/TieSheet/pdfUtils';
import toast, { Toaster } from 'react-hot-toast';
import { setInitialBrackets, setOutcomes, toggleLock } from '../store/bracketsSlice';
import styles from './TieSheet.module.css';
import * as d3 from 'd3';

// Error Boundary
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null };
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('TieSheet ErrorBoundary caught:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', textAlign: 'center', color: 'red' }}>
          <h2>Something went wrong in TieSheet</h2>
          <p>{this.state.error?.message || 'Unknown error'}</p>
          <button onClick={() => window.location.reload()}>Refresh Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const isDev = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;

const TieSheet = () => {
  const { id: rawId } = useParams();
  const id = rawId?.trim();
  const location = useLocation();
  const navigate = useNavigate();
  const { token, isAuthenticated } = useAuth();
  const dispatch = useDispatch();

  // Local states with safe initialization
  const [tournament, setTournament] = useState(null);
  const [players, setPlayers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedGenders, setSelectedGenders] = useState([]);
  const [selectedAgeCategories, setSelectedAgeCategories] = useState([]);
  const [availableGenders, setAvailableGenders] = useState([]);
  const [availableAgeCategories, setAvailableAgeCategories] = useState([]);
  const [tournamentName, setTournamentName] = useState('Unnamed Tournament');
  const [federation, setFederation] = useState('N/A');
  const [logoLeft, setLogoLeft] = useState(null);
  const [logoRight, setLogoRight] = useState(null);
  const initialLoadRef = useRef(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPdfSaving, setIsPdfSaving] = useState(false); // ✅ PDF capture state (keeps DOM mounted)
  const [columnInfo, setColumnInfo] = useState({});

  // Server entries snapshot meta (used to decide whether restoring saved brackets is safe)
  const [entriesMeta, setEntriesMeta] = useState({
    count: 0,
    lastUpdated: null,
    shape: 'unknown',
  });
  const entriesMetaRef = useRef(entriesMeta);
  useEffect(() => {
    entriesMetaRef.current = entriesMeta;
  }, [entriesMeta]);

  // Prevent overlapping refresh clicks
  const refreshInFlightRef = useRef(false);

  // Mount tracking
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // StrictMode-safe main fetch control (abort previous run)
  const mainFetchAbortRef = useRef(null);
  const mainFetchRunIdRef = useRef(0);

  // ✅ Outcomes hydration + persistence guards
  const outcomesHydratedRef = useRef(false);
  const outcomesHydrationRunRef = useRef(0);
  const outcomesHydrationAbortRef = useRef(null);

  const lastLocalSavedHashRef = useRef('');
  const lastServerSavedHashRef = useRef('');
  const serverSaveInFlightRef = useRef(false);

  // Safe Redux selectors with deep null checks
  const brackets = useSelector((state) => {
    try {
      return Array.isArray(state?.brackets?.brackets) ? state.brackets.brackets : [];
    } catch (err) {
      console.error('Error accessing brackets from Redux:', err);
      return [];
    }
  });

  const bracketsOutcomes = useSelector((state) => {
    try {
      return state?.brackets?.bracketsOutcomes && typeof state.brackets.bracketsOutcomes === 'object'
        ? state.brackets.bracketsOutcomes
        : {};
    } catch (err) {
      console.error('Error accessing bracketsOutcomes from Redux:', err);
      return {};
    }
  });

  const lastOutcomeAction = useSelector((state) => {
    try {
      return state?.brackets?.lastOutcomeAction || null;
    } catch {
      return null;
    }
  });

  const lockedBracketsArray = useSelector((state) => {
    try {
      return Array.isArray(state?.brackets?.lockedBrackets) ? state.brackets.lockedBrackets : [];
    } catch (err) {
      console.error('Error accessing lockedBrackets from Redux:', err);
      return [];
    }
  });

  const lockedBrackets = useMemo(() => {
    try {
      return new Set(lockedBracketsArray || []);
    } catch (err) {
      console.error('Error creating lockedBrackets Set:', err);
      return new Set();
    }
  }, [lockedBracketsArray]);

  /**
   * ✅ CRITICAL FIX (kept):
   * Generator setters must accept BOTH shapes:
   * - setBrackets(array)
   * - setBrackets({ brackets, outcomes, lockedBrackets })
   */
  const setBracketsSafe = useCallback(
    (arg) => {
      try {
        // Case A: setBrackets([...])
        if (Array.isArray(arg)) {
          dispatch(setInitialBrackets({ brackets: arg }));
          return;
        }

        // Case B: setBrackets({ brackets: [...], outcomes: {...}, lockedBrackets: [...] })
        if (arg && typeof arg === 'object') {
          const nextBrackets = Array.isArray(arg.brackets) ? arg.brackets : undefined;
          const nextOutcomes = arg.outcomes && typeof arg.outcomes === 'object' ? arg.outcomes : undefined;
          const nextLocked = Array.isArray(arg.lockedBrackets) ? arg.lockedBrackets : undefined;

          if (isDev) {
            console.log('🧩 [TieSheet] setBracketsSafe received object shape', {
              hasBracketsArray: Array.isArray(arg.brackets),
              hasOutcomesObject: !!(arg.outcomes && typeof arg.outcomes === 'object'),
              hasLockedArray: Array.isArray(arg.lockedBrackets),
              bracketsLen: Array.isArray(arg.brackets) ? arg.brackets.length : 0,
            });
          }

          dispatch(
            setInitialBrackets({
              brackets: nextBrackets,
              outcomes: nextOutcomes,
              lockedBrackets: nextLocked,
            })
          );
          return;
        }

        if (isDev) console.warn('⚠️ [TieSheet] setBracketsSafe got unexpected value:', arg);
      } catch (err) {
        console.error('setBracketsSafe failed:', err);
      }
    },
    [dispatch]
  );

  const setBracketsOutcomesSafe = useCallback(
    (arg) => {
      try {
        if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
          if (arg.outcomes && typeof arg.outcomes === 'object') {
            if (isDev) console.log('🧩 [TieSheet] setBracketsOutcomesSafe received {outcomes: ...}');
            dispatch(setOutcomes(arg.outcomes));
            return;
          }

          if (isDev) console.log('🧩 [TieSheet] setBracketsOutcomesSafe received outcomes object directly');
          dispatch(setOutcomes(arg));
          return;
        }

        if (isDev) console.warn('⚠️ [TieSheet] setBracketsOutcomesSafe got unexpected value:', arg);
      } catch (err) {
        console.error('setBracketsOutcomesSafe failed:', err);
      }
    },
    [dispatch]
  );

  const showToast = {
    loading: (message) => toast.loading(message, { duration: 0 }),
    update: (toastId, message, type = 'loading') => {
      toast.dismiss(toastId);
      if (type === 'success') {
        return toast.success(message, { duration: 4000 });
      } else if (type === 'error') {
        return toast.error(message, { duration: 6000 });
      } else {
        return toast.loading(message, { id: toastId, duration: 0 });
      }
    },
    success: (message) => toast.success(message, { duration: 4000 }),
    error: (message) => toast.error(message, { duration: 6000 }),
  };

  // Bracket generation hook
  const { generatedBrackets, computedMedals, isGenerating, generationError } = useBracketGenerator({
    players,
    lockedBrackets,
    brackets,
    bracketsOutcomes,
    setBrackets: setBracketsSafe,
    setBracketsOutcomes: setBracketsOutcomesSafe,
    setMedalsByCategory: () => {},
  });

  // Sync generated brackets to Redux (unchanged behavior)
  useEffect(() => {
    try {
      if (
        Array.isArray(generatedBrackets) &&
        generatedBrackets.length > 0 &&
        JSON.stringify(generatedBrackets) !== JSON.stringify(brackets)
      ) {
        if (isDev) console.log('Syncing generated brackets to Redux');
        dispatch(
          setInitialBrackets({
            brackets: generatedBrackets,
            outcomes: bracketsOutcomes,
          })
        );
      }
    } catch (err) {
      console.error('Error syncing generated brackets:', err);
    }
  }, [generatedBrackets, brackets, dispatch, bracketsOutcomes]);

  const genderOrder = ['Male', 'Female'];
  const ageCategoryOrder = ['Sub-Junior', 'Cadet', 'Junior', 'Senior', 'Under - 14', 'Under - 17', 'Under - 19'];

  const ageCategoryMappingRef = useRef({
    'under - 14': 'Under - 14',
    'under - 17': 'Under - 17',
    'under - 19': 'Under - 19',
    'sub-junior': 'Sub-Junior',
    cadet: 'Cadet',
    junior: 'Junior',
    senior: 'Senior',
    'under-14': 'Under - 14',
    'under-17': 'Under - 17',
    'under-19': 'Under - 19',
  });

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const getApiBaseUrl = useCallback(() => {
    const raw = (import.meta.env.VITE_API_URL || '').trim();
    const fallback = 'http://localhost:5000/api';
    const base = raw || fallback;
    const normalized = base.replace(/\/+$/, '');
    return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
  }, []);

  const getAuthConfig = useCallback(() => {
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  }, [token]);

  const normalizePlayers = useCallback((rows, tournamentData) => {
    const ageCategoryMapping = ageCategoryMappingRef.current;
    const playersData = Array.isArray(rows) ? rows : [];

    // ✅ Single source of truth for gender normalization
    const normalizeGender = (value) => {
      if (value === null || value === undefined) return '';
      const raw = String(value).trim();
      if (!raw) return '';

      // Keep alpha tokens, normalize spacing
      const s = raw.toLowerCase().replace(/[^a-z]/g, '');

      // Common variants -> canonical
      if (s === 'm' || s === 'male' || s === 'man' || s === 'men' || s === 'boy' || s === 'boys') return 'Male';
      if (s === 'f' || s === 'female' || s === 'woman' || s === 'women' || s === 'girl' || s === 'girls') return 'Female';

      // Fallback: old behavior (Title Case)
      return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
    };

    if (isDev) {
      console.log('ENTRY KEYS:', rows?.[0] ? Object.keys(rows[0]) : null);
      console.log('ENTRY SAMPLE:', rows?.[0]);
    }

    const cleanedMapped = playersData.map((p) => ({
      ...p,
      // ✅ apply normalization here
      gender: normalizeGender(p?.gender),
      ageCategory: ageCategoryMapping[normalizeString(p?.ageCategory)] || p?.ageCategory,
      weightCategory: p?.weightCategory,
      name: p?.name || '',
      team: p?.team || '',
    }));

    if (isDev) console.log('BEFORE FILTER SAMPLE:', cleanedMapped?.[0]);

    const cleaned = cleanedMapped.filter((p) => p?.name && p?.gender && p?.ageCategory && p?.weightCategory);

    // ✅ Requested DEV log: first cleaned gender
    if (isDev) console.log('🧬 [TieSheet] cleaned[0].gender:', cleaned?.[0]?.gender || null);

    if (!tournamentData) return cleaned;

    // ✅ Requested DEV log: tournamentData.ageGender
    if (isDev) console.log('🧬 [TieSheet] tournamentData.ageGender:', tournamentData?.ageGender || null);

    const allAgeCategories = [...(tournamentData.ageCategories?.open || []), ...(tournamentData.ageCategories?.official || [])].map(
      (c) => ageCategoryMapping[normalizeString(c)] || c
    );

    const allowedGenders = new Set();
    ['open', 'official'].forEach((type) => {
      if (tournamentData.ageGender?.[type]) {
        Object.values(tournamentData.ageGender[type]).forEach((genders) => {
          if (Array.isArray(genders)) {
            genders.forEach((g) => {
              const ng = normalizeGender(g);
              if (ng) allowedGenders.add(ng);
            });
          }
        });
      }
    });

    if (allowedGenders.size === 0) cleaned.forEach((p) => p.gender && allowedGenders.add(p.gender));

    // ✅ Requested DEV log: allowedGenders array
    if (isDev) console.log('🧬 [TieSheet] allowedGenders:', [...allowedGenders]);

    const allowedAgeCategories = new Set(allAgeCategories.length > 0 ? allAgeCategories : ageCategoryOrder);

    const allowedWeightCategories = new Set([
      ...(tournamentData.weightCategories?.selected?.male || []),
      ...(tournamentData.weightCategories?.selected?.female || []),
    ]);

    const mappedPlayers = cleaned.filter((p) => {
      const genderOk = p.gender && allowedGenders.has(p.gender);
      const ageOk = p.ageCategory && allowedAgeCategories.has(p.ageCategory);
      const weightOk =
        allowedWeightCategories.size === 0
          ? !!p.weightCategory
          : [...allowedWeightCategories].some((wc) => normalizeString(wc) === normalizeString(p.weightCategory));
      return genderOk && ageOk && weightOk;
    });

    const genders = [...allowedGenders].sort((a, b) => genderOrder.indexOf(a) - genderOrder.indexOf(b));
    const ageCategories = [
      ...new Set([...allowedAgeCategories].map((ac) => ageCategoryMapping[normalizeString(ac)] || ac)),
    ].sort((a, b) => ageCategoryOrder.indexOf(a) - ageCategoryOrder.indexOf(b));

    setAvailableGenders(genders.length > 0 ? genders : ['Male', 'Female']);
    setSelectedGenders(genders.length > 0 ? genders : ['Male']);
    setAvailableAgeCategories(ageCategories.length > 0 ? ageCategories : ageCategoryOrder);
    setSelectedAgeCategories(ageCategories.length > 0 ? ageCategories : ageCategoryOrder);

    return mappedPlayers;
  }, []);

  const fetchTournamentFromServer = useCallback(
    async (signal) => {
      const baseUrl = getApiBaseUrl();
      const config = { ...getAuthConfig(), signal };
      const response = await axios.get(`${baseUrl}/tournament/${id}`, config);

      const tournamentData = {
        tournamentName: response.data.tournamentName || 'Unnamed Tournament',
        federation: response.data.federation || 'N/A',
        ageCategories: response.data.ageCategories || {},
        ageGender: response.data.ageGender || {},
        weightCategories: response.data.weightCategories || {},
      };

      const logos = response.data.logos || [];
      setLogoLeft(logos[0] ? getFullImageUrl(logos[0]) : null);
      setLogoRight(logos.length > 1 ? getFullImageUrl(logos[1]) : logos[0] ? getFullImageUrl(logos[0]) : null);

      setTournament(tournamentData);
      setTournamentName(tournamentData.tournamentName);
      setFederation(tournamentData.federation);

      return tournamentData;
    },
    [getApiBaseUrl, getAuthConfig, id]
  );

  const fetchEntriesFromServer = useCallback(
    async (attempts = 4, delayMs = 700, signal) => {
      const baseUrl = getApiBaseUrl();
      const config = { ...getAuthConfig(), signal };

      let lastErr = null;

      for (let i = 0; i < attempts; i += 1) {
        try {
          const url = `${baseUrl}/tournaments/${id}/entries?ts=${Date.now()}`;
          const resp = await axios.get(url, config);

          const payload = resp?.data || {};
          const shape = Array.isArray(payload?.entries) ? 'entries' : 'unknown';

          const rows = Array.isArray(payload.entries) ? payload.entries : [];

          if (isDev) console.log('SAMPLE ENTRY ROW:', rows?.[0]);

          const count = typeof payload.count === 'number' ? payload.count : rows.length;
          const lastUpdated = payload.lastUpdated || null;

          if (isDev) {
            console.log(
              `📥 [TieSheet] Loaded server entries: ${rows.length} (shape=${shape}) (attempt ${i + 1}/${attempts})`
            );
            console.log(`🧮 [TieSheet] Entries meta: count=${count}, lastUpdated=${lastUpdated}`);
          }

          if (mountedRef.current) setEntriesMeta({ count, lastUpdated, shape });

          return { rows, count, lastUpdated };
        } catch (err) {
          if (signal?.aborted) throw err;
          lastErr = err;
          if (isDev) console.warn(`⚠️ [TieSheet] Entries fetch failed (attempt ${i + 1}/${attempts}):`, err?.message || err);
          if (i < attempts - 1) await sleep(delayMs);
        }
      }

      throw lastErr || new Error('Failed to fetch entries from server');
    },
    [getApiBaseUrl, getAuthConfig, id]
  );

  const fetchLatestTieSheetFromServer = useCallback(
    async (signal) => {
      const baseUrl = getApiBaseUrl();
      const config = { ...getAuthConfig(), signal };
      const resp = await axios.get(`${baseUrl}/tournament/${id}/tiesheet?ts=${Date.now()}`, config);
      return resp?.data?.tiesheet || null;
    },
    [id, getApiBaseUrl, getAuthConfig]
  );

  // ✅ Lightweight outcomes-only endpoint (authoritative)
  const fetchTieSheetOutcomesFromServer = useCallback(
    async (signal) => {
      const baseUrl = getApiBaseUrl();
      const config = { ...getAuthConfig(), signal };
      const resp = await axios.get(`${baseUrl}/tournament/${id}/tiesheet-outcomes?ts=${Date.now()}`, config);
      return resp?.data || null; // { outcomes, outcomesUpdatedAt }
    },
    [id, getApiBaseUrl, getAuthConfig]
  );

  const saveTieSheetOutcomesToServer = useCallback(
    async (outcomes, signal) => {
      const baseUrl = getApiBaseUrl();
      const config = {
        ...getAuthConfig(),
        signal,
        timeout: 20000,
        headers: {
          ...(getAuthConfig()?.headers || {}),
          'Content-Type': 'application/json',
        },
      };
      const payload = { outcomes: outcomes || {} };
      const resp = await axios.put(`${baseUrl}/tournament/${id}/tiesheet-outcomes`, payload, config);
      return resp?.data || null;
    },
    [id, getApiBaseUrl, getAuthConfig]
  );

  const shouldRestoreSavedBrackets = useCallback((serverTieSheet, currentEntriesMeta) => {
    try {
      if (!serverTieSheet || !Array.isArray(serverTieSheet.brackets) || serverTieSheet.brackets.length === 0) return false;

      const savedUpdated = serverTieSheet.entriesLastUpdated || null;
      const savedCount = typeof serverTieSheet.entriesCount === 'number' ? serverTieSheet.entriesCount : null;

      const currentUpdated = currentEntriesMeta?.lastUpdated || null;
      const currentCount = typeof currentEntriesMeta?.count === 'number' ? currentEntriesMeta.count : null;

      if (!savedUpdated || savedCount === null) return false;

      return String(savedUpdated) === String(currentUpdated) && Number(savedCount) === Number(currentCount);
    } catch {
      return false;
    }
  }, []);

  const handleToggleLock = useCallback(
    (bracketKey) => {
      try {
        dispatch(toggleLock(bracketKey));
      } catch (err) {
        console.error('Error in handleToggleLock:', err);
      }
    },
    [dispatch]
  );

  // Lock persistence (kept)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`locked_brackets_${id}`);
      if (saved) JSON.parse(saved);
    } catch (e) {
      console.error('Failed to load locked brackets', e);
    }
  }, [id]);

  useEffect(() => {
    try {
      localStorage.setItem(`locked_brackets_${id}`, JSON.stringify(Array.from(lockedBrackets)));
    } catch (e) {
      console.error('Failed to save locked brackets', e);
    }
  }, [lockedBrackets, id]);

  // ✅ Record saver (already existed) - kept
  useEffect(() => {
    window.saveTieSheetRecord = async (bracketKey, htmlContent, bracketInfo, actionType = 'print') => {
      try {
        const sanitizedContent = htmlContent || '';
        const newRecord = {
          id: Date.now(),
          tournamentId: id,
          bracketKey,
          category: `${bracketInfo?.gender || ''} - ${bracketInfo?.ageCategory || ''} - ${bracketInfo?.weightCategory || ''} ${
            bracketInfo?.pool ? `(${bracketInfo.pool})` : ''
          }`,
          playerCount: bracketInfo?.categoryPlayerCount || bracketInfo?.playerCount || 0,
          htmlContent: sanitizedContent,
          printedAt: new Date().toLocaleString('en-IN', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
          }),
          actionType,
        };

        const key = `tiesheet_records_${id}`;
        let existing = [];
        const saved = localStorage.getItem(key);
        if (saved) {
          try {
            existing = JSON.parse(saved);
          } catch {}
        }
        existing.push(newRecord);
        localStorage.setItem(key, JSON.stringify(existing));

        try {
          const baseUrl = getApiBaseUrl();
          await axios.post(`${baseUrl}/tournament/${id}/tiesheet-record`, newRecord, {
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch (err) {
          console.error('Failed to save record on server', err);
        }
      } catch (err) {
        console.error('Error in saveTieSheetRecord:', err);
      }
    };

    return () => {
      delete window.saveTieSheetRecord;
    };
  }, [id, token, getApiBaseUrl]);

  // ✅ Helper: log records for multiple brackets (Print All / Save All)
  const buildBracketInfo = useCallback((br) => {
    if (!br) return {};
    return {
      gender: br.gender,
      ageCategory: br.ageCategory,
      weightCategory: br.weightCategory,
      pool: br.pool || '',
      playerCount: br.playerCount || 0,
      categoryPlayerCount: br.categoryPlayerCount || br.playerCount || 0,
    };
  }, []);

  const safeLogRecordForBracket = useCallback(
    (br, actionType) => {
      try {
        const saver = window?.saveTieSheetRecord;
        if (typeof saver !== 'function') {
          if (isDev) console.warn('[TieSheet] saveTieSheetRecord is not available on window yet.');
          return;
        }
        if (!br?.key) return;

        const el = document.getElementById(`bracket-${sanitizeId(br.key)}`);
        const htmlContent = el?.outerHTML || '';
        if (!htmlContent) {
          if (isDev) console.warn('[TieSheet] Record skipped: bracket DOM missing for', br.key);
          return;
        }

        const info = buildBracketInfo(br);
        Promise.resolve(saver(br.key, htmlContent, info, actionType)).catch((e) => {
          if (isDev) console.warn('[TieSheet] saveTieSheetRecord failed:', e);
        });
      } catch (e) {
        if (isDev) console.warn('[TieSheet] safeLogRecordForBracket error:', e);
      }
    },
    [buildBracketInfo]
  );

  const safeLogRecordsForBrackets = useCallback(
    (bracketsList, actionType) => {
      try {
        const list = Array.isArray(bracketsList) ? bracketsList : [];
        for (const br of list) {
          safeLogRecordForBracket(br, actionType);
        }
      } catch (e) {
        if (isDev) console.warn('[TieSheet] safeLogRecordsForBrackets error:', e);
      }
    },
    [safeLogRecordForBracket]
  );

  /**
   * ✅ Outcomes Hydration (Server-first, local fallback)
   * - Does NOT overwrite outcomes until we explicitly hydrate.
   * - Prevents localStorage empty-overwrite on initial render.
   * - StrictMode safe: abort previous hydration run.
   */
  useEffect(() => {
    if (!id) return;

    // abort previous hydration run
    try {
      if (outcomesHydrationAbortRef.current) outcomesHydrationAbortRef.current.abort();
    } catch {}

    const controller = new AbortController();
    outcomesHydrationAbortRef.current = controller;
    const runId = (outcomesHydrationRunRef.current += 1);

    const localKey = `brackets_outcomes_${id}`;

    const hydrate = async () => {
      // If we already hydrated once for this id, do nothing
      outcomesHydratedRef.current = false;

      // 1) Try server
      try {
        const data = await fetchTieSheetOutcomesFromServer(controller.signal);
        if (controller.signal.aborted) return;

        const serverOutcomes = data?.outcomes;
        if (serverOutcomes && typeof serverOutcomes === 'object' && !Array.isArray(serverOutcomes)) {
          dispatch(setOutcomes(serverOutcomes));
          outcomesHydratedRef.current = true;

          // write-through local cache
          try {
            localStorage.setItem(localKey, JSON.stringify(serverOutcomes));
          } catch {}

          if (isDev) {
            console.log('✅ [TieSheet] Outcomes hydrated from SERVER', {
              tournamentId: id,
              outcomesUpdatedAt: data?.outcomesUpdatedAt || null,
            });
          }
          return;
        }

        // If server returns empty/null outcomes, still consider it authoritative
        if (serverOutcomes && typeof serverOutcomes === 'object') {
          dispatch(setOutcomes(serverOutcomes));
          outcomesHydratedRef.current = true;
          try {
            localStorage.setItem(localKey, JSON.stringify(serverOutcomes));
          } catch {}
          if (isDev) console.log('✅ [TieSheet] Outcomes hydrated from SERVER (empty object)', { tournamentId: id });
          return;
        }

        if (isDev) console.log('ℹ️ [TieSheet] Server outcomes missing -> fallback to LOCAL', { tournamentId: id });
      } catch (err) {
        if (controller.signal.aborted) return;
        if (isDev)
          console.log('⚠️ [TieSheet] Server outcomes unavailable -> fallback to LOCAL', {
            tournamentId: id,
            err: err?.message || err,
          });
      }

      // 2) Local fallback
      try {
        const saved = localStorage.getItem(localKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            dispatch(setOutcomes(parsed));
            outcomesHydratedRef.current = true;
            if (isDev) console.log('✅ [TieSheet] Outcomes hydrated from LOCAL fallback', { tournamentId: id });
            return;
          }
        }
      } catch (err) {
        if (isDev)
          console.warn('⚠️ [TieSheet] Failed to parse LOCAL outcomes, clearing key', {
            tournamentId: id,
            err: err?.message || err,
          });
        try {
          localStorage.removeItem(localKey);
        } catch {}
      }

      // Even if nothing found, mark as hydrated to allow future saves without overwriting an existing cache incorrectly.
      outcomesHydratedRef.current = true;
      if (isDev) console.log('ℹ️ [TieSheet] Outcomes hydrate finished (no data found)', { tournamentId: id });
    };

    hydrate();

    return () => {
      try {
        controller.abort();
      } catch {}
    };
  }, [id, dispatch, fetchTieSheetOutcomesFromServer]);

  // ✅ Debounced server save for outcomes (real-time trigger, StrictMode safe)
  const debouncedSaveOutcomesToServer = useMemo(() => {
    return debounce(async (outcomesSnapshot, meta) => {
      if (!id) return;

      const hash = (() => {
        try {
          return JSON.stringify(outcomesSnapshot || {});
        } catch {
          return '';
        }
      })();

      if (!hash) return;
      if (lastServerSavedHashRef.current === hash) return;
      if (serverSaveInFlightRef.current) {
        // If a request is in-flight, allow next debounce tick to send latest
        return;
      }

      serverSaveInFlightRef.current = true;

      const controller = new AbortController();
      try {
        const resp = await saveTieSheetOutcomesToServer(outcomesSnapshot || {}, controller.signal);

        lastServerSavedHashRef.current = hash;

        if (isDev) {
          console.log('💾 [TieSheet] Outcomes saved to SERVER', {
            tournamentId: id,
            bracketKey: meta?.bracketKey || null,
            gameId: meta?.gameId || null,
            side: meta?.side || null,
            outcomesUpdatedAt: resp?.outcomesUpdatedAt || null,
          });
        }
      } catch (err) {
        if (isDev) {
          console.warn('⚠️ [TieSheet] Outcomes save to SERVER failed', {
            tournamentId: id,
            bracketKey: meta?.bracketKey || null,
            gameId: meta?.gameId || null,
            side: meta?.side || null,
            err: err?.message || err,
          });
        }
      } finally {
        serverSaveInFlightRef.current = false;
      }
    }, 450);
  }, [id, saveTieSheetOutcomesToServer]);

  useEffect(() => {
    return () => {
      try {
        debouncedSaveOutcomesToServer.cancel();
      } catch {}
    };
  }, [debouncedSaveOutcomesToServer]);

  /**
   * ✅ Real-time persistence for outcomes:
   * A) localStorage immediately
   * B) server (authoritative) via lightweight endpoint
   * - Prevents initial empty overwrite until hydration is complete.
   * - Logs bracketKey + gameId using lastOutcomeAction from Redux.
   */
  useEffect(() => {
    if (!id) return;
    if (!outcomesHydratedRef.current) return;

    const localKey = `brackets_outcomes_${id}`;

    const hash = (() => {
      try {
        return JSON.stringify(bracketsOutcomes || {});
      } catch {
        return '';
      }
    })();

    if (!hash) return;

    // LOCAL write-through (instant persistence)
    if (lastLocalSavedHashRef.current !== hash) {
      try {
        localStorage.setItem(localKey, hash);
        lastLocalSavedHashRef.current = hash;

        if (isDev) {
          console.log('💾 [TieSheet] Outcomes saved to LOCAL', {
            key: localKey,
            bracketKey: lastOutcomeAction?.bracketKey || null,
            gameId: lastOutcomeAction?.gameId || null,
            side: lastOutcomeAction?.side || null,
          });
        }
      } catch (err) {
        console.error('Failed to save outcomes to localStorage:', err);
      }
    }

    // SERVER save (authoritative)
    // Trigger immediately (debounced transport to prevent spam + StrictMode duplicates)
    debouncedSaveOutcomesToServer(bracketsOutcomes || {}, {
      bracketKey: lastOutcomeAction?.bracketKey,
      gameId: lastOutcomeAction?.gameId,
      side: lastOutcomeAction?.side,
    });
  }, [bracketsOutcomes, id, debouncedSaveOutcomesToServer, lastOutcomeAction]);

  // ✅ MAIN FETCH (StrictMode-safe)
  useEffect(() => {
    if (!id) return;

    try {
      if (mainFetchAbortRef.current) mainFetchAbortRef.current.abort();
    } catch {}

    const controller = new AbortController();
    mainFetchAbortRef.current = controller;

    const runId = (mainFetchRunIdRef.current += 1);

    const fetchData = async () => {
      if (isDev) console.log(`🚀 [TieSheet] Main fetch start (runId=${runId})`, { id });

      if (mountedRef.current) {
        setIsLoading(true);
        setError(null);
      }

      try {
        const tournamentData = await fetchTournamentFromServer(controller.signal);
        if (controller.signal.aborted) return;

        const { rows, count, lastUpdated } = await fetchEntriesFromServer(4, 700, controller.signal);
        if (controller.signal.aborted) return;

        const mappedPlayers = normalizePlayers(rows, tournamentData);

        if (!mappedPlayers || mappedPlayers.length === 0) {
          throw new Error('No valid players found on server. Please add players in Entry page.');
        }

        if (mountedRef.current && !controller.signal.aborted) setPlayers(mappedPlayers);

        if (initialLoadRef.current) {
          initialLoadRef.current = false;

          if (isDev) console.log('Attempting to restore saved tie-sheet from server...');

          try {
            const saved = await fetchLatestTieSheetFromServer(controller.signal);
            if (controller.signal.aborted) return;

            const canRestore = shouldRestoreSavedBrackets(saved, { count, lastUpdated });

            if (canRestore) {
              if (isDev) console.log('🧩 [TieSheet] Snapshot match -> restoring brackets from server');

              // ✅ DO NOT overwrite outcomes here. Outcomes are hydrated separately (server-first, local fallback).
              dispatch(
                setInitialBrackets({
                  brackets: saved.brackets,
                })
              );

              if (saved.filters) {
                setSelectedGenders((prev) => saved.filters.selectedGenders || prev);
                setSelectedAgeCategories((prev) => saved.filters.selectedAgeCategories || prev);
              }
            } else {
              if (isDev) console.log('♻️ [TieSheet] Entries changed -> ignoring saved brackets and regenerating');

              // ✅ Brackets regen is allowed; keep outcomes intact unless regen actually happens downstream.
              dispatch(setInitialBrackets({ brackets: [] }));

              if (saved?.filters) {
                setSelectedGenders((prev) => saved.filters.selectedGenders || prev);
                setSelectedAgeCategories((prev) => saved.filters.selectedAgeCategories || prev);
              }
            }
          } catch (err) {
            if (controller.signal.aborted) return;
            if (err?.response?.status === 404) {
              if (isDev) console.log('No saved tie-sheet exists on server yet');
            } else {
              console.warn('Failed to load saved tie-sheet:', err?.message || err);
            }
          }
        }

        if (isDev) console.log(`🧾 [TieSheet] Main fetch end (runId=${runId})`);
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('Main data fetch failed:', err);
        if (mountedRef.current) setError(err.message || 'Failed to load tournament or player data');
      } finally {
        const isLatestRun = runId === mainFetchRunIdRef.current;
        if (!controller.signal.aborted && mountedRef.current && isLatestRun) {
          if (isDev) console.log(`✅ [TieSheet] Main fetch finally -> setIsLoading(false) (runId=${runId})`);
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      try {
        controller.abort();
      } catch {}
    };
  }, [
    id,
    token,
    dispatch,
    fetchTournamentFromServer,
    fetchEntriesFromServer,
    fetchLatestTieSheetFromServer,
    normalizePlayers,
    shouldRestoreSavedBrackets,
  ]);

  // Real-time sync: on Entry update event, re-fetch SERVER entries
  useEffect(() => {
    const handleEntryUpdate = async () => {
      try {
        if (isDev) console.log('EVENT RECEIVED: entryDataUpdated_', id, '-> refetching server entries');

        const controller = new AbortController();
        const tournamentData = tournament || (await fetchTournamentFromServer(controller.signal));
        const { rows } = await fetchEntriesFromServer(3, 600, controller.signal);
        const mappedPlayers = normalizePlayers(rows, tournamentData);

        if (mappedPlayers && mappedPlayers.length > 0) {
          setPlayers(mappedPlayers);

          // ✅ Do NOT wipe outcomes on entry refresh; only brackets regenerate.
          dispatch(setInitialBrackets({ brackets: [] }));
        }
      } catch (err) {
        console.warn('Entry update sync failed:', err?.message || err);
      }
    };

    window.addEventListener(`entryDataUpdated_${id}`, handleEntryUpdate);
    return () => window.removeEventListener(`entryDataUpdated_${id}`, handleEntryUpdate);
  }, [id, tournament, fetchTournamentFromServer, fetchEntriesFromServer, normalizePlayers, dispatch]);

  // Filtered brackets
  const filteredBrackets = useMemo(() => {
    try {
      const safeBrackets = Array.isArray(brackets) ? brackets : [];
      const safeGenders = Array.isArray(selectedGenders) ? selectedGenders : [];
      const safeAges = Array.isArray(selectedAgeCategories) ? selectedAgeCategories : [];

      if (safeGenders.length === 0 && safeAges.length === 0) return safeBrackets;

      return safeBrackets.filter((b) => {
        if (!b || typeof b !== 'object') return false;
        const genderMatch = safeGenders.length === 0 || (b.gender && safeGenders.includes(b.gender));
        const ageMatch = safeAges.length === 0 || (b.ageCategory && safeAges.includes(b.ageCategory));
        return genderMatch && ageMatch;
      });
    } catch (err) {
      console.error('Error in filteredBrackets calculation:', err);
      return [];
    }
  }, [brackets, selectedGenders, selectedAgeCategories]);

  const safeFilteredBrackets = useMemo(() => (Array.isArray(filteredBrackets) ? filteredBrackets : []), [filteredBrackets]);

  // Dev-only confirmation logs
  useEffect(() => {
    if (!isDev) return;
    console.log('🧾 UI STATE', {
      isLoading,
      error,
      playersLen: players?.length || 0,
      bracketsLen: brackets?.length || 0,
      filteredLen: filteredBrackets?.length || 0,
      generatedLen: generatedBrackets?.length || 0,
      isGenerating,
      generationError: generationError?.message || null,
      selectedGenders,
      selectedAgeCategories,
      isProcessing,
      isPdfSaving,
    });
  }, [
    isLoading,
    error,
    players,
    brackets,
    filteredBrackets,
    generatedBrackets,
    isGenerating,
    generationError,
    selectedGenders,
    selectedAgeCategories,
    isProcessing,
    isPdfSaving,
  ]);

  // Debounced auto-save (kept as-is for full tiesheet snapshot; outcomes are now saved separately in real-time)
  const debouncedSaveTieSheet = useMemo(
    () =>
      debounce(async () => {
        try {
          const safeBrackets = Array.isArray(brackets) ? brackets : [];
          if (!safeBrackets.length || !id || isLoading) return;

          const baseUrl = getApiBaseUrl();
          const config = {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            timeout: 30000,
          };

          const meta = entriesMetaRef.current || {};
          const dataToSave = {
            tiesheet: {
              brackets: safeBrackets,
              outcomes: bracketsOutcomes || {},
              filters: { selectedGenders, selectedAgeCategories },
              entriesCount: typeof meta.count === 'number' ? meta.count : undefined,
              entriesLastUpdated: meta.lastUpdated || null,
            },
          };

          await axios.put(`${baseUrl}/tournament/${id}/tiesheet`, dataToSave, config);
          if (isDev) console.log('TieSheet auto-saved');
        } catch (err) {
          console.error('Auto-save failed:', err);
        }
      }, 8000),
    [brackets, bracketsOutcomes, selectedGenders, selectedAgeCategories, id, token, isLoading, getApiBaseUrl]
  );

  useEffect(() => {
    debouncedSaveTieSheet();
    return () => debouncedSaveTieSheet.cancel();
  }, [debouncedSaveTieSheet]);

  // Refresh (kept)
  const handleRefresh = useCallback(async () => {
    if (refreshInFlightRef.current) {
      if (isDev) console.log('🔄 Refresh ignored: already in progress');
      return;
    }

    refreshInFlightRef.current = true;
    if (isDev) console.log('🔄 Refresh button clicked (server-truth entries)');

    setIsLoading(true);
    setError(null);

    const controller = new AbortController();

    try {
      const tournamentData = tournament || (await fetchTournamentFromServer(controller.signal));
      const { rows, count, lastUpdated } = await fetchEntriesFromServer(4, 700, controller.signal);
      const mappedPlayers = normalizePlayers(rows, tournamentData);

      if (!mappedPlayers || mappedPlayers.length === 0) {
        throw new Error('No valid players found on server. Please add players in Entry page.');
      }

      setPlayers(mappedPlayers);

      let serverTieSheet = null;
      try {
        serverTieSheet = await fetchLatestTieSheetFromServer(controller.signal);
      } catch (err) {
        if (err?.response?.status !== 404)
          console.warn('Refresh: failed to fetch tiesheet from server:', err?.message || err);
      }

      const canRestore = shouldRestoreSavedBrackets(serverTieSheet, { count, lastUpdated });

      if (serverTieSheet?.brackets?.length > 0 && canRestore) {
        // ✅ Restore brackets only; do NOT override outcomes here.
        dispatch(setInitialBrackets({ brackets: serverTieSheet.brackets }));
        if (serverTieSheet.filters) {
          setSelectedGenders((prev) => serverTieSheet.filters.selectedGenders || prev);
          setSelectedAgeCategories((prev) => serverTieSheet.filters.selectedAgeCategories || prev);
        }
      } else {
        // ✅ Regenerate brackets; keep outcomes intact.
        dispatch(setInitialBrackets({ brackets: [] }));
        if (serverTieSheet?.filters) {
          setSelectedGenders((prev) => serverTieSheet.filters.selectedGenders || prev);
          setSelectedAgeCategories((prev) => serverTieSheet.filters.selectedAgeCategories || prev);
        }
      }
    } catch (err) {
      console.error('Refresh error:', err);
      if (mountedRef.current) setError('Refresh failed: ' + (err.message || 'Unknown error'));
    } finally {
      if (mountedRef.current) setIsLoading(false);
      refreshInFlightRef.current = false;
      if (isDev) console.log('🔚 Refresh ended');
    }
  }, [
    tournament,
    fetchTournamentFromServer,
    fetchEntriesFromServer,
    normalizePlayers,
    fetchLatestTieSheetFromServer,
    shouldRestoreSavedBrackets,
    dispatch,
  ]);

  const safeComputedMedals = useMemo(() => {
    return computedMedals && typeof computedMedals === 'object' ? computedMedals : {};
  }, [computedMedals]);

  /**
   * ✅ Print All => Generate multi-page PDF (A4 landscape) using existing createPDFDoc flow,
   * then open in NEW tab/window (no auto-print).
   */
  const printAllBrackets = useCallback(
    async (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (!safeFilteredBrackets.length) return;
      if (isLoading || isProcessing || isPdfSaving) return;

      setIsProcessing(true);

      try {
        const filename = getMultipleBracketsFilename(safeFilteredBrackets);
        await createAndOpenPDFInNewTab(safeFilteredBrackets, { showToast, filename });

        // ✅ Record ONLY after success (no throw)
        safeLogRecordsForBrackets(safeFilteredBrackets, 'print');
      } catch (err) {
        console.error('[TieSheet] Print All PDF failed:', err);
        showToast.error('PDF generation failed. Please try again.');
      } finally {
        setIsProcessing(false);
      }
    },
    [safeFilteredBrackets, isLoading, isProcessing, isPdfSaving, showToast, safeLogRecordsForBrackets]
  );

  /**
   * ✅ Save All to PDF:
   * - DOES NOT touch isLoading (so bracket DOM stays mounted)
   * - toggles pdf-export-mode on ALL rendered brackets for capture
   * - uses createPDFDoc(...) with progress toasts
   * - downloads via doc.save(filename)
   */
  const saveAllToPDF = useCallback(async () => {
    if (!safeFilteredBrackets.length) {
      showToast.error('No brackets to save');
      return;
    }

    if (isLoading || isProcessing || isPdfSaving) return;

    setIsPdfSaving(true);

    const filename = getMultipleBracketsFilename(safeFilteredBrackets);
    const toastId = showToast.loading('Generating PDF... 0%');

    const toggledEls = [];

    const toggleExportMode = (enabled) => {
      for (const br of safeFilteredBrackets) {
        const key = br?.key;
        if (!key) continue;

        const el = document.getElementById(`bracket-${sanitizeId(key)}`);
        if (!el) continue;

        if (enabled) {
          if (!el.classList.contains('pdf-export-mode')) {
            el.classList.add('pdf-export-mode');
            toggledEls.push(el);
          }
        } else {
          el.classList.remove('pdf-export-mode');
        }
      }
    };

    let savedOk = false;

    try {
      toggleExportMode(true);

      const doc = await createPDFDoc(safeFilteredBrackets, (progress, current, total) => {
        try {
          const pct = typeof progress === 'number' ? progress : 0;
          const extra = total ? ` (${current}/${total})` : '';
          showToast.update(toastId, `Generating PDF... ${pct}%${extra}`);
        } catch {}
      });

      try {
        doc.save(filename);
        savedOk = true;
      } catch (err) {
        console.error('[TieSheet] doc.save failed for Save All:', err);
        showToast.error('PDF download failed. Please try again.');
        return;
      }

      showToast.update(toastId, 'PDF downloaded successfully!', 'success');

      // ✅ Record ONLY if save succeeded
      if (savedOk) {
        safeLogRecordsForBrackets(safeFilteredBrackets, 'save');
      }
    } catch (err) {
      console.error('[TieSheet] Save All PDF failed:', err);
      showToast.update(toastId, 'PDF generation failed. Try again.', 'error');
    } finally {
      try {
        for (const el of toggledEls) {
          try {
            el.classList.remove('pdf-export-mode');
          } catch {}
        }
        toggleExportMode(false);
      } catch {}

      setIsPdfSaving(false);

      setTimeout(() => {
        try {
          toast.dismiss(toastId);
        } catch {}
      }, 800);
    }
  }, [safeFilteredBrackets, isLoading, isProcessing, isPdfSaving, showToast, safeLogRecordsForBrackets]);

  if (!isAuthenticated) {
    navigate('/login');
    return null;
  }

  return (
    <ErrorBoundary>
      <Toaster
        position="top-center"
        reverseOrder={false}
        gutter={12}
        containerStyle={{ top: 20 }}
        toastOptions={{
          duration: 4000,
          style: {
            borderRadius: '12px',
            background: '#333',
            color: '#fff',
            padding: '16px 24px',
            fontSize: '16px',
            maxWidth: '400px',
          },
          success: { style: { background: '#10b981' } },
          error: { style: { background: '#ef4444' } },
          loading: { style: { background: '#3b82f6' } },
        }}
      />

      <div className={styles.tieSheetContainer}>
        {isLoading && (
          <div className={styles.loadingOverlay}>
            <div className={styles.spinner}></div>
            <p>Loading Tie Sheet...</p>
          </div>
        )}

        {error && (
          <div className={styles.errorMessage}>
            <h2>Error</h2>
            <p>{error}</p>
            <button className={styles.toggleButton} onClick={() => navigate(`/tournaments/${id}/entry`)}>
              Go to Entry Page
            </button>
          </div>
        )}

        {!isLoading && !error && (
          <>
            <div className={styles.stickyWrapper}>
              <div className={styles.pdfbtn}>
                <h2 className={`${styles.text2xl} ${styles.fontBold} ${styles.textCenter}`}>
                  Tie Sheet for {tournamentName}
                </h2>

                <div className={styles.actionButtons}>
                  <button
                    className={styles.toggleButton}
                    onClick={handleRefresh}
                    disabled={isLoading || isProcessing || isPdfSaving}
                  >
                    Refresh
                  </button>

                  <button
                    className={styles.toggleButton}
                    onClick={printAllBrackets}
                    disabled={!safeFilteredBrackets.length || isLoading || isProcessing || isPdfSaving}
                  >
                    {isProcessing ? 'Printing...' : 'Print All'}
                  </button>

                  <button
                    type="button"
                    className={styles.toggleButton}
                    onClick={saveAllToPDF}
                    disabled={!safeFilteredBrackets.length || isLoading || isProcessing || isPdfSaving}
                  >
                    Save All to PDF
                  </button>
                </div>
              </div>

              <BracketFilters
                availableGenders={availableGenders}
                selectedGenders={selectedGenders}
                setSelectedGenders={setSelectedGenders}
                availableAgeCategories={availableAgeCategories}
                selectedAgeCategories={selectedAgeCategories}
                setSelectedAgeCategories={setSelectedAgeCategories}
              />
            </div>

            {!safeFilteredBrackets || safeFilteredBrackets.length === 0 ? (
              <p className={styles.noData}>No brackets available for the selected categories.</p>
            ) : (
              safeFilteredBrackets.map((bracket, index) => {
                if (!bracket || !bracket.key) {
                  console.error('Invalid bracket found:', bracket);
                  return null;
                }

                const baseKey = bracket.key.replace(/_Pool.*$/, '');
                const medals = safeComputedMedals[baseKey] || {
                  gold: MEDAL_PLACEHOLDER,
                  silver: MEDAL_PLACEHOLDER,
                  bronze1: MEDAL_PLACEHOLDER,
                  bronze2: MEDAL_PLACEHOLDER,
                };

                const bracketSizeClass =
                  bracket.playerCount === 1
                    ? styles.singlePlayer
                    : bracket.playerCount === 2
                      ? styles.twoPlayer
                      : bracket.playerCount === 3
                        ? styles.threePlayer
                        : bracket.playerCount === 4
                          ? styles.fourPlayer
                          : bracket.playerCount === 5
                            ? styles.fivePlayer
                            : bracket.playerCount === 6
                              ? styles.sixPlayer
                              : bracket.playerCount === 7
                                ? styles.sevenPlayer
                                : bracket.playerCount === 8
                                  ? styles.eightPlayer
                                  : bracket.playerCount === 9
                                    ? styles.ninePlayer
                                    : bracket.playerCount === 10
                                      ? styles.tenPlayer
                                      : bracket.playerCount === 11
                                        ? styles.elevenPlayer
                                        : bracket.playerCount === 12
                                          ? styles.twelvePlayer
                                          : bracket.playerCount === 13
                                            ? styles.thirteenPlayer
                                            : bracket.playerCount === 14
                                              ? styles.fourteenPlayer
                                              : bracket.playerCount === 15
                                                ? styles.fifteenPlayer
                                                : bracket.playerCount === 16
                                                  ? styles.sixteenPlayer
                                                  : bracket.playerCount <= 8
                                                    ? styles.smallBracket
                                                    : styles.multiPlayer;

                const roundsCount = bracket?.gamesByRound?.length || 0;
                const columnData = columnInfo[bracket.key] || [];

                return (
                  <div key={bracket.key} className={`${styles.bracketWrapper} ${bracketSizeClass}`}>
                    <BracketActions
                      bracket={bracket}
                      lockedBrackets={lockedBrackets}
                      bracketsOutcomes={bracketsOutcomes}
                      filteredBrackets={safeFilteredBrackets}
                      tournamentId={id}
                      toggleLock={handleToggleLock}
                      showToast={showToast}
                    />

                    <div
                      className={`${styles.page} ${bracketSizeClass}`}
                      id={`bracket-${sanitizeId(bracket.key)}`}
                      data-bracket-key={sanitizeId(bracket.key)}
                    >
                      <BracketHeader
                        bracket={bracket}
                        tournamentName={tournamentName}
                        federation={federation}
                        logoLeft={logoLeft}
                        logoRight={logoRight}
                      />

                      {roundsCount === 1 ? (
                        <div className={styles.singleRoundWrapper}>
                          <div className={styles.singleRoundColumn}>
                            <div className={styles.roundHeaderSingle}></div>
                            <div className={styles.singleRoundFlowFix}>
                              <BracketTable
                                bracket={bracket}
                                bracketsOutcomes={bracketsOutcomes}
                                className={bracketSizeClass}
                                lockedBrackets={lockedBrackets}
                                onColumnsReady={(columns) => {
                                  setColumnInfo((prev) => ({ ...prev, [bracket.key]: columns }));
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div
                            className={styles.roundHeaderStrip}
                            style={{ display: 'flex', justifyContent: 'stretch', gap: '0px' }}
                          >
                            {columnData.map((col) => (
                              <div
                                key={col.roundIndex}
                                className={styles.roundHeaderCell}
                                style={{
                                  flex: '1 1 0px',
                                  minWidth: '180px',
                                  padding: '0 12px',
                                  fontSize: '1.02rem',
                                }}
                              >
                                {col.name}
                              </div>
                            ))}
                          </div>

                          <BracketTable
                            bracket={bracket}
                            bracketsOutcomes={bracketsOutcomes}
                            className={bracketSizeClass}
                            lockedBrackets={lockedBrackets}
                            onColumnsReady={(columns) => {
                              setColumnInfo((prev) => ({ ...prev, [bracket.key]: columns }));
                            }}
                          />
                        </>
                      )}

                      <div className={styles.signatureMedalSection}>
                        <MedalSection
                          medals={medals}
                          categoryPlayerCount={bracket.categoryPlayerCount || bracket.playerCount}
                          bracket={bracket}
                          bracketsOutcomes={bracketsOutcomes}
                        />
                        <SignatureSection />
                      </div>

                      <BracketFooter index={index} total={safeFilteredBrackets.length} />
                    </div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default TieSheet;