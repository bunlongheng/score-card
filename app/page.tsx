"use client";
import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { ShieldCheck, Layout, Server, Users, Database, Lock, Zap, Beaker, Cloud, Rocket, Wrench, TrendingUp, MessageSquare, Download, X, FileText, Trash2, Clock, UserCheck, Network, Play, Pause, RotateCcw, Tag, Briefcase, SendHorizonal, Copy, Check } from "lucide-react";
import Anthropic from "@anthropic-ai/sdk";

import RUBRIC_SCHEMA from "./data.json";

const SCORECARD_STORAGE_KEY = "score-card:v1";
const SCORECARD_NOTE_BADGES_STORAGE_KEY = "score-card:note-badges:v1";
const TOOL_TIMER_START_SECONDS = 60;
const TOOL_TIMER_START_TENTHS = TOOL_TIMER_START_SECONDS * 10;
const ROW_TEXTURE_VARIANTS = [
    {
        id: "black-stripes",
        label: "Black stripes",
        overlay: "repeating-linear-gradient(120deg, rgba(0,0,0,0.24) 0px, rgba(0,0,0,0.24) 1px, transparent 1px, transparent 9px)",
    },
    {
        id: "black-crosshatch",
        label: "Black crosshatch",
        overlay:
            "repeating-linear-gradient(120deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 1px, transparent 1px, transparent 11px), repeating-linear-gradient(32deg, rgba(0,0,0,0.14) 0px, rgba(0,0,0,0.14) 1px, transparent 1px, transparent 12px)",
    },
    {
        id: "black-carbon",
        label: "Black carbon",
        overlay:
            "repeating-linear-gradient(90deg, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 1px, transparent 1px, transparent 10px), repeating-linear-gradient(0deg, rgba(0,0,0,0.12) 0px, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 10px)",
    },
    {
        id: "black-veil",
        label: "Black veil",
        overlay: "repeating-linear-gradient(155deg, rgba(0,0,0,0.18) 0px, rgba(0,0,0,0.18) 8px, rgba(0,0,0,0.08) 8px, rgba(0,0,0,0.08) 16px)",
    },
] as const;

const normalizeRowTextureVariantId = (incoming: unknown): (typeof ROW_TEXTURE_VARIANTS)[number]["id"] => {
    if (typeof incoming !== "string") return ROW_TEXTURE_VARIANTS[0].id;
    const matched = ROW_TEXTURE_VARIANTS.find((variant) => variant.id === incoming);
    return matched ? matched.id : ROW_TEXTURE_VARIANTS[0].id;
};

const clampScore = (value: number) => Math.min(5, Math.max(1, value));

const buildDefaultScores = (schema: any[]) => Object.fromEntries(schema.map((cat) => [cat.id, 3]));

const normalizeScoresForSchema = (schema: any[], incomingScores: Record<string, number> = {}) => {
    const defaults = buildDefaultScores(schema);
    return Object.fromEntries(
        Object.keys(defaults).map((id) => {
            const incoming = Number(incomingScores[id]);
            return [id, Number.isFinite(incoming) ? clampScore(incoming) : defaults[id]];
        }),
    );
};

const normalizeDataForSchema = (schema: any[], incomingData: unknown) => {
    if (!Array.isArray(incomingData)) return schema;
    const storedById = new Map<string, any>();

    incomingData.forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const candidate = entry as Record<string, unknown>;
        const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
        if (!id) return;
        storedById.set(id, candidate);
    });

    return schema.map((defaults) => {
        const stored = storedById.get(defaults.id);
        if (!stored) return defaults;

        const mergedItems = Array.isArray(stored.items)
            ? stored.items.flatMap((item: unknown): string[] => {
                  if (typeof item === "string" && item.trim()) return [item];
                  if (item && typeof item === "object" && "label" in item && typeof (item as any).label === "string" && (item as any).label.trim()) return [(item as any).label];
                  return [];
              })
            : [];
        return {
            ...defaults,
            category: typeof stored.category === "string" && stored.category.trim() ? stored.category : defaults.category,
            icon: typeof stored.icon === "string" && stored.icon.trim() ? stored.icon : defaults.icon,
            color: typeof stored.color === "string" && stored.color.trim() ? stored.color : defaults.color,
            items: mergedItems.length > 0 ? mergedItems : defaults.items,
        };
    });
};

const toFileToken = (value: string) =>
    String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

const getGradualCategoryColor = (index: number, total: number) => {
    if (total <= 1) return "hsl(0 92% 62%)";
    const hue = (index / (total - 1)) * 320;
    return `hsl(${hue.toFixed(1)} 78% 54%)`;
};

const withAlpha = (color: string, alpha: number) => {
    const safeAlpha = Math.max(0, Math.min(1, alpha));
    const source = String(color || "").trim();

    if (source.startsWith("hsl(") && source.endsWith(")")) {
        return `${source.slice(0, -1)} / ${safeAlpha})`;
    }

    if (source.startsWith("rgb(") && source.endsWith(")")) {
        const rgbParts = source
            .slice(4, -1)
            .split(",")
            .map((part) => part.trim());
        if (rgbParts.length >= 3) return `rgba(${rgbParts[0]}, ${rgbParts[1]}, ${rgbParts[2]}, ${safeAlpha})`;
    }

    const hexMatch = source.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (hexMatch) {
        const raw = hexMatch[1];
        const hex = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
        const r = Number.parseInt(hex.slice(0, 2), 16);
        const g = Number.parseInt(hex.slice(2, 4), 16);
        const b = Number.parseInt(hex.slice(4, 6), 16);
        return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
    }

    return source;
};

type RubricTopic = {
    id: string;
    label: string;
    expectation?: string;
    strongSignals?: string[];
    redFlags?: string[];
    followUp?: string;
    simpleQuestion?: string;
    simpleAnswer?: string;
};

type RubricCategory = {
    id: string;
    label: string;
    icon?: string;
    color?: string;
    topics: RubricTopic[];
};

type RubricSchema = {
    version: string;
    lastUpdated: string;
    categories: RubricCategory[];
};

// Adapt flat data.json array → RubricSchema shape expected by the rest of the code
type DataJsonItem = { id: string; label: string; question?: string; answer?: string; strongSignals?: string[]; redFlags?: string[] };
type DataJsonRow = { id: string; category: string; icon: string; color: string; items: (string | DataJsonItem)[] };
const RUBRIC: RubricSchema = {
    version: "1.0",
    lastUpdated: new Date().toISOString(),
    categories: (RUBRIC_SCHEMA as unknown as DataJsonRow[]).map((row) => ({
        id: row.id,
        label: row.category,
        icon: row.icon,
        color: row.color,
        topics: (row.items || []).map((item) => {
            if (typeof item === "string") return { id: item, label: item };
            return {
                id: item.id || item.label,
                label: item.label,
                expectation: item.answer,
                followUp: item.question,
                strongSignals: item.strongSignals || [],
                redFlags: item.redFlags || [],
            };
        }),
    })),
};
const INITIAL_SCHEMA = RUBRIC.categories.map((category) => ({
    id: category.id,
    category: category.label,
    icon: category.icon || "ShieldCheck",
    color: category.color || "#ffffff",
    items: Array.isArray(category.topics) ? category.topics.map((topic) => topic.label).filter(Boolean) : [],
}));

type TopicEvidenceState = Record<
    string,
    {
        strong: string[];
        weak: string[];
    }
>;

type TopicKnowledgeState = Record<string, "know" | "dont">;

type ConfettiShape = "rect" | "circle" | "star" | "ribbon" | "diamond" | "heart";

type ConfettiPiece = {
    id: number;
    dx: number;
    dy: number;
    rotate: number;
    size: number;
    duration: number;
    delay: number;
    color: string;
    shape: ConfettiShape;
};

type ConfettiBurst = {
    id: number;
    x: number;
    y: number;
    pieces: ConfettiPiece[];
};

type ClickRipple = {
    id: number;
    x: number;
    y: number;
    color?: string;
};

const COUNTRY_FLAG_BY_NAME: Record<string, string> = {
    Brazil: "🇧🇷",
    DR: "🇩🇴",
    "Costa Rica": "🇨🇷",
    Colombia: "🇨🇴",
    Mexico: "🇲🇽",
};

const toUniqueStringList = (value: unknown): string[] => {
    if (!Array.isArray(value)) return [];
    return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)));
};

const normalizeTopicEvidence = (incoming: unknown): TopicEvidenceState => {
    if (!incoming || typeof incoming !== "object") return {};
    const output: TopicEvidenceState = {};
    Object.entries(incoming).forEach(([topicKey, value]) => {
        if (!topicKey || typeof topicKey !== "string" || !value || typeof value !== "object") return;
        const candidate = value as Record<string, unknown>;
        const strong = toUniqueStringList(candidate.strong);
        const weak = toUniqueStringList(candidate.weak);
        output[topicKey] = { strong, weak };
    });
    return output;
};

const normalizeTopicKnowledge = (incoming: any): TopicKnowledgeState => {
    if (!incoming || typeof incoming !== "object") return {};
    const output: TopicKnowledgeState = {};
    Object.entries(incoming).forEach(([topicKey, value]) => {
        if (!topicKey || typeof topicKey !== "string") return;
        if (value === "know" || value === "dont") output[topicKey] = value;
    });
    return output;
};

const STRONG_FALLBACKS = [
    "Explains clearly with a concrete example",
    "Calls out practical tradeoffs and constraints",
    "Covers edge cases and failure handling",
    "Connects the idea to production behavior",
    "Keeps reasoning structured and precise",
];

const WEAK_FALLBACKS = [
    "Gives vague or generic explanation only",
    "Cannot provide a concrete example",
    "Misses key tradeoffs or constraints",
    "Skips edge cases and failure modes",
    "Reasoning is inconsistent or unclear",
];

const NOTE_BADGE_FIELDS = [
    { id: "recruiter", label: "Recruiter", options: ["Encora", "LeanTech"] },
    { id: "type", label: "Type", options: ["contractor"] },
    { id: "location", label: "Location", options: ["Near Shore", "Off-shore"] },
    { id: "country", label: "Country", options: ["Brazil", "DR", "Costa Rica", "Colombia", "Mexico"] },
    { id: "project", label: "Project", options: ["3PI"] },
    { id: "team", label: "Team", options: ["Zeta"] },
    { id: "manager", label: "Manager", options: ["Bunlong Heng"] },
] as const;

type NoteBadgeFieldId = (typeof NOTE_BADGE_FIELDS)[number]["id"];
type NoteBadgeSelections = Partial<Record<NoteBadgeFieldId, string>>;

const normalizeNoteBadgeSelections = (incoming: unknown): NoteBadgeSelections => {
    if (!incoming || typeof incoming !== "object") return {};
    const output: NoteBadgeSelections = {};
    const candidate = incoming as Record<string, unknown>;

    NOTE_BADGE_FIELDS.forEach((field) => {
        const value = candidate[field.id];
        if (typeof value !== "string") return;
        const directMatch = field.options.find((option) => option === value);
        if (directMatch) {
            output[field.id] = directMatch;
            return;
        }
        const tokenMatch = field.options.find((option) => toFileToken(option) === toFileToken(value));
        if (tokenMatch) output[field.id] = tokenMatch;
    });

    return output;
};

const formatBadgeOptionLabel = (fieldId: NoteBadgeFieldId, option: string) => {
    if (fieldId !== "country") return option;
    const flag = COUNTRY_FLAG_BY_NAME[option];
    return flag ? `${flag} ${option}` : option;
};

const ensureFiveItems = (items: string[] = [], fallbacks: string[]) => {
    const merged = Array.from(new Set(items.filter((item) => typeof item === "string" && item.trim())));
    for (const fallback of fallbacks) {
        if (merged.length >= 5) break;
        if (!merged.includes(fallback)) merged.push(fallback);
    }
    return merged.slice(0, 5);
};

const buildRubricLookup = (schema: RubricSchema) => {
    const byCategoryAndTopic = new Map<string, RubricTopic>();
    const byTopicOnly = new Map<string, RubricTopic>();

    schema.categories.forEach((category) => {
        const categoryTokens = [category.id, category.label].map((v) => toFileToken(v)).filter(Boolean);
        category.topics.forEach((topic) => {
            const topicTokens = [topic.id, topic.label].map((v) => toFileToken(v)).filter(Boolean);
            topicTokens.forEach((topicToken) => {
                if (!byTopicOnly.has(topicToken)) byTopicOnly.set(topicToken, topic);
                categoryTokens.forEach((categoryToken) => {
                    byCategoryAndTopic.set(`${categoryToken}::${topicToken}`, topic);
                });
            });
        });
    });

    return { byCategoryAndTopic, byTopicOnly };
};

const resolveRubricTopic = (lookup: ReturnType<typeof buildRubricLookup>, category: any, item: string) => {
    const categoryTokens = [category?.id, category?.category].map((v) => toFileToken(String(v || ""))).filter(Boolean);
    const topicTokens = [item].map((v) => toFileToken(v)).filter(Boolean);

    for (const categoryToken of categoryTokens) {
        for (const topicToken of topicTokens) {
            const matched = lookup.byCategoryAndTopic.get(`${categoryToken}::${topicToken}`);
            if (matched) return matched;
        }
    }
    for (const topicToken of topicTokens) {
        const matched = lookup.byTopicOnly.get(topicToken);
        if (matched) return matched;
    }
    return null;
};

const IconMap: Record<string, any> = {
    ShieldCheck,
    Briefcase,
    Layout,
    Server,
    Users,
    Database,
    Lock,
    Zap,
    Beaker,
    Cloud,
    Rocket,
    Wrench,
    TrendingUp,
    MessageSquare,
    FileText,
    Network,
};

export default function PowerScorecard() {
    const [candidate, setCandidate] = useState("John, Doe");
    const [interviewer, setInterviewer] = useState("Bunlong Heng");
    const [role, setRole] = useState("Backend Engineer");
    const [data, setData] = useState(INITIAL_SCHEMA);
    const [scores, setScores] = useState<Record<string, number>>(Object.fromEntries(INITIAL_SCHEMA.map((cat) => [cat.id, 3])));
    const [notes, setNotes] = useState("");
    const [topicEvidence, setTopicEvidence] = useState<TopicEvidenceState>({});
    const [topicKnowledge, setTopicKnowledge] = useState<TopicKnowledgeState>({});
    const [confettiBursts, setConfettiBursts] = useState<ConfettiBurst[]>([]);
    const [toolTimerTenths, setToolTimerTenths] = useState(TOOL_TIMER_START_TENTHS);
    const [toolTimerRunning, setToolTimerRunning] = useState(false);
    const [currentTime, setCurrentTime] = useState(new Date());
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
    const [isRubricQaOpen, setIsRubricQaOpen] = useState(false);
    const [isNoteBadgePickerOpen, setIsNoteBadgePickerOpen] = useState(false);
    const [selectedNoteBadges, setSelectedNoteBadges] = useState<NoteBadgeSelections>({});
    const [rowTextureVariantId, setRowTextureVariantId] = useState<(typeof ROW_TEXTURE_VARIANTS)[number]["id"]>(ROW_TEXTURE_VARIANTS[0].id);
    const [notesActiveLine, setNotesActiveLine] = useState(0);
    const [notesScrollTop, setNotesScrollTop] = useState(0);
    const [notesLineHeight, setNotesLineHeight] = useState(20);
    const [notesPaddingTop, setNotesPaddingTop] = useState(0);
    const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
    const [isStorageHydrated, setIsStorageHydrated] = useState(false);
    const [clickRipples, setClickRipples] = useState<ClickRipple[]>([]);
    const [quizNotesOpen, setQuizNotesOpen] = useState(true);
    const [isSummaryOpen, setIsSummaryOpen] = useState(false);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summaryText, setSummaryText] = useState("");
    const [summaryCopied, setSummaryCopied] = useState(false);
    const clickAudioCtxRef = useRef<AudioContext | null>(null);
    const lastClickToneAtRef = useRef(0);
    const lastHoverToneAtRef = useRef(0);
    const notesTextareaRef = useRef<HTMLTextAreaElement | null>(null);
    const scoreBadgeRef = useRef<HTMLDivElement | null>(null);
    const prevScoreTierRef = useRef<"red" | "yellow" | "green">("red");
    const hasScoreTierHistoryRef = useRef(false);
    const [activeTopic, setActiveTopic] = useState<{
        categoryId: string;
        categoryLabel: string;
        categoryColor: string;
        topicId: string;
        topicLabel: string;
        expectation: string;
        strongSignals: string[];
        redFlags: string[];
        followUp: string;
    } | null>(null);

    const rubricLookup = useMemo(() => buildRubricLookup(RUBRIC), []);

    const persistState = (next: {
        candidate?: string;
        interviewer?: string;
        role?: string;
        data?: any[];
        scores?: Record<string, number>;
        notes?: string;
        topicEvidence?: TopicEvidenceState;
        topicKnowledge?: TopicKnowledgeState;
        noteBadges?: NoteBadgeSelections;
        rowTextureVariantId?: (typeof ROW_TEXTURE_VARIANTS)[number]["id"];
    }) => {
        try {
            const nextData = Array.isArray(next.data) ? next.data : data;
            const normalizedScores = normalizeScoresForSchema(nextData, next.scores ?? scores);
            localStorage.setItem(
                SCORECARD_STORAGE_KEY,
                JSON.stringify({
                    candidate: next.candidate ?? candidate,
                    interviewer: next.interviewer ?? interviewer,
                    role: next.role ?? role,
                    data: nextData,
                    scores: normalizedScores,
                    notes: next.notes ?? notes,
                    topicEvidence: next.topicEvidence ?? topicEvidence,
                    topicKnowledge: next.topicKnowledge ?? topicKnowledge,
                    noteBadges: next.noteBadges ?? selectedNoteBadges,
                    rowTextureVariantId: next.rowTextureVariantId ?? rowTextureVariantId,
                }),
            );
        } catch (err) {
            console.error("Failed to persist scorecard state:", err);
        }
    };

    const persistNoteBadgeState = (next: NoteBadgeSelections) => {
        try {
            localStorage.setItem(SCORECARD_NOTE_BADGES_STORAGE_KEY, JSON.stringify(next));
        } catch (err) {
            console.error("Failed to persist note badge state:", err);
        }
    };

    useEffect(() => {
        try {
            const raw = localStorage.getItem(SCORECARD_STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : null;
            const nextData = normalizeDataForSchema(INITIAL_SCHEMA, parsed?.data);
            const mergedScores = normalizeScoresForSchema(nextData, typeof parsed?.scores === "object" && parsed?.scores ? parsed.scores : {});
            const restoredTopicEvidence = normalizeTopicEvidence(parsed?.topicEvidence);
            const restoredTopicKnowledge = normalizeTopicKnowledge(parsed?.topicKnowledge);
            let restoredNoteBadges = normalizeNoteBadgeSelections(parsed?.noteBadges);
            try {
                const rawNoteBadges = localStorage.getItem(SCORECARD_NOTE_BADGES_STORAGE_KEY);
                if (rawNoteBadges) {
                    const parsedNoteBadges = JSON.parse(rawNoteBadges);
                    restoredNoteBadges = normalizeNoteBadgeSelections(parsedNoteBadges);
                }
            } catch (err) {
                console.error("Failed to restore note badge state:", err);
            }
            const restoredRowTextureVariantId = normalizeRowTextureVariantId(parsed?.rowTextureVariantId);

            setData(nextData);
            setScores(mergedScores);
            setTopicEvidence(restoredTopicEvidence);
            setTopicKnowledge(restoredTopicKnowledge);
            setSelectedNoteBadges(restoredNoteBadges);
            setRowTextureVariantId(restoredRowTextureVariantId);
            if (typeof parsed?.candidate === "string") setCandidate(parsed.candidate);
            if (typeof parsed?.interviewer === "string") setInterviewer(parsed.interviewer);
            if (typeof parsed?.role === "string") setRole(parsed.role);
            if (typeof parsed?.notes === "string") setNotes(parsed.notes);
        } catch (err) {
            console.error("Failed to restore scorecard state:", err);
        } finally {
            setIsStorageHydrated(true);
        }
    }, []);

    useEffect(() => {
        setScores((prev) => {
            const next = normalizeScoresForSchema(data, prev);
            const changed =
                Object.keys(next).length !== Object.keys(prev).length ||
                Object.keys(next).some((id) => Number(prev[id]) !== Number(next[id]));
            return changed ? next : prev;
        });
    }, [data]);

    useEffect(() => {
        if (!isStorageHydrated) return;
        try {
            localStorage.setItem(
                SCORECARD_STORAGE_KEY,
                JSON.stringify({
                    candidate,
                    interviewer,
                    role,
                    data,
                    scores,
                    notes,
                    topicEvidence,
                    topicKnowledge,
                    noteBadges: selectedNoteBadges,
                    rowTextureVariantId,
                }),
            );
        } catch (err) {
            console.error("Failed to persist scorecard state:", err);
        }
    }, [isStorageHydrated, candidate, interviewer, role, data, scores, notes, topicEvidence, topicKnowledge, selectedNoteBadges, rowTextureVariantId]);

    useEffect(() => {
        if (!isStorageHydrated) return;
        persistNoteBadgeState(selectedNoteBadges);
    }, [isStorageHydrated, selectedNoteBadges]);

    useEffect(() => {
        if (!isStorageHydrated) return;
        setSelectedNoteBadges((prev) => {
            const next: NoteBadgeSelections = { ...prev };
            let changed = false;
            NOTE_BADGE_FIELDS.forEach((field) => {
                if (field.options.length === 1 && !next[field.id]) {
                    next[field.id] = field.options[0];
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [isStorageHydrated]);

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        if (!toolTimerRunning) return;
        const interval = window.setInterval(() => {
            setToolTimerTenths((prev) => {
                if (prev <= 1) {
                    window.clearInterval(interval);
                    setToolTimerRunning(false);
                    return 0;
                }
                return prev - 1;
            });
        }, 100);
        return () => window.clearInterval(interval);
    }, [toolTimerRunning]);

    useEffect(() => {
        return () => {
            if (!clickAudioCtxRef.current) return;
            void clickAudioCtxRef.current.close();
            clickAudioCtxRef.current = null;
        };
    }, []);

    const fullDateDisplay = useMemo(
        () =>
            currentTime.toLocaleDateString("en-US", {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
            }),
        [currentTime],
    );
    const currentTimeDisplay = useMemo(
        () =>
            currentTime.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
            }),
        [currentTime],
    );

    const totalStats = useMemo(() => {
        const earned = Object.values(scores).reduce((a, b) => a + b, 0);
        const total = data.length * 5;
        return { earned, total, pct: total > 0 ? ((earned / total) * 100).toFixed(0) : 0 };
    }, [scores, data]);

    const categoryDisplayColorById = useMemo(() => {
        return Object.fromEntries(data.map((category, index) => [String(category.id || index), getGradualCategoryColor(index, data.length)]));
    }, [data]);

    const categoryColorByToken = useMemo(() => {
        const map = new Map<string, string>();
        data.forEach((category, index) => {
            const displayColor = categoryDisplayColorById[String(category.id || index)] || String(category.color || "#ffffff");
            const idToken = toFileToken(String(category.id || ""));
            const labelToken = toFileToken(String(category.category || ""));
            if (idToken) map.set(idToken, displayColor);
            if (labelToken) map.set(labelToken, displayColor);
        });
        return map;
    }, [data, categoryDisplayColorById]);

    const rubricQaGroups = useMemo(
        () =>
            RUBRIC.categories.map((category, idx) => {
                const idToken = toFileToken(category.id);
                const labelToken = toFileToken(category.label);
                const categoryColor = categoryColorByToken.get(idToken) || categoryColorByToken.get(labelToken) || getGradualCategoryColor(idx, RUBRIC.categories.length);
                return {
                    id: category.id,
                    label: category.label,
                    color: categoryColor,
                    topics: (category.topics || []).map((topic) => ({
                        id: topic.id,
                        label: topic.label,
                        question: topic.followUp || topic.expectation,
                        answer: topic.expectation,
                        strongSignals: Array.isArray(topic.strongSignals) ? topic.strongSignals : [],
                        color: categoryColor,
                    })),
                };
            }),
        [categoryColorByToken],
    );

    const selectedNoteBadgeTags = useMemo(
        () =>
            NOTE_BADGE_FIELDS.flatMap((field) => {
                const value = selectedNoteBadges[field.id];
                return value ? [`${field.label}: ${formatBadgeOptionLabel(field.id, value)}`] : [];
            }),
        [selectedNoteBadges],
    );
    const activeRowTextureVariant = useMemo(
        () => ROW_TEXTURE_VARIANTS.find((variant) => variant.id === rowTextureVariantId) || ROW_TEXTURE_VARIANTS[0],
        [rowTextureVariantId],
    );

    const noteLines = useMemo(() => {
        const lines = notes.split("\n");
        return lines.length > 0 ? lines : [""];
    }, [notes]);
    const notesVisibleLineCount = useMemo(() => Math.min(8, Math.max(2, noteLines.length)), [noteLines.length]);
    const notesEditorHeight = useMemo(() => {
        const lineHeight = Number.isFinite(notesLineHeight) && notesLineHeight > 0 ? notesLineHeight : 20;
        const verticalPadding = Number.isFinite(notesPaddingTop) && notesPaddingTop > 0 ? notesPaddingTop * 2 : 0;
        return Math.round(notesVisibleLineCount * lineHeight + verticalPadding + 2);
    }, [notesVisibleLineCount, notesLineHeight, notesPaddingTop]);

    const getCategoryDisplayColor = (category: { id?: string | number; color?: string }) => {
        return categoryDisplayColorById[String(category?.id ?? "")] || String(category?.color || "#ffffff");
    };

    const toggleNoteBadge = (fieldId: NoteBadgeFieldId, option: string) => {
        setSelectedNoteBadges((prev) => {
            const next: NoteBadgeSelections = { ...prev };
            if (next[fieldId] === option) delete next[fieldId];
            else next[fieldId] = option;
            persistState({ noteBadges: next });
            persistNoteBadgeState(next);
            return next;
        });
    };

    const cycleRowTextureVariant = () => {
        setRowTextureVariantId((prev) => {
            const currentIndex = ROW_TEXTURE_VARIANTS.findIndex((variant) => variant.id === prev);
            const nextVariant = ROW_TEXTURE_VARIANTS[(currentIndex + 1 + ROW_TEXTURE_VARIANTS.length) % ROW_TEXTURE_VARIANTS.length];
            persistState({ rowTextureVariantId: nextVariant.id });
            return nextVariant.id;
        });
    };

    const updateNotesCursorState = (target: HTMLTextAreaElement) => {
        const styles = window.getComputedStyle(target);
        const nextLineHeight = Number.parseFloat(styles.lineHeight);
        const nextPaddingTop = Number.parseFloat(styles.paddingTop);
        if (!Number.isNaN(nextLineHeight)) setNotesLineHeight(nextLineHeight);
        if (!Number.isNaN(nextPaddingTop)) setNotesPaddingTop(nextPaddingTop);

        const textBeforeCursor = target.value.substring(0, target.selectionStart || 0);
        setNotesActiveLine(Math.max(0, textBeforeCursor.split("\n").length - 1));
    };

    const handleNotesScroll = (target: HTMLTextAreaElement) => {
        setNotesScrollTop(target.scrollTop || 0);
        updateNotesCursorState(target);
    };

    useEffect(() => {
        if (!isStorageHydrated) return;
        const frame = requestAnimationFrame(() => {
            const target = notesTextareaRef.current;
            if (!target) return;
            setNotesScrollTop(target.scrollTop || 0);
            updateNotesCursorState(target);
        });
        return () => cancelAnimationFrame(frame);
    }, [isStorageHydrated, notes, selectedNoteBadgeTags.length]);

    const toolTimerDisplay = useMemo(() => {
        const seconds = Math.floor(toolTimerTenths / 10);
        const tenths = toolTimerTenths % 10;
        return `${String(seconds).padStart(2, "0")}.${tenths}`;
    }, [toolTimerTenths]);

    const clearRatings = () => {
        const resetScores = buildDefaultScores(data);
        const clearedEvidence: TopicEvidenceState = {};
        const clearedKnowledge: TopicKnowledgeState = {};
        setScores(resetScores);
        setTopicEvidence(clearedEvidence);
        setTopicKnowledge(clearedKnowledge);
        persistState({ scores: resetScores, topicEvidence: clearedEvidence, topicKnowledge: clearedKnowledge });
        setIsResetConfirmOpen(false);
        setActiveTopic(null);
    };

    const handleClearRatings = () => {
        setIsResetConfirmOpen(true);
    };

    const buildTopicDetails = (category: any, topicLabel: string) => {
        const rubricTopic = resolveRubricTopic(rubricLookup, category, topicLabel);
        const topicId = rubricTopic?.id || topicLabel;
        return {
            categoryId: String(category.id || category.category || ""),
            categoryLabel: String(category.category || ""),
            categoryColor: getCategoryDisplayColor(category),
            topicId,
            topicLabel,
            expectation: rubricTopic?.expectation || "No rubric configured for this topic yet.",
            strongSignals: ensureFiveItems(rubricTopic?.strongSignals || [], STRONG_FALLBACKS),
            redFlags: ensureFiveItems(rubricTopic?.redFlags || [], WEAK_FALLBACKS),
            followUp: rubricTopic?.followUp || "",
        };
    };

    const getVisibleItems = (category: { items?: unknown }): string[] => {
        const items = category?.items;
        if (!Array.isArray(items)) return [];
        return items.slice(0, 3).filter((item: unknown): item is string => typeof item === "string");
    };

    const openTopicDetails = (category: any, topicLabel: string) => {
        setToolTimerTenths(TOOL_TIMER_START_TENTHS);
        setToolTimerRunning(true);
        setActiveTopic(buildTopicDetails(category, topicLabel));
    };

    const getTopicEvidenceKey = (categoryId: string, topicId: string) => `${toFileToken(categoryId)}::${toFileToken(topicId)}`;

    const findNextTopicDetails = (currentTopicKey: string) => {
        let foundCurrent = false;
        for (const category of data) {
            const visibleItems = getVisibleItems(category);
            for (const topicLabel of visibleItems) {
                const details = buildTopicDetails(category, String(topicLabel));
                const topicKey = getTopicEvidenceKey(details.categoryId, details.topicId);
                if (foundCurrent) return details;
                if (topicKey === currentTopicKey) foundCurrent = true;
            }
        }
        return null;
    };

    const getTopicKnowledge = (topicKey: string): "know" | "dont" | null => {
        if (topicKnowledge[topicKey]) return topicKnowledge[topicKey];
        if ((topicEvidence[topicKey]?.strong?.length || 0) > 0) return "know";
        if ((topicEvidence[topicKey]?.weak?.length || 0) > 0) return "dont";
        return null;
    };

    const spawnConfetti = useCallback((baseColor: string, intensity: "normal" | "huge" = "normal", lifetimeMs?: number) => {
        const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
        const vh = typeof window !== "undefined" ? window.innerHeight : 900;
        const isHuge = intensity === "huge";
        const burstLifetime = lifetimeMs ?? (isHuge ? 7000 : 2600);
        const pieceDurationBase = isHuge ? 3400 : 1200;
        const pieceDurationRange = isHuge ? 2200 : 800;
        const baseId = Date.now() + Math.floor(Math.random() * 1000);

        if (isHuge) {
            // Heart formation: 80 pieces fly from center to positions tracing a heart curve
            const cx = vw / 2;
            const cy = vh * 0.44;
            const heartScale = Math.min(vw, vh) * 0.028;
            const totalPieces = 96;
            const heartColors = [baseColor, baseColor, baseColor, baseColor, withAlpha(baseColor, 0.7), withAlpha(baseColor, 0.5), "#ffffff"];
            const heartShapes: ConfettiShape[] = ["rect", "rect", "rect", "rect", "rect", "rect", "circle", "diamond"];
            const pieces: ConfettiPiece[] = Array.from({ length: totalPieces }).map((_, i) => {
                const t = (i / totalPieces) * 2 * Math.PI;
                // Parametric heart equations
                const hx = 16 * Math.pow(Math.sin(t), 3);
                const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
                // Negate hy so heart points down (CSS y increases downward)
                const scatter = heartScale * 3.2;
                const dx = hx * heartScale + (Math.random() - 0.5) * scatter;
                const dy = -hy * heartScale + (Math.random() - 0.5) * scatter;
                return {
                    id: i,
                    dx,
                    dy,
                    rotate: (Math.random() - 0.5) * 360,
                    size: 10 + Math.random() * 10,
                    duration: pieceDurationBase + Math.random() * pieceDurationRange,
                    delay: Math.random() * 360,
                    color: heartColors[Math.floor(Math.random() * heartColors.length)],
                    shape: heartShapes[Math.floor(Math.random() * heartShapes.length)],
                };
            });
            setConfettiBursts((prev) => [...prev, { id: baseId, x: cx, y: cy, pieces }]);
            setTimeout(() => {
                setConfettiBursts((prev) => prev.filter((b) => b.id !== baseId));
            }, burstLifetime);
        } else {
            // Normal mode: 8 cannons from corners/edges
            const perCannon = 9;
            const colors = [baseColor, baseColor, baseColor, baseColor, "#ffffff", "#fef08a"];
            const shapes: ConfettiShape[] = ["rect", "rect", "rect", "circle", "circle", "star", "ribbon", "diamond"];
            const cannons = [
                { x: 0,    y: 0,    dxMin: vw*0.2,   dxMax: vw*0.88,  dyMin: vh*0.15,  dyMax: vh*0.88  },
                { x: vw,   y: 0,    dxMin: -vw*0.88, dxMax: -vw*0.2,  dyMin: vh*0.15,  dyMax: vh*0.88  },
                { x: 0,    y: vh,   dxMin: vw*0.2,   dxMax: vw*0.88,  dyMin: -vh*0.88, dyMax: -vh*0.15 },
                { x: vw,   y: vh,   dxMin: -vw*0.88, dxMax: -vw*0.2,  dyMin: -vh*0.88, dyMax: -vh*0.15 },
                { x: vw/2, y: 0,    dxMin: -vw*0.42, dxMax: vw*0.42,  dyMin: vh*0.18,  dyMax: vh*0.92  },
                { x: vw/2, y: vh,   dxMin: -vw*0.42, dxMax: vw*0.42,  dyMin: -vh*0.92, dyMax: -vh*0.18 },
                { x: 0,    y: vh/2, dxMin: vw*0.18,  dxMax: vw*0.92,  dyMin: -vh*0.42, dyMax: vh*0.42  },
                { x: vw,   y: vh/2, dxMin: -vw*0.92, dxMax: -vw*0.18, dyMin: -vh*0.42, dyMax: vh*0.42  },
            ];
            cannons.forEach(({ x, y, dxMin, dxMax, dyMin, dyMax }, idx) => {
                const cannonId = baseId + idx;
                const pieces: ConfettiPiece[] = Array.from({ length: perCannon }).map((_, pieceIdx) => ({
                    id: pieceIdx,
                    dx: dxMin + Math.random() * (dxMax - dxMin),
                    dy: dyMin + Math.random() * (dyMax - dyMin),
                    rotate: (Math.random() - 0.5) * 1000,
                    size: 7 + Math.random() * 7,
                    duration: pieceDurationBase + Math.random() * pieceDurationRange,
                    delay: Math.random() * 200,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    shape: shapes[Math.floor(Math.random() * shapes.length)],
                }));
                setConfettiBursts((prev) => [...prev, { id: cannonId, x, y, pieces }]);
                setTimeout(() => {
                    setConfettiBursts((prev) => prev.filter((b) => b.id !== cannonId));
                }, burstLifetime);
            });
        }
    }, []);

    const setTopicKnowledgeStatus = (status: "know" | "dont") => {
        if (!activeTopic) return;
        const topicKey = getTopicEvidenceKey(activeTopic.categoryId, activeTopic.topicId);
        setTopicKnowledge((prev) => {
            const nextKnowledge = { ...prev, [topicKey]: status };
            persistState({ topicKnowledge: nextKnowledge });
            return nextKnowledge;
        });
        if (status === "know") {
            const accent = activeTopic.categoryColor || "#34d399";
            spawnConfetti(accent, "huge");
            playSuccessSound();
        }
        const nextTopic = findNextTopicDetails(topicKey);
        setTimeout(() => setActiveTopic(nextTopic), 180);
    };

    const startToolTimer = () => {
        setToolTimerTenths((prev) => (prev === 0 ? TOOL_TIMER_START_TENTHS : prev));
        setToolTimerRunning(true);
    };

    const pauseToolTimer = () => setToolTimerRunning(false);

    const resetToolTimer = () => {
        setToolTimerRunning(false);
        setToolTimerTenths(TOOL_TIMER_START_TENTHS);
    };

    const generateRecruiterSummary = () => {
        // Build topic knowledge lists
        const knewTopics: string[] = [];
        const didntKnowTopics: string[] = [];
        data.forEach((cat) => {
            getVisibleItems(cat).forEach((item) => {
                const rubricTopic = resolveRubricTopic(rubricLookup, cat, item);
                const topicId = rubricTopic?.id || item;
                const topicKey = getTopicEvidenceKey(String(cat.id || cat.category || ""), topicId);
                const knowledge = topicKnowledge[topicKey];
                if (knowledge === "know") knewTopics.push(`${cat.category} → ${item}`);
                else if (knowledge === "dont") didntKnowTopics.push(`${cat.category} → ${item}`);
            });
        });

        const categoryScores = data.map((cat) => `${cat.category}: ${scores[cat.id] ?? 3}/5`).join("\n");
        const pct = Number(totalStats.pct);
        const tier = pct < 60 ? "Not Recommended" : pct < 80 ? "Maybe / Conditional" : "Strong Yes";

        const prompt = `You are a technical interview assistant helping write a quick recruiter update. Write ONE short paragraph (3-5 sentences) about this candidate. Focus on whether they're a good fit and why — specifically what gaps or weak areas drive the recommendation. Do NOT mention any numeric scores or percentages. Do NOT restate the job title. Write naturally and conversationally, like a colleague sharing a quick opinion. No bullet points, no lists, just flowing prose.

Candidate: ${candidate || "Unknown"}
Overall signal: ${tier}

Category scores (for context only — do not quote numbers):
${categoryScores}

Topics the candidate KNEW:
${knewTopics.length > 0 ? knewTopics.map((t) => `• ${t}`).join("\n") : "• (none marked)"}

Topics the candidate DID NOT KNOW:
${didntKnowTopics.length > 0 ? didntKnowTopics.map((t) => `• ${t}`).join("\n") : "• (none marked)"}

Interviewer Notes:
${notes.trim() || "(no notes)"}

---
Write the recruiter update paragraph now:`;

        setSummaryText(prompt);
        setSummaryLoading(false);
        setIsSummaryOpen(true);
    };

    const spawnClickRipple = (x: number, y: number, color?: string) => {
        const id = Date.now() + Math.floor(Math.random() * 1000);
        setClickRipples((prev) => [...prev, { id, x, y, color }]);
        window.setTimeout(() => {
            setClickRipples((prev) => prev.filter((ripple) => ripple.id !== id));
        }, 800);
    };

    const handleInteractiveClick = (event: { clientX?: number; clientY?: number } | null) => {
        playUiClickSound();
        if (event && typeof event.clientX === "number" && typeof event.clientY === "number") {
            spawnClickRipple(event.clientX, event.clientY, activeTopic?.categoryColor);
        }
    };

    const playUiClickSound = () => {
        const now = performance.now();
        if (now - lastClickToneAtRef.current < 30) return;
        lastClickToneAtRef.current = now;

        try {
            const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioCtx) return;
            if (!clickAudioCtxRef.current) clickAudioCtxRef.current = new AudioCtx();
            const ctx = clickAudioCtxRef.current;
            if (ctx.state === "suspended") void ctx.resume();

            const t0 = ctx.currentTime;
            const osc = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();

            osc.type = "triangle";
            osc.frequency.setValueAtTime(640, t0);
            osc.frequency.exponentialRampToValueAtTime(760, t0 + 0.045);

            filter.type = "highpass";
            filter.frequency.setValueAtTime(180, t0);

            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.exponentialRampToValueAtTime(0.032, t0 + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.08);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);

            osc.start(t0);
            osc.stop(t0 + 0.085);
        } catch (err) {
            console.error("Click sound failed:", err);
        }
    };

    const playUiHoverSound = () => {
        const now = performance.now();
        if (now - lastHoverToneAtRef.current < 90) return;
        lastHoverToneAtRef.current = now;

        try {
            const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioCtx) return;
            if (!clickAudioCtxRef.current) clickAudioCtxRef.current = new AudioCtx();
            const ctx = clickAudioCtxRef.current;
            if (ctx.state === "suspended") void ctx.resume();

            const t0 = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";
            osc.frequency.setValueAtTime(360, t0);
            osc.frequency.exponentialRampToValueAtTime(420, t0 + 0.05);
            gain.gain.setValueAtTime(0.0001, t0);
            gain.gain.exponentialRampToValueAtTime(0.014, t0 + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.075);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + 0.08);
        } catch (err) {
            console.error("Hover sound failed:", err);
        }
    };

    const playSuccessSound = () => {
        try {
            const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioCtx) return;
            if (!clickAudioCtxRef.current) clickAudioCtxRef.current = new AudioCtx();
            const ctx = clickAudioCtxRef.current;
            if (ctx.state === "suspended") void ctx.resume();

            const t0 = ctx.currentTime;
            const notes = [523.25, 659.25, 783.99];

            notes.forEach((freq, idx) => {
                const start = t0 + idx * 0.06;
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "triangle";
                osc.frequency.setValueAtTime(freq, start);
                gain.gain.setValueAtTime(0.0001, start);
                gain.gain.exponentialRampToValueAtTime(0.045, start + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(start);
                osc.stop(start + 0.26);
            });
        } catch (err) {
            console.error("Success sound failed:", err);
        }
    };

    const downloadSnapshot = async () => {
        try {
            const { default: html2canvas } = await import("html2canvas");
            const now = new Date();
            const root = document.documentElement;
            const canvas = await html2canvas(root, {
                backgroundColor: "#000000",
                useCORS: true,
                allowTaint: true,
                scale: Math.min(window.devicePixelRatio || 1, 2),
                width: root.scrollWidth,
                height: root.scrollHeight,
                windowWidth: root.scrollWidth,
                windowHeight: root.scrollHeight,
                scrollX: 0,
                scrollY: 0,
            });

            const url = canvas.toDataURL("image/png");
            const a = document.createElement("a");
            const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
            const nameToken = toFileToken(candidate) || "candidate";
            a.href = url;
            a.download = `score-card-${nameToken}-${stamp}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            console.error("Screenshot download failed:", err);
        }
    };

    const activeTopicKey = activeTopic ? getTopicEvidenceKey(activeTopic.categoryId, activeTopic.topicId) : null;
    const activeTopicKnowledge = activeTopicKey ? getTopicKnowledge(activeTopicKey) : null;
    const isTopicTimerExpired = Boolean(activeTopic && toolTimerTenths === 0);
    // Color scale is tuned for practical interviewing use where 5s are rarely assigned.
    const practicalMaxTotal = data.length * 4;
    const scorePctForColor = practicalMaxTotal > 0 ? Math.min(100, (totalStats.earned / practicalMaxTotal) * 100) : 0;
    const scoreTier: "red" | "yellow" | "green" = scorePctForColor < 60 ? "red" : scorePctForColor < 80 ? "yellow" : "green";
    const scoreTone = scoreTier === "red"
        ? {
              border: "rgba(220, 38, 38, 0.98)",
              background: "linear-gradient(145deg, rgb(239, 68, 68) 0%, rgb(220, 38, 38) 55%, rgb(153, 27, 27) 100%)",
              glow: "0 0 0 3px rgba(239,68,68,0.24), 0 0 26px rgba(220,38,38,0.64)",
          }
        : scoreTier === "yellow"
          ? {
                border: "rgba(245, 158, 11, 0.98)",
                background: "linear-gradient(145deg, rgb(250, 204, 21) 0%, rgb(245, 158, 11) 55%, rgb(180, 83, 9) 100%)",
                glow: "0 0 0 3px rgba(245,158,11,0.24), 0 0 26px rgba(245,158,11,0.62)",
            }
          : {
                border: "rgba(22, 163, 74, 0.98)",
                background: "linear-gradient(145deg, rgb(74, 222, 128) 0%, rgb(34, 197, 94) 55%, rgb(21, 128, 61) 100%)",
                glow: "0 0 0 3px rgba(34,197,94,0.24), 0 0 26px rgba(34,197,94,0.6)",
            };
    const scoreCircleStyle = {
        borderColor: scoreTone.border,
        background: scoreTone.background,
        boxShadow: scoreTone.glow,
    } as React.CSSProperties;

    useEffect(() => {
        if (!isStorageHydrated) return;
        if (!hasScoreTierHistoryRef.current) {
            prevScoreTierRef.current = scoreTier;
            hasScoreTierHistoryRef.current = true;
            return;
        }

        if (scoreTier === "green" && prevScoreTierRef.current !== "green") {
            spawnConfetti("#22c55e", "huge", 3000);
        }
        prevScoreTierRef.current = scoreTier;
    }, [isStorageHydrated, scoreTier, spawnConfetti]);

    if (!isStorageHydrated) {
        return <div className="min-h-screen bg-black" />;
    }

    return (
        <div className="min-h-screen bg-black text-white px-3.5 pb-3.5 pt-2 sm:px-4 sm:pb-4 sm:pt-2.5 font-sans flex flex-col items-center antialiased select-none">
            {clickRipples.length > 0 && (
                <div className="pointer-events-none fixed inset-0 z-[165] overflow-hidden">
                    {clickRipples.map((ripple) => (
                        <span
                            key={ripple.id}
                            className={ripple.color ? "ui-click-ripple ui-click-ripple-quiz" : "ui-click-ripple"}
                            style={{ left: `${ripple.x}px`, top: `${ripple.y}px`, "--ripple-color": ripple.color } as React.CSSProperties}
                        />
                    ))}
                </div>
            )}

            {/* Top Header */}
            <nav className="relative overflow-visible w-full max-w-5xl flex items-center mt-4 mb-[60px] px-4 py-1.5 bg-[#0a0a0a] rounded-lg border border-white/5 shadow-2xl text-[11px] font-normal">
                {/* Candidate */}
                <div className="flex items-center gap-2 group min-w-0">
                    <UserCheck size={12} className="text-white/90 shrink-0" />
                    <input
                        value={candidate}
                        onChange={(e) => {
                            const next = e.target.value;
                            setCandidate(next);
                            persistState({ candidate: next });
                        }}
                        className="bg-transparent border-none text-[11px] sm:text-xs font-normal text-white outline-none w-[14rem] sm:w-[18rem] focus:text-white transition-colors"
                    />
                </div>

                {/* Time Snap */}
                <div className="mx-auto flex items-center justify-center gap-3 text-[11px] sm:text-xs font-normal text-white whitespace-nowrap text-center">
                    <span className="text-white leading-none">{fullDateDisplay}</span>
                    <span className="flex items-center gap-1.5 text-white leading-none">
                        <Clock size={11} />
                        {currentTimeDisplay}
                    </span>
                </div>

                <div className="ml-auto relative flex items-center shrink-0 pr-[4.25rem] sm:pr-[5.5rem]">
                    <div className="flex items-end gap-0.5 tabular-nums leading-none">
                        <span className="text-sm sm:text-base font-black text-white">{totalStats.earned}</span>
                        <span className="inline-block text-[18px] sm:text-[22px] font-light text-zinc-500 mx-[1px] origin-center scale-y-[1.95] leading-none -translate-y-[1px]">/</span>
                        <span className="text-[10px] sm:text-[11px] font-semibold text-zinc-600 mb-[1px]">{totalStats.total}</span>
                    </div>
                    <div
                        ref={scoreBadgeRef}
                        className="absolute z-20 -top-5 sm:-top-6 -right-1 sm:-right-2 h-16 w-16 sm:h-20 sm:w-20 rounded-full border-[2.5px] flex items-center justify-center"
                        style={scoreCircleStyle}
                        title={`Live score: ${totalStats.pct}%`}>
                        <span className="text-[16px] sm:text-[21px] font-black text-white tabular-nums leading-none">{totalStats.pct}%</span>
                    </div>
                </div>
            </nav>

            {/* Grid */}
            <main className="w-full max-w-5xl mt-2 space-y-1">
                {data.map((cat) => {
                    const Icon = IconMap[cat.icon] || ShieldCheck;
                    const val = scores[cat.id] || 0;
                    const isRowFocused = focusedRowId === cat.id;
                    const rowColor = getCategoryDisplayColor(cat);
                    const rowStripStyle = {
                        backgroundColor: rowColor,
                        backgroundImage: `linear-gradient(145deg, ${withAlpha(rowColor, 0.92)} 0%, ${withAlpha(rowColor, 0.72)} 42%, rgba(0,0,0,0.44) 100%), ${activeRowTextureVariant.overlay}`,
                    } as React.CSSProperties;
                    const rowStyle = {
                        "--hover-color": rowColor,
                        ...(isRowFocused
                            ? {
                                  borderColor: withAlpha(rowColor, 0.4),
                                  boxShadow: `0 0 0 1px ${withAlpha(rowColor, 0.2)}, 0 0 14px -8px ${withAlpha(rowColor, 0.32)}`,
                              }
                            : {}),
                    } as React.CSSProperties;
                    return (
                        <div
                            key={cat.id}
                            className={`score-row group flex bg-[#050505] border border-white/[0.04] rounded-xl overflow-hidden hover:bg-[#080808] transition-all relative cursor-pointer ${isRowFocused ? "bg-[#080808]" : ""}`}
                            style={rowStyle}
                            onMouseEnter={playUiHoverSound}
                            onClick={(e) => {
                                handleInteractiveClick(e);
                                setFocusedRowId(cat.id);
                            }}>
                            <div className="w-48 px-5 py-2 flex items-center gap-3 shrink-0" style={rowStripStyle}>
                                <Icon size={13} className="text-white row-icon-shake" />
                                <h2 className="font-black text-[10px] tracking-tight text-white leading-none">{cat.category}</h2>
                            </div>

                            <div className="flex-1 flex items-center px-5 gap-2 overflow-hidden">
                                {getVisibleItems(cat).map((item, idx) => {
                                    const rubricTopic = resolveRubricTopic(rubricLookup, cat, item);
                                    const topicId = rubricTopic?.id || item;
                                    const topicKey = getTopicEvidenceKey(String(cat.id || cat.category || ""), topicId);
                                    const topicStatus = getTopicKnowledge(topicKey);
                                    const hasYes = topicStatus === "know";
                                    const hasNo = topicStatus === "dont";
                                    const isActiveTopicBadge = activeTopicKey === topicKey;

                                    return (
                                        <button
                                            type="button"
                                            key={idx}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleInteractiveClick(e);
                                                setFocusedRowId(cat.id);
                                                openTopicDetails(cat, item);
                                            }}
                                            onMouseEnter={playUiHoverSound}
                                            style={{
                                                backgroundColor: hasNo ? "rgba(24,24,27,0.96)" : withAlpha(rowColor, 0.08),
                                                borderColor: hasNo ? "rgba(63,63,70,0.92)" : isActiveTopicBadge ? withAlpha(rowColor, 0.8) : withAlpha(rowColor, 0.19),
                                                borderWidth: isActiveTopicBadge ? 2 : 1,
                                                color: hasNo ? "#71717a" : rowColor,
                                                boxShadow: hasNo ? "none" : hasYes ? `0 0 2px ${withAlpha(rowColor, 0.42)}` : isActiveTopicBadge ? `0 0 1px ${withAlpha(rowColor, 0.36)}` : "none",
                                            }}
                                            className="px-3 py-1 rounded text-[10px] font-semibold tracking-tight border whitespace-nowrap cursor-pointer pointer-events-auto transition-colors transition-shadow">
                                            {item}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="relative flex items-center justify-end pl-2 pr-5 py-1">
                                <div className="flex items-center gap-1">
                                    {[1, 2, 3, 4, 5].map((n) => (
                                        <button
                                            key={n}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleInteractiveClick(e);
                                                setFocusedRowId(cat.id);
                                                setScores((p) => {
                                                    const nextScores = { ...p, [cat.id]: n };
                                                    persistState({ scores: nextScores });
                                                    return nextScores;
                                                });
                                            }}
                                            className={`w-7 h-7 text-[11px] font-black flex items-center justify-center transition-all ${val === n ? "text-black rounded-md" : "text-gray-700 hover:text-white"}`}
                                            style={{
                                                backgroundColor: val === n ? withAlpha(rowColor, 0.88) : "transparent",
                                            }}>
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    );
                })}

                <div className="w-full !mt-[60px] mb-[60px] flex flex-col gap-3">
                    <div className="border border-white/5 rounded-2xl bg-[#0a0a0a] px-6 pb-6 pt-3 hover:border-white/20 transition-all flex flex-col">
                        <div className="flex items-start justify-between gap-3 pb-1 mb-2">
                            <div className="min-w-0">
                                <input
                                    value={candidate}
                                    onChange={(e) => {
                                        const next = e.target.value;
                                        setCandidate(next);
                                        persistState({ candidate: next });
                                    }}
                                    placeholder="Candidate"
                                    className="bg-transparent border-none outline-none w-full max-w-[22rem] text-[11px] sm:text-xs font-normal text-white truncate"
                                />
                                <input
                                    value={role}
                                    onChange={(e) => {
                                        const next = e.target.value;
                                        setRole(next);
                                        persistState({ role: next });
                                    }}
                                    placeholder="Applied role"
                                    className="mt-0.5 bg-transparent border-none outline-none w-full max-w-[22rem] text-[11px] sm:text-xs font-normal text-white/55 truncate"
                                />
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsNoteBadgePickerOpen(true);
                                    }}
                                    title="Candidate tags"
                                    aria-label="Candidate tags"
                                    className="w-9 h-9 rounded-lg border border-white/20 text-white/85 hover:border-cyan-300/45 hover:text-cyan-200 hover:bg-cyan-500/12 transition-colors inline-flex items-center justify-center">
                                    <Tag size={13} />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsRubricQaOpen(true);
                                    }}
                                    title="All Q&A"
                                    aria-label="All Q&A"
                                    className="w-9 h-9 rounded-lg border border-white/20 text-white/85 hover:border-violet-300/45 hover:text-violet-200 hover:bg-violet-500/12 transition-colors inline-flex items-center justify-center">
                                    <MessageSquare size={13} />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        cycleRowTextureVariant();
                                    }}
                                    title={`Row texture: ${activeRowTextureVariant.label}`}
                                    aria-label="Cycle row texture"
                                    className="w-9 h-9 rounded-lg border border-white/20 text-white/85 hover:border-amber-300/45 hover:text-amber-200 hover:bg-amber-500/12 transition-colors inline-flex items-center justify-center">
                                    <RotateCcw size={13} />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        handleClearRatings();
                                    }}
                                    title="Clear ratings"
                                    aria-label="Clear ratings"
                                    className="w-9 h-9 rounded-lg border border-white/20 text-white/85 hover:border-rose-300/45 hover:text-rose-200 hover:bg-rose-500/12 transition-colors inline-flex items-center justify-center">
                                    <Trash2 size={13} />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => {
                                        void downloadSnapshot();
                                    }}
                                    title="Download"
                                    aria-label="Download"
                                    className="w-9 h-9 rounded-lg border border-white/20 text-white/85 hover:border-emerald-300/45 hover:text-emerald-200 hover:bg-emerald-500/12 transition-colors inline-flex items-center justify-center">
                                    <Download size={13} />
                                </button>

                                <button
                                    type="button"
                                    onClick={() => { void generateRecruiterSummary(); }}
                                    title="Generate recruiter update"
                                    aria-label="Generate recruiter update"
                                    className="w-9 h-9 rounded-lg border border-sky-400/35 text-sky-300/80 hover:border-sky-300/65 hover:text-sky-200 hover:bg-sky-500/12 transition-colors inline-flex items-center justify-center">
                                    <SendHorizonal size={13} />
                                </button>

                            </div>
                        </div>
                        {selectedNoteBadgeTags.length > 0 && (
                            <div className="mb-3 flex flex-wrap gap-2">
                                {selectedNoteBadgeTags.map((tag) => (
                                    <span key={tag} className="px-2 py-0.5 rounded-md border border-white/35 bg-white/10 text-white text-[9px] font-normal tracking-[0.04em]">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        )}
                        <div className="flex bg-transparent" style={{ height: `${notesEditorHeight}px` }}>
                            <div className="w-9 sm:w-10 mr-2 bg-black/30 border-r border-white/10 text-[9px] font-normal text-white/45 select-none overflow-hidden rounded-sm">
                                <div style={{ transform: `translateY(-${notesScrollTop}px)`, paddingTop: `${notesPaddingTop}px` }}>
                                    {noteLines.map((_, idx) => (
                                        <div
                                            key={`line-${idx}`}
                                            className={`mx-1 rounded-sm border-l text-center transition-colors ${notesActiveLine === idx ? "border-white/90 bg-white/5 text-white" : "border-transparent text-white/45"}`}
                                            style={{ height: `${notesLineHeight}px`, lineHeight: `${notesLineHeight}px` }}>
                                            {idx + 1}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <textarea
                                ref={notesTextareaRef}
                                className="flex-1 bg-transparent border-none outline-none text-[11px] text-gray-300 placeholder:text-gray-700 leading-relaxed font-normal resize-none overflow-y-auto pr-1 scrollbar-hide"
                                style={{ height: `${notesEditorHeight}px` }}
                                placeholder="Log candidate performance details..."
                                value={notes}
                                onChange={(e) => {
                                    const next = e.currentTarget.value;
                                    setNotes(next);
                                    persistState({ notes: next });
                                    updateNotesCursorState(e.currentTarget);
                                }}
                                onClick={(e) => updateNotesCursorState(e.currentTarget)}
                                onKeyUp={(e) => updateNotesCursorState(e.currentTarget)}
                                onFocus={(e) => updateNotesCursorState(e.currentTarget)}
                                onScroll={(e) => handleNotesScroll(e.currentTarget)}
                            />
                        </div>
                    </div>

                </div>
            </main>

            {activeTopic && (
                <div className="fixed inset-0 z-[120] bg-black/90 backdrop-blur-sm flex items-center justify-center p-3 pb-[130px] overflow-y-auto" onClick={() => setActiveTopic(null)}>
                    <div
                        className="w-full max-w-6xl bg-[#0b0b0b] rounded-2xl border-2 p-4 sm:p-5"
                        style={{ borderColor: activeTopic.categoryColor }}
                        onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <div className="text-[9px] tracking-[0.14em] text-white/50">{activeTopic.categoryLabel}</div>
                                <h2 className="text-base font-black tracking-tight mt-0.5" style={{ color: activeTopic.categoryColor }}>
                                    {activeTopic.topicLabel}
                                </h2>
                            </div>
                            <div className="flex items-start gap-2">
                                <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-white/15 bg-black/45">
                                    <span className={`text-sm font-black tabular-nums leading-none ${toolTimerTenths === 0 ? "text-zinc-400" : "text-white"}`}>{toolTimerDisplay}</span>
                                    {toolTimerRunning ? (
                                        <button
                                            type="button"
                                            onClick={pauseToolTimer}
                                            title="Pause timer"
                                            aria-label="Pause timer"
                                            className="w-7 h-7 rounded-md border border-white/20 text-white/90 hover:bg-white/10 transition-colors inline-flex items-center justify-center">
                                            <Pause size={13} />
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={startToolTimer}
                                            title="Start timer"
                                            aria-label="Start timer"
                                            className="w-7 h-7 rounded-md border border-white/20 text-white/90 hover:bg-white/10 transition-colors inline-flex items-center justify-center">
                                            <Play size={13} />
                                        </button>
                                    )}
                                    <button
                                        type="button"
                                        onClick={resetToolTimer}
                                        title="Reset timer"
                                        aria-label="Reset timer"
                                        className="w-7 h-7 rounded-md border border-white/20 text-white/90 hover:bg-white/10 transition-colors inline-flex items-center justify-center">
                                        <RotateCcw size={13} />
                                    </button>
                                </div>
                                <div className="relative">
                                    {isTopicTimerExpired && (
                                        <>
                                            <span className="topic-close-ripple" />
                                            <span className="topic-close-ripple topic-close-ripple-delay" />
                                        </>
                                    )}
                                    <button
                                        type="button"
                                        onClick={() => setActiveTopic(null)}
                                        className={`relative z-10 w-9 h-9 rounded-md border text-white/60 hover:text-white hover:bg-white/10 transition-colors inline-flex items-center justify-center ${
                                            isTopicTimerExpired ? "topic-close-alert border-white/55" : "border-white/15"
                                        }`}>
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-4 rounded-xl border overflow-hidden" style={{ borderColor: withAlpha(activeTopic.categoryColor, 0.44) }}>
                            <div className="relative grid grid-cols-1 sm:grid-cols-[1.42fr_1fr]">
                                <div className="relative px-5 py-5 sm:pr-20" style={{ backgroundColor: withAlpha(activeTopic.categoryColor, 0.92) }}>
                                    <div className="text-[10px] tracking-[0.14em] text-black/70 font-black">Question</div>
                                    <p className="mt-1 font-semibold leading-tight text-black whitespace-normal break-words" style={{ fontSize: "clamp(0.78rem, 1.1vw, 1.05rem)" }}>
                                        {activeTopic.followUp || activeTopic.expectation}
                                    </p>
                                </div>
                                <div className="px-5 py-5 sm:pl-14 bg-black/72 border-t sm:border-t-0 sm:border-l" style={{ borderColor: withAlpha(activeTopic.categoryColor, 0.42) }}>
                                    <div className="text-[8px] tracking-[0.14em] text-white/65 font-black">Expected Answer</div>
                                    <p className="mt-1 text-[11px] leading-relaxed text-white">{activeTopic.expectation}</p>
                                </div>
                                <span
                                    aria-hidden="true"
                                    className="pointer-events-none hidden sm:block absolute left-[58.6%] top-0 h-full w-16 opacity-60"
                                    style={{ background: `linear-gradient(90deg, ${withAlpha(activeTopic.categoryColor, 0.64)} 0%, ${withAlpha(activeTopic.categoryColor, 0.34)} 42%, rgba(0,0,0,0) 100%)`, transform: "skewX(-24deg)", transformOrigin: "top" }}
                                />
                                <span
                                    aria-hidden="true"
                                    className="pointer-events-none hidden sm:block absolute left-[58.6%] top-0 h-full w-[2px] opacity-90"
                                    style={{ backgroundColor: withAlpha(activeTopic.categoryColor, 0.78), transform: "skewX(-24deg)", transformOrigin: "top" }}
                                />
                            </div>
                        </div>

                        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setTopicKnowledgeStatus("know")}
                                className="relative overflow-hidden p-3 rounded-xl border text-left cursor-pointer transition-all"
                                style={{
                                    borderColor: activeTopicKnowledge === "know" ? withAlpha(activeTopic.categoryColor, 0.86) : withAlpha(activeTopic.categoryColor, 0.46),
                                    backgroundColor: activeTopicKnowledge === "know" ? withAlpha(activeTopic.categoryColor, 0.3) : withAlpha(activeTopic.categoryColor, 0.16),
                                    boxShadow: activeTopicKnowledge === "know" ? `0 0 22px -10px ${withAlpha(activeTopic.categoryColor, 0.7)}` : "none",
                                }}>
                                <span
                                    aria-hidden="true"
                                    className="pointer-events-none absolute right-5 bottom-4 text-[10rem] leading-none font-black select-none"
                                    style={{ color: withAlpha(activeTopic.categoryColor, 0.22) }}>
                                    ✓
                                </span>
                                {activeTopic.strongSignals.length ? (
                                    <ul className="relative z-10 overflow-hidden">
                                        {activeTopic.strongSignals.map((signal, idx) => {
                                            const totalSteps = Math.max(1, activeTopic.strongSignals.length - 1);
                                            const step = idx / totalSteps;
                                            const baseStart = Math.max(0.24, 0.62 - step * 0.26);
                                            const baseEnd = Math.max(0.14, 0.42 - step * 0.2);
                                            const glow = Math.max(0.08, 0.34 - step * 0.22);
                                            const divider = Math.max(0.12, 0.36 - step * 0.18);
                                            // Increase darkness by ~10% for each row as it goes down.
                                            const blackDepth = Math.min(0.72, 0.12 + idx * 0.1);
                                            const blackDepthEnd = Math.min(0.82, blackDepth + 0.1);
                                            return (
                                                <li
                                                    key={idx}
                                                    className="px-4 py-3"
                                                    style={{
                                                        background: `linear-gradient(180deg, rgba(0,0,0,${blackDepth}) 0%, rgba(0,0,0,${blackDepthEnd}) 100%), radial-gradient(120% 180% at 50% 50%, ${withAlpha(activeTopic.categoryColor, glow)} 0%, rgba(0,0,0,0) 58%), linear-gradient(90deg, ${withAlpha(activeTopic.categoryColor, baseStart)} 0%, ${withAlpha(activeTopic.categoryColor, baseEnd)} 100%)`,
                                                        borderTop: idx === 0 ? "none" : `1px solid ${withAlpha(activeTopic.categoryColor, divider)}`,
                                                    }}>
                                                    <span className="text-[11px] font-bold leading-snug text-white">{signal}</span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <p className="text-xs text-white/50">No strong rubric configured.</p>
                                )}
                            </button>
                            <button
                                type="button"
                                onClick={() => setTopicKnowledgeStatus("dont")}
                                className="relative overflow-hidden p-3 rounded-xl border text-left cursor-pointer transition-all"
                                style={{
                                    borderColor: activeTopicKnowledge === "dont" ? "rgba(212,212,216,0.72)" : "rgba(82,82,91,0.78)",
                                    backgroundColor: activeTopicKnowledge === "dont" ? "rgba(63,63,70,0.34)" : "rgba(39,39,42,0.4)",
                                    boxShadow: activeTopicKnowledge === "dont" ? "0 0 18px -10px rgba(212,212,216,0.55)" : "none",
                                }}>
                                <span aria-hidden="true" className="pointer-events-none absolute right-5 bottom-4 text-[10rem] leading-none font-black select-none text-zinc-300/20">
                                    ×
                                </span>
                                {activeTopic.redFlags.length ? (
                                    <ul className="space-y-2 relative z-10">
                                        {activeTopic.redFlags.map((flag, idx) => {
                                            return (
                                                <li key={idx} className="rounded-md px-3 py-2 bg-zinc-900/35">
                                                    <span className="text-[11px] font-medium leading-snug text-zinc-100">{flag}</span>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                ) : (
                                    <p className="text-xs text-white/50">No weak rubric configured.</p>
                                )}
                            </button>
                        </div>

                    </div>
                </div>
            )}

            {activeTopic && (
                <div
                    className="quiz-notes-panel fixed bottom-0 left-0 right-0 z-[125] overflow-hidden"
                    style={{
                        backgroundColor: activeTopic.categoryColor,
                        boxShadow: `0 -4px 24px -4px ${withAlpha(activeTopic.categoryColor, 0.4)}`,
                    }}>
                    <button
                        type="button"
                        onClick={() => setQuizNotesOpen((p) => !p)}
                        className="w-full flex items-center justify-between px-6 py-1.5 border-b"
                        style={{ borderColor: "rgba(0,0,0,0.15)", backgroundColor: "rgba(0,0,0,0.1)" }}>
                        <div className="flex items-center gap-2">
                            <FileText size={10} className="text-black/65" />
                            <span className="text-[9px] font-black tracking-[0.14em] text-black/70">NOTES</span>
                            {notes.trim() === "" && <span className="text-[9px] text-black/35 font-normal ml-1">(empty)</span>}
                        </div>
                        <span className="text-black/45 text-[9px]">{quizNotesOpen ? "▾" : "▴"}</span>
                    </button>
                    {quizNotesOpen && (
                        <div className="px-6 py-2">
                            <textarea
                                className="w-full bg-transparent border-none outline-none text-[11px] text-black placeholder:text-black/35 leading-relaxed font-mono resize-none"
                                style={{ height: "88px" }}
                                placeholder="Type your notes here…"
                                value={notes}
                                autoFocus
                                onChange={(e) => {
                                    const next = e.currentTarget.value;
                                    setNotes(next);
                                    persistState({ notes: next });
                                }}
                            />
                        </div>
                    )}
                </div>
            )}

            {isResetConfirmOpen && (
                <div className="fixed inset-0 z-[150] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsResetConfirmOpen(false)}>
                    <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0b0b0b] p-5" onClick={(e) => e.stopPropagation()}>
                        <h3 className="text-sm font-black tracking-[0.14em] text-white mb-2">Reset ratings?</h3>
                        <p className="text-xs text-white/65 leading-relaxed">
                            This will clear all row scores and topic yes/no badge states.
                        </p>
                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setIsResetConfirmOpen(false)}
                                className="px-3 py-2 rounded-lg border border-white/20 text-white/80 hover:bg-white/10 transition-colors text-xs font-black tracking-wide">
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={clearRatings}
                                className="px-3 py-2 rounded-lg border border-red-400/35 text-red-100 bg-red-500/15 hover:bg-red-500/25 transition-colors text-xs font-black tracking-wide">
                                Confirm
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isSummaryOpen && (
                <div className="fixed inset-0 z-[155] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsSummaryOpen(false)}>
                    <div className="w-full max-w-2xl rounded-2xl border border-sky-400/25 bg-[#0b0b0b] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/8 bg-sky-500/8">
                            <div className="flex items-center gap-3">
                                <SendHorizonal size={13} className="text-sky-300" />
                                <span className="text-[11px] font-black tracking-[0.14em] text-sky-200">PROMPT — paste into ChatGPT</span>
                                {summaryText && (
                                    <span className="text-[10px] text-white/35 font-mono">
                                        ~{summaryText.split(/\s+/).filter(Boolean).length} words · ~{Math.ceil(summaryText.length / 4)} tokens
                                    </span>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsSummaryOpen(false)}
                                className="w-7 h-7 rounded-md border border-white/15 text-white/50 hover:text-white hover:bg-white/10 transition-colors inline-flex items-center justify-center">
                                <X size={14} />
                            </button>
                        </div>
                        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto">
                            <pre className="text-[11px] text-white/80 leading-relaxed font-mono whitespace-pre-wrap">{summaryText}</pre>
                        </div>
                        {summaryText && (
                            <div className="px-5 pb-4 pt-2 border-t border-white/6 flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        void navigator.clipboard.writeText(summaryText);
                                        setSummaryCopied(true);
                                        setTimeout(() => setSummaryCopied(false), 2000);
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-sky-400/30 text-sky-300 hover:bg-sky-500/12 transition-colors text-xs font-medium">
                                    {summaryCopied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                                    {summaryCopied ? "Copied!" : "Copy prompt"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {isRubricQaOpen && (
                <div className="fixed inset-0 z-[160] bg-black/88 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsRubricQaOpen(false)}>
                    <div className="w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0b0b0b]" onClick={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 z-10 px-5 sm:px-6 py-4 border-b border-white/10 bg-[#0b0b0b]/95 backdrop-blur">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-sm sm:text-base font-black tracking-[0.16em] text-white">Rubric Q&A</h3>
                                    <p className="text-[11px] text-white/55 mt-1">All interview questions, expected answers, and strong signals from data.json</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsRubricQaOpen(false)}
                                    className="w-9 h-9 rounded-md border border-white/15 text-white/65 hover:text-white hover:bg-white/10 transition-colors inline-flex items-center justify-center">
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="px-5 sm:px-6 pb-6 pt-4 space-y-4">
                            {rubricQaGroups.map((group) => (
                                <section
                                    key={group.id}
                                    className="relative overflow-hidden rounded-2xl border p-4 sm:p-5"
                                    style={{
                                        borderColor: withAlpha(group.color, 0.26),
                                        backgroundColor: "rgba(9,9,11,0.94)",
                                    }}>
                                    <span
                                        aria-hidden="true"
                                        className="pointer-events-none absolute inset-0 opacity-75"
                                        style={{
                                            backgroundImage: `linear-gradient(145deg, ${withAlpha(group.color, 0.16)} 0%, rgba(0,0,0,0.54) 44%, rgba(0,0,0,0.76) 100%), repeating-linear-gradient(135deg, ${withAlpha(group.color, 0.1)} 0px, ${withAlpha(group.color, 0.1)} 1px, transparent 1px, transparent 16px)`,
                                        }}
                                    />
                                    <div className="relative z-10">
                                    <div className="text-[10px] font-black tracking-[0.18em]" style={{ color: withAlpha(group.color, 0.86) }}>
                                        {group.label}
                                    </div>
                                    <div className="mt-3 space-y-3">
                                        {group.topics.map((topic) => (
                                            <article
                                                key={`${group.id}-${topic.id}`}
                                                className="rounded-xl bg-black/58 p-3 sm:p-4"
                                                style={{ boxShadow: `inset 0 0 0 1px ${withAlpha(topic.color, 0.2)}` }}>
                                                <div className="text-xs font-black tracking-wide mb-2" style={{ color: topic.color }}>
                                                    {topic.label}
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-[1.35fr_1fr] gap-2 sm:gap-3">
                                                    <div className="rounded-lg p-3 sm:p-3.5" style={{ backgroundColor: withAlpha(topic.color, 0.2) }}>
                                                        <div className="text-[10px] tracking-[0.14em] text-white/55 mb-2">Question</div>
                                                        <p className="text-xs sm:text-sm leading-relaxed text-white">{topic.question}</p>
                                                    </div>
                                                    <div className="rounded-lg p-3 sm:p-3.5 bg-black/52">
                                                        <div className="text-[10px] tracking-[0.14em] text-white/55 mb-2">Expected Answer</div>
                                                        <p className="text-xs sm:text-sm leading-relaxed text-white/90">{topic.answer}</p>
                                                    </div>
                                                </div>
                                                {topic.strongSignals.length > 0 && (
                                                    <div className="mt-2 rounded-lg p-3 sm:p-3.5" style={{ background: `linear-gradient(180deg, ${withAlpha(topic.color, 0.24)} 0%, ${withAlpha(topic.color, 0.12)} 100%)` }}>
                                                        <div className="text-[10px] tracking-[0.14em] text-white/70 mb-1.5">Strong Signals</div>
                                                        <ul className="space-y-1">
                                                            {topic.strongSignals.slice(0, 4).map((signal, idx) => (
                                                                <li key={`${topic.id}-strong-${idx}`} className="text-xs sm:text-sm leading-relaxed text-white">
                                                                    <span className="text-white/65 mr-2">{idx + 1}.</span>
                                                                    {signal}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                        {topic.strongSignals.length > 4 && (
                                                            <p className="mt-1.5 text-[11px] text-white/60">+{topic.strongSignals.length - 4} more strong signals in rubric</p>
                                                        )}
                                                    </div>
                                                )}
                                            </article>
                                        ))}
                                    </div>
                                    </div>
                                </section>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {isNoteBadgePickerOpen && (
                <div className="fixed inset-0 z-[158] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setIsNoteBadgePickerOpen(false)}>
                    <div className="w-full max-w-3xl max-h-[88vh] overflow-y-auto rounded-2xl border border-white/15 bg-[#0b0b0b]" onClick={(e) => e.stopPropagation()}>
                        <div className="sticky top-0 z-10 px-5 sm:px-6 py-4 border-b border-white/10 bg-[#0b0b0b]/95 backdrop-blur">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-sm sm:text-base font-black tracking-[0.16em] text-white">Candidate tags</h3>
                                    <p className="text-[11px] text-white/55 mt-1">Select values to show as white badges in note details.</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setIsNoteBadgePickerOpen(false)}
                                    className="w-9 h-9 rounded-md border border-white/15 text-white/65 hover:text-white hover:bg-white/10 transition-colors inline-flex items-center justify-center">
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="px-5 sm:px-6 pb-6 pt-4 space-y-3">
                            {NOTE_BADGE_FIELDS.map((field) => (
                                <section key={field.id} className="rounded-xl border border-white/10 bg-black/35 p-3">
                                    <div className="text-[10px] font-normal tracking-[0.16em] text-white/60">{field.label}</div>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {field.options.map((option) => {
                                            const isSelected = selectedNoteBadges[field.id] === option;
                                            return (
                                                <button
                                                    key={`${field.id}-${option}`}
                                                    type="button"
                                                    onClick={() => toggleNoteBadge(field.id, option)}
                                                    className={`px-2.5 py-1 rounded-md border text-[10px] font-normal tracking-wide transition-colors ${
                                                        isSelected ? "bg-white text-black border-white" : "bg-white/5 text-white border-white/35 hover:bg-white/12"
                                                    }`}>
                                                    {formatBadgeOptionLabel(field.id, option)}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {confettiBursts.length > 0 && (
                <div className="pointer-events-none fixed inset-0 z-[170] overflow-hidden">
                    {confettiBursts.map((burst) =>
                        burst.pieces.map((piece) => {
                            const s = piece.size;
                            const baseStyle = {
                                left: `${burst.x}px`,
                                top: `${burst.y}px`,
                                animationDuration: `${piece.duration}ms`,
                                animationDelay: `${piece.delay}ms`,
                                "--confetti-x": `${piece.dx}px`,
                                "--confetti-y": `${piece.dy}px`,
                                "--confetti-r": `${piece.rotate}deg`,
                                "--confetti-glow": piece.color,
                            } as React.CSSProperties;
                            if (piece.shape === "heart") {
                                return (
                                    <span
                                        key={`${burst.id}-${piece.id}`}
                                        className="confetti-piece"
                                        style={{
                                            ...baseStyle,
                                            fontSize: `${s * 1.7}px`,
                                            lineHeight: "1",
                                            color: piece.color,
                                            textShadow: `0 0 10px ${piece.color}`,
                                            boxShadow: "none",
                                            backgroundColor: "transparent",
                                        }}>♥</span>
                                );
                            }
                            const shapeStyle: React.CSSProperties =
                                piece.shape === "circle"  ? { width: `${s}px`, height: `${s}px`, borderRadius: "50%" } :
                                piece.shape === "star"    ? { width: `${s * 1.5}px`, height: `${s * 1.5}px`, clipPath: "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)" } :
                                piece.shape === "ribbon"  ? { width: `${Math.max(3, Math.round(s * 0.22))}px`, height: `${s * 3.5}px`, borderRadius: "3px" } :
                                piece.shape === "diamond" ? { width: `${s}px`, height: `${s}px`, clipPath: "polygon(50% 0%,100% 50%,50% 100%,0% 50%)" } :
                                                            { width: `${s}px`, height: `${Math.max(4, Math.round(s * 0.55))}px`, borderRadius: "2px" };
                            return (
                                <span
                                    key={`${burst.id}-${piece.id}`}
                                    className="confetti-piece"
                                    style={{ ...baseStyle, ...shapeStyle, backgroundColor: piece.color }}
                                />
                            );
                        }),
                    )}
                </div>
            )}

            <style jsx global>{`
                .score-row:hover {
                    border-color: var(--hover-color) !important;
                    box-shadow: 0 0 15px -8px var(--hover-color);
                }
                .score-row:hover .row-icon-shake {
                    animation: row-icon-shake 0.45s ease-in-out;
                }
                @keyframes row-icon-shake {
                    0%,
                    100% {
                        transform: translateX(0) rotate(0deg);
                    }
                    25% {
                        transform: translateX(-2px) rotate(-8deg);
                    }
                    50% {
                        transform: translateX(2px) rotate(7deg);
                    }
                    75% {
                        transform: translateX(-1px) rotate(-5deg);
                    }
                }
                .confetti-piece {
                    position: fixed;
                    opacity: 0;
                    transform: translate3d(0, 0, 0) rotate(0deg);
                    box-shadow: 0 0 14px 3px var(--confetti-glow, rgba(52,211,153,0.55));
                    animation-name: confetti-burst;
                    animation-timing-function: cubic-bezier(0.08, 0.92, 0.26, 1);
                    animation-fill-mode: forwards;
                    will-change: transform, opacity;
                }
                @keyframes confetti-burst {
                    0% {
                        opacity: 0;
                        transform: translate3d(0, 0, 0) scale(0.5) rotate(0deg);
                    }
                    8% {
                        opacity: 1;
                        transform: translate3d(
                            calc(var(--confetti-x) * 0.06),
                            calc(var(--confetti-y) * 0.06),
                            0
                        ) scale(1.15) rotate(calc(var(--confetti-r) * 0.04));
                    }
                    70% {
                        opacity: 0.85;
                    }
                    100% {
                        opacity: 0;
                        transform: translate3d(var(--confetti-x), var(--confetti-y), 0) scale(0.6) rotate(var(--confetti-r));
                    }
                }
                .ui-click-ripple {
                    position: fixed;
                    width: 28px;
                    height: 28px;
                    border-radius: 9999px;
                    border: 1.5px solid rgba(255, 255, 255, 0.65);
                    background: rgba(255, 255, 255, 0.09);
                    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15), 0 0 18px 2px rgba(255,255,255,0.08);
                    transform: translate(-50%, -50%) scale(0.22);
                    opacity: 0;
                    animation: ui-click-ripple-burst 680ms cubic-bezier(0.12, 1, 0.26, 1) forwards;
                }
                @keyframes ui-click-ripple-burst {
                    0% {
                        opacity: 0.7;
                        transform: translate(-50%, -50%) scale(0.22);
                    }
                    100% {
                        opacity: 0;
                        transform: translate(-50%, -50%) scale(16);
                    }
                }
                .ui-click-ripple-quiz {
                    width: 44px;
                    height: 44px;
                    border-color: var(--ripple-color, rgba(255,255,255,0.65));
                    border-width: 2px;
                    background: transparent;
                    box-shadow: 0 0 0 1px color-mix(in srgb, var(--ripple-color, white) 30%, transparent), 0 0 28px 4px color-mix(in srgb, var(--ripple-color, white) 22%, transparent);
                    animation-duration: 820ms;
                    animation-name: ui-click-ripple-burst-quiz;
                }
                @keyframes ui-click-ripple-burst-quiz {
                    0% {
                        opacity: 0.85;
                        transform: translate(-50%, -50%) scale(0.18);
                    }
                    100% {
                        opacity: 0;
                        transform: translate(-50%, -50%) scale(22);
                    }
                }
                .topic-close-alert {
                    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.35), 0 0 14px rgba(255, 255, 255, 0.22);
                    animation: topic-close-shake 0.82s ease-in-out infinite;
                }
                .topic-close-ripple {
                    position: absolute;
                    inset: -6px;
                    border-radius: 11px;
                    border: 1px solid rgba(255, 255, 255, 0.5);
                    opacity: 0;
                    pointer-events: none;
                    animation: topic-close-ripple 1.2s ease-out infinite;
                }
                .topic-close-ripple-delay {
                    animation-delay: 0.56s;
                }
                @keyframes topic-close-ripple {
                    0% {
                        opacity: 0.75;
                        transform: scale(0.88);
                    }
                    100% {
                        opacity: 0;
                        transform: scale(1.35);
                    }
                }
                @keyframes topic-close-shake {
                    0%,
                    100% {
                        transform: translateX(0);
                    }
                    25% {
                        transform: translateX(-1px);
                    }
                    50% {
                        transform: translateX(1px);
                    }
                    75% {
                        transform: translateX(-1px);
                    }
                }
                ::-webkit-scrollbar {
                    width: 0px;
                    background: transparent;
                }
            `}</style>
        </div>
    );
}
