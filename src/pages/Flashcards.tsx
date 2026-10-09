import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowLeft,
  CheckCircle,
  Download,
  Edit3,
  FileUp,
  Image as ImageIcon,
  Layers,
  Loader2,
  Plus,
  RotateCw,
  Search,
  Shuffle,
  Sparkles,
  Trash2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { cn } from "@/src/lib/utils";
import { useAuth } from "@/src/contexts/AuthContext";
import { trackUserEvent } from "@/src/lib/analytics";
import {
  buildXpAwardPatch,
  NOVIQ_XP,
  persistXpAwards,
} from "@/src/lib/progress";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { isReadOnlyAudit } from "@/src/lib/auditMode";
import { db, storage } from "@/src/lib/firebase";
import ReactMarkdown from "react-markdown";
import { getAppErrorMessage } from "@/src/lib/errors";
import {
  isLocalId,
  loadLocalData,
  makeSyncId,
  saveLocalData,
} from "@/src/lib/localStore";
import { useBodyScrollLock } from "@/src/lib/useBodyScrollLock";
import { useDialogFocus } from "@/src/lib/useDialogFocus";
import { writeDocWithQueue, type SyncStatus } from "@/src/lib/offlineSync";

interface Deck {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  syncStatus?: SyncStatus;
}

interface CardItem {
  id: string;
  deckId: string;
  front: string;
  back: string;
  imageUrl?: string;
  dueAt: string;
  interval: number;
  easeFactor: number;
  repetition: number;
  lapses: number;
  reviewCount: number;
  createdAt?: unknown;
  updatedAt?: unknown;
  syncStatus?: SyncStatus;
}

type Grade = "hard" | "medium" | "easy";

const colors = [
  "bg-blue-500",
  "bg-cyan-500",
  "bg-emerald-500",
  "bg-violet-500",
  "bg-rose-500",
];

const emptyCardForm = {
  id: "",
  front: "",
  back: "",
  imageUrl: "",
};

const todayIso = () => new Date().toISOString();

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
};

const isDue = (card: CardItem) => new Date(card.dueAt).getTime() <= Date.now();

const shuffleCards = (cards: CardItem[]) => {
  const copy = [...cards];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[randomIndex]] = [copy[randomIndex], copy[index]];
  }
  return copy;
};

const mergeLocalRemote = <T extends { id: string }>(
  current: T[],
  remote: T[],
) => {
  const pendingLocal = current.filter(
    (item) =>
      isLocalId(item.id) ||
      ((item as { syncStatus?: SyncStatus }).syncStatus || "synced") !==
        "synced",
  );
  return [
    ...pendingLocal,
    ...remote.filter(
      (item) => !pendingLocal.some((local) => local.id === item.id),
    ),
  ];
};

const nextSchedule = (card: CardItem, grade: Grade) => {
  const currentEase = card.easeFactor || 2.5;
  const currentInterval = card.interval || 0;
  const repetition = card.repetition || 0;

  if (grade === "hard") {
    const interval = Math.max(
      1,
      Math.round(Math.max(1, currentInterval) * 1.2),
    );
    return {
      interval,
      easeFactor: Math.max(1.3, currentEase - 0.18),
      repetition: Math.max(1, repetition),
      lapses: (card.lapses || 0) + 1,
      dueAt: addDays(interval),
    };
  }

  if (grade === "medium") {
    const nextRepetition = repetition + 1;
    const interval =
      nextRepetition === 1
        ? 1
        : Math.max(2, Math.round(Math.max(1, currentInterval) * currentEase));
    return {
      interval,
      easeFactor: currentEase,
      repetition: nextRepetition,
      lapses: card.lapses || 0,
      dueAt: addDays(interval),
    };
  }

  const nextRepetition = repetition + 1;
  const nextEase = Math.min(3.2, currentEase + 0.15);
  const interval =
    nextRepetition === 1
      ? 3
      : Math.max(
          4,
          Math.round(Math.max(1, currentInterval) * (nextEase + 0.35)),
        );

  return {
    interval,
    easeFactor: nextEase,
    repetition: nextRepetition,
    lapses: card.lapses || 0,
    dueAt: addDays(interval),
  };
};

const parseImportedCards = (text: string) => {
  try {
    const parsed = JSON.parse(text);
    const rawCards = Array.isArray(parsed) ? parsed : parsed.cards;
    if (Array.isArray(rawCards)) {
      return rawCards
        .map((card) => ({
          front: String(card.front || card.question || "").trim(),
          back: String(card.back || card.answer || "").trim(),
        }))
        .filter((card) => card.front && card.back);
    }
  } catch {
    // Fall through to CSV/TSV parsing.
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const delimiter = line.includes("\t") ? "\t" : ",";
      const [front, ...rest] = line.split(delimiter);
      return { front: front?.trim() || "", back: rest.join(delimiter).trim() };
    })
    .filter((card) => card.front && card.back);
};

export const Flashcards = () => {
  const { user, profile, updateLocalProfile } = useAuth();
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cardsByDeck, setCardsByDeck] = useState<Record<string, CardItem[]>>(
    {},
  );
  const [selectedDeckId, setSelectedDeckId] = useState("");
  const [showDeckModal, setShowDeckModal] = useState(false);
  const [deckForm, setDeckForm] = useState({
    title: "",
    description: "",
    icon: "Layers",
  });
  const [cardForm, setCardForm] = useState(emptyCardForm);
  const [cardImageFile, setCardImageFile] = useState<File | null>(null);
  const [editingCardId, setEditingCardId] = useState("");
  const [search, setSearch] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const saveRequestRef = useRef(false);
  const [status, setStatus] = useState("");
  const [practiceOpen, setPracticeOpen] = useState(false);
  useBodyScrollLock(showDeckModal || practiceOpen);
  const [practiceQueue, setPracticeQueue] = useState<CardItem[]>([]);
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const gradeRequestRef = useRef(false);
  const lastGradedCardRef = useRef<string | null>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [shuffleMode, setShuffleMode] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);
  const [cacheReady, setCacheReady] = useState({ decks: false, cards: false });
  const [cloudSyncBlocked, setCloudSyncBlocked] = useState(false);
  const loadedCardDecksRef = useRef<Set<string>>(new Set());

  const importInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const deckDialogRef = useRef<HTMLDivElement>(null);
  const practiceDialogRef = useRef<HTMLDivElement>(null);
  useDialogFocus(showDeckModal, deckDialogRef, () => setShowDeckModal(false));
  useDialogFocus(practiceOpen, practiceDialogRef, () => setPracticeOpen(false));

  const selectedDeck = useMemo(
    () => decks.find((deck) => deck.id === selectedDeckId) || null,
    [decks, selectedDeckId],
  );

  const selectedCards = selectedDeck ? cardsByDeck[selectedDeck.id] || [] : [];
  const dueCards = selectedCards.filter(isDue);
  const filteredCards = selectedCards.filter(
    (card) =>
      card.front.toLowerCase().includes(search.toLowerCase()) ||
      card.back.toLowerCase().includes(search.toLowerCase()),
  );
  const currentPracticeCard = practiceQueue[practiceIndex] || null;
  const decksKey = user ? `noviq:${user.uid}:decks` : "";
  const cardsKey = user ? `noviq:${user.uid}:cardsByDeck` : "";

  useEffect(() => {
    if (!user) return;
    loadedCardDecksRef.current = new Set();
    setCacheReady({ decks: false, cards: false });
    setDecks([]);
    setCardsByDeck({});
    setSelectedDeckId("");
  }, [cardsKey, decksKey, user]);

  useEffect(() => {
    if (!user || !cacheReady.decks) return;
    saveLocalData(decksKey, decks);
  }, [cacheReady.decks, decks, decksKey, user]);

  useEffect(() => {
    if (!user || !cacheReady.cards) return;
    saveLocalData(cardsKey, cardsByDeck);
  }, [cacheReady.cards, cardsByDeck, cardsKey, user]);

  useEffect(() => {
    if (!user) return undefined;

    const deckQuery = query(
      collection(db, "users", user.uid, "decks"),
      orderBy("updatedAt", "desc"),
    );
    return onSnapshot(
      deckQuery,
      (snapshot) => {
        const remoteDecks = snapshot.docs.map((document) => ({
          id: document.id,
          ...document.data(),
        })) as Deck[];
        setCloudSyncBlocked(false);
        setDecks((current) => mergeLocalRemote(current, remoteDecks));
        setCacheReady((current) => ({
          ...current,
          decks: true,
          cards: remoteDecks.length === 0 ? true : current.cards,
        }));

        if (!selectedDeckId && remoteDecks[0]) {
          setSelectedDeckId(remoteDecks[0].id);
        }
      },
      (error) => {
        console.warn(getAppErrorMessage(error));
        setCloudSyncBlocked(true);
        const localDecks = loadLocalData<Deck[]>(decksKey, []);
        const localCards = loadLocalData<Record<string, CardItem[]>>(
          cardsKey,
          {},
        );
        setDecks(localDecks);
        setCardsByDeck(localCards);
        setSelectedDeckId((current) => current || localDecks[0]?.id || "");
        setCacheReady({ decks: true, cards: true });
      },
    );
  }, [cardsKey, decksKey, selectedDeckId, user]);

  useEffect(() => {
    if (!user || decks.length === 0) return undefined;

    const unsubscribers = decks.map((deck) => {
      if (isLocalId(deck.id)) return () => undefined;

      const cardQuery = query(
        collection(db, "users", user.uid, "decks", deck.id, "cards"),
        orderBy("updatedAt", "desc"),
      );

      return onSnapshot(
        cardQuery,
        (snapshot) => {
          setCardsByDeck((current) => {
            const remoteCards = snapshot.docs.map((document) => ({
              id: document.id,
              deckId: deck.id,
              ...document.data(),
            })) as CardItem[];

            return {
              ...current,
              [deck.id]: mergeLocalRemote(current[deck.id] || [], remoteCards),
            };
          });
          loadedCardDecksRef.current.add(deck.id);
          const cloudDeckCount = decks.filter(
            (item) => !isLocalId(item.id),
          ).length;
          if (loadedCardDecksRef.current.size >= cloudDeckCount) {
            setCacheReady((current) => ({ ...current, cards: true }));
          }
        },
        (error) => {
          console.warn(getAppErrorMessage(error));
          setCloudSyncBlocked(true);
          setCardsByDeck(
            loadLocalData<Record<string, CardItem[]>>(cardsKey, {}),
          );
          setCacheReady((current) => ({ ...current, cards: true }));
        },
      );
    });

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [cardsKey, decks, user]);

  useEffect(() => {
    if (!practiceOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === " ") {
        event.preventDefault();
        setIsFlipped((current) => !current);
        return;
      }

      if (!isFlipped) return;
      if (event.key === "1") gradeCurrentCard("hard");
      if (event.key === "2") gradeCurrentCard("medium");
      if (event.key === "3") gradeCurrentCard("easy");
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFlipped, practiceOpen, practiceIndex, practiceQueue]);

  const deckCards = (deckId: string) => cardsByDeck[deckId] || [];

  const handleCreateDeck = async () => {
    if (!user || !deckForm.title.trim() || saveRequestRef.current) return;
    if (isReadOnlyAudit) { setStatus("Saving is disabled in read-only audit mode."); return; }
    saveRequestRef.current = true;

    setIsSaving(true);
    setStatus("");
    const localDeck: Deck = {
      id: makeSyncId("deck"),
      title: deckForm.title.trim(),
      description: deckForm.description.trim(),
      icon: deckForm.icon || "Layers",
      color: colors[decks.length % colors.length],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      syncStatus: "pending",
    };
    setDecks((current) => [localDeck, ...current]);
    setCardsByDeck((current) => ({ ...current, [localDeck.id]: [] }));
    setSelectedDeckId(localDeck.id);
    setDeckForm({ title: "", description: "", icon: "Layers" });
    setShowDeckModal(false);

    try {
      const syncStatus = await writeDocWithQueue({
        userId: user.uid,
        path: ["users", user.uid, "decks", localDeck.id],
        data: {
          title: localDeck.title,
          description: localDeck.description,
          icon: localDeck.icon,
          color: localDeck.color,
          createdAt: localDeck.createdAt,
          updatedAt: localDeck.updatedAt,
        },
        merge: true,
      });
      setDecks((current) =>
        current.map((deck) =>
          deck.id === localDeck.id ? { ...deck, syncStatus } : deck,
        ),
      );
      setCloudSyncBlocked(false);
      trackUserEvent(user.uid, "deck_created", 0, { decksCreated: 1 }).catch(
        () => undefined,
      );
    } catch (error) {
      console.warn(getAppErrorMessage(error));
      setCloudSyncBlocked(true);
      setStatus(
        "Deck created on this device. Cloud sync is waiting for Firebase rules.",
      );
    } finally {
      saveRequestRef.current = false;
      setIsSaving(false);
    }
  };

  const handleDeleteDeck = async (deck: Deck) => {
    if (!user) return;
    const confirmed = window.confirm(`Delete "${deck.title}" and all cards?`);
    if (!confirmed) return;

    setIsSaving(true);
    setStatus("");
    setDecks((current) => current.filter((item) => item.id !== deck.id));
    setCardsByDeck((current) => {
      const { [deck.id]: _removed, ...rest } = current;
      return rest;
    });
    setSelectedDeckId(decks.find((item) => item.id !== deck.id)?.id || "");

    try {
      await Promise.all(
        deckCards(deck.id).map((card) =>
          writeDocWithQueue({
            userId: user.uid,
            path: ["users", user.uid, "decks", deck.id, "cards", card.id],
            kind: "delete",
          }),
        ),
      );
      await writeDocWithQueue({
        userId: user.uid,
        path: ["users", user.uid, "decks", deck.id],
        kind: "delete",
      });
      setCloudSyncBlocked(false);
    } catch (error) {
      console.warn(getAppErrorMessage(error));
      setCloudSyncBlocked(true);
    } finally {
      setIsSaving(false);
    }
  };

  const uploadCardImage = async (
    deckId: string,
    cardId: string,
    file: File,
  ) => {
    if (isReadOnlyAudit) throw new Error("Uploads are disabled in read-only audit mode.");
    if (!user) return "";
    const imageRef = ref(
      storage,
      `users/${user.uid}/flashcards/${deckId}/${cardId}-${file.name}`,
    );
    await uploadBytes(imageRef, file);
    return getDownloadURL(imageRef);
  };

  const resetCardForm = () => {
    setCardForm(emptyCardForm);
    setCardImageFile(null);
    setEditingCardId("");
    setPreviewMode(false);
  };

  const handleSaveCard = async () => {
    if (
      !user ||
      !selectedDeck ||
      !cardForm.front.trim() ||
      !cardForm.back.trim() || saveRequestRef.current
    )
      return;

    if (isReadOnlyAudit) { setStatus("Saving is disabled in read-only audit mode."); return; }
    saveRequestRef.current = true;

    setIsSaving(true);
    setStatus("");
    const existingId = editingCardId || makeSyncId("card");
    const previousCard = editingCardId ? deckCards(selectedDeck.id).find((card) => card.id === editingCardId) : undefined;
    const localCard: CardItem = {
      id: existingId,
      deckId: selectedDeck.id,
      front: cardForm.front.trim(),
      back: cardForm.back.trim(),
      imageUrl: cardForm.imageUrl,
      dueAt: previousCard?.dueAt ?? todayIso(),
      interval: previousCard?.interval ?? 0,
      easeFactor: previousCard?.easeFactor ?? 2.5,
      repetition: previousCard?.repetition ?? 0,
      lapses: previousCard?.lapses ?? 0,
      reviewCount: previousCard?.reviewCount ?? 0,
      updatedAt: new Date().toISOString(),
      syncStatus: "pending",
    };
    setCardsByDeck((current) => {
      const deckCards = current[selectedDeck.id] || [];
      return {
        ...current,
        [selectedDeck.id]: editingCardId
          ? deckCards.map((card) =>
              card.id === editingCardId ? { ...card, ...localCard } : card,
            )
          : [localCard, ...deckCards],
      };
    });

    try {
      if (editingCardId) {
        let imageUrl = cardForm.imageUrl;
        if (!isLocalId(selectedDeck.id) && cardImageFile)
          imageUrl = await uploadCardImage(
            selectedDeck.id,
            editingCardId,
            cardImageFile,
          );

        const syncStatus = await writeDocWithQueue({
          userId: user.uid,
          path: [
            "users",
            user.uid,
            "decks",
            selectedDeck.id,
            "cards",
            editingCardId,
          ],
          data: {
            front: cardForm.front.trim(),
            back: cardForm.back.trim(),
            imageUrl,
            updatedAt: new Date().toISOString(),
          },
          merge: true,
        });
        setCardsByDeck((current) => ({
          ...current,
          [selectedDeck.id]: (current[selectedDeck.id] || []).map((card) =>
            card.id === editingCardId
              ? { ...card, imageUrl, syncStatus }
              : card,
          ),
        }));
      } else {
        let imageUrl = "";
        if (!isLocalId(selectedDeck.id) && cardImageFile) {
          imageUrl = await uploadCardImage(
            selectedDeck.id,
            existingId,
            cardImageFile,
          );
        }
        const syncStatus = await writeDocWithQueue({
          userId: user.uid,
          path: [
            "users",
            user.uid,
            "decks",
            selectedDeck.id,
            "cards",
            existingId,
          ],
          data: {
            front: cardForm.front.trim(),
            back: cardForm.back.trim(),
            imageUrl,
            dueAt: todayIso(),
            interval: 0,
            easeFactor: 2.5,
            repetition: 0,
            lapses: 0,
            reviewCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          merge: true,
        });

        trackUserEvent(user.uid, "flashcard_created", 0, {
          cardsCreated: 1,
        }).catch(() => undefined);
        setCardsByDeck((current) => ({
          ...current,
          [selectedDeck.id]: (current[selectedDeck.id] || []).map((card) =>
            card.id === existingId ? { ...card, imageUrl, syncStatus } : card,
          ),
        }));
      }

      await writeDocWithQueue({
        userId: user.uid,
        path: ["users", user.uid, "decks", selectedDeck.id],
        data: {
          updatedAt: new Date().toISOString(),
        },
        merge: true,
      });
      resetCardForm();
      setCloudSyncBlocked(false);
    } catch (error) {
      console.warn(getAppErrorMessage(error));
      setCloudSyncBlocked(true);
      setStatus(
        "Card saved on this device. Cloud sync is waiting for Firebase rules.",
      );
      resetCardForm();
    } finally {
      saveRequestRef.current = false;
      setIsSaving(false);
    }
  };

  const handleEditCard = (card: CardItem) => {
    setEditingCardId(card.id);
    setCardForm({
      id: card.id,
      front: card.front,
      back: card.back,
      imageUrl: card.imageUrl || "",
    });
    setCardImageFile(null);
    setPreviewMode(false);
  };

  const handleDeleteCard = async (card: CardItem) => {
    if (!user || !selectedDeck) return;
    const confirmed = window.confirm("Delete this card?");
    if (!confirmed) return;

    setCardsByDeck((current) => ({
      ...current,
      [selectedDeck.id]: (current[selectedDeck.id] || []).filter(
        (item) => item.id !== card.id,
      ),
    }));

    try {
      await writeDocWithQueue({
        userId: user.uid,
        path: ["users", user.uid, "decks", selectedDeck.id, "cards", card.id],
        kind: "delete",
      });
    } catch (error) {
      console.warn(getAppErrorMessage(error));
      setCloudSyncBlocked(true);
    }
  };

  const handleImportCards = async (file: File) => {
    if (!user || !selectedDeck) return;
    setIsSaving(true);
    setStatus("");

    try {
      const lower = file.name.toLowerCase();
      let text = "";

      if (lower.endsWith(".docx")) {
        // Use mammoth to extract text from DOCX
        try {
          const mammoth: any = await import("mammoth");
          const arrayBuffer = await file.arrayBuffer();
          // prefer extractRawText if available
          if (typeof mammoth.extractRawText === "function") {
            const result = await mammoth.extractRawText({ arrayBuffer });
            text = result?.value || "";
          } else if (typeof mammoth.convertToHtml === "function") {
            const result = await mammoth.convertToHtml({ arrayBuffer });
            text = (result?.value || "").replace(/<[^>]+>/g, " ");
          }
        } catch (e) {
          console.warn("DOCX parsing failed", e);
          setStatus(
            "Could not parse DOCX file in-browser. Try converting to TXT/CSV or use the Notebook import path.",
          );
          setIsSaving(false);
          return;
        }
      } else {
        text = await file.text();
      }

      const importedCards = parseImportedCards(text);

      if (!importedCards.length) {
        setStatus(
          "No valid cards found. Use JSON or CSV/TSV with front and back columns.",
        );
        return;
      }

      const localCards = importedCards.map((card) => ({
        id: makeSyncId("card"),
        deckId: selectedDeck.id,
        front: card.front,
        back: card.back,
        imageUrl: "",
        dueAt: todayIso(),
        interval: 0,
        easeFactor: 2.5,
        repetition: 0,
        lapses: 0,
        reviewCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        syncStatus: "pending" as SyncStatus,
      }));
      setCardsByDeck((current) => ({
        ...current,
        [selectedDeck.id]: [...localCards, ...(current[selectedDeck.id] || [])],
      }));

      await Promise.all(
        localCards.map((card) =>
          writeDocWithQueue({
            userId: user.uid,
            path: [
              "users",
              user.uid,
              "decks",
              selectedDeck.id,
              "cards",
              card.id,
            ],
            data: {
              front: card.front,
              back: card.back,
              imageUrl: "",
              dueAt: todayIso(),
              interval: 0,
              easeFactor: 2.5,
              repetition: 0,
              lapses: 0,
              reviewCount: 0,
              createdAt: card.createdAt,
              updatedAt: card.updatedAt,
            },
            merge: true,
          }),
        ),
      );
      await writeDocWithQueue({
        userId: user.uid,
        path: ["users", user.uid, "decks", selectedDeck.id],
        data: { updatedAt: new Date().toISOString() },
        merge: true,
      });
      trackUserEvent(user.uid, "flashcards_generated", 0, {
        cardsGenerated: importedCards.length,
        deckId: selectedDeck.id,
      }).catch(() => undefined);
      setStatus(`${importedCards.length} cards imported.`);
    } catch (error) {
      console.warn(getAppErrorMessage(error));
      setCloudSyncBlocked(true);
      setStatus(
        "Cards could not be synced. Check Firebase rules and try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleExportCards = () => {
    if (!selectedDeck) return;
    const title = selectedDeck.title || "deck";
    const html = `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'" />
        <title>${escapeHtml(title)}</title>
        <style>body{font-family: -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial; color:#111;background:#fff} .card{border:1px solid #ddd;padding:12px;margin:12px 0;border-radius:8px}</style>
      </head>
      <body>
        <h1>${escapeHtml(title)}</h1>
        ${selectedCards
          .map(
            (c, i) =>
              `<div class="card"><h3>Card ${i + 1}</h3><p><strong>Front:</strong><br/>${escapeHtml(c.front)}</p><p><strong>Back:</strong><br/>${escapeHtml(c.back)}</p></div>`,
          )
          .join("")}
      </body>
      </html>`;

    // Open printable view for PDF printing
    const w = window.open("");
    if (w) {
      w.opener = null;
      w.document.write(html);
      w.document.close();
    }

    // Also offer a .doc download (Word accepts simple HTML blobs)
    const blob = new Blob([html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-cards.doc`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  // Simple HTML escape helper
  function escapeHtml(input: string) {
    return String(input)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  const startPractice = (onlyDue: boolean) => {
    if (gradeRequestRef.current) return;
    lastGradedCardRef.current = null;
    const source = onlyDue ? dueCards : selectedCards;
    const queue = shuffleMode ? shuffleCards(source) : [...source];
    setPracticeQueue(queue);
    setPracticeIndex(0);
    setReviewedCount(0);
    setIsFlipped(false);
    setPracticeOpen(Boolean(queue.length));
    if (!queue.length)
      setStatus(
        onlyDue ? "No due cards right now." : "Add cards before practicing.",
      );
  };

  const gradeCurrentCard = async (grade: Grade) => {
    if (!user || !selectedDeck || !currentPracticeCard || gradeRequestRef.current || lastGradedCardRef.current === currentPracticeCard.id) return;
    if (isReadOnlyAudit) { setStatus("Review changes are disabled in read-only audit mode."); return; }
    gradeRequestRef.current = true;
    lastGradedCardRef.current = currentPracticeCard.id;
    setIsGrading(true);
    try {

    const schedule = nextSchedule(currentPracticeCard, grade);
    setCardsByDeck((current) => ({
      ...current,
      [selectedDeck.id]: (current[selectedDeck.id] || []).map((card) =>
        card.id === currentPracticeCard.id
          ? {
              ...card,
              ...schedule,
              reviewCount: (card.reviewCount || 0) + 1,
              updatedAt: new Date().toISOString(),
            }
          : card,
      ),
    }));
    try {
      await writeDocWithQueue({
        userId: user.uid,
        path: [
          "users",
          user.uid,
          "decks",
          selectedDeck.id,
          "cards",
          currentPracticeCard.id,
        ],
        data: {
          ...schedule,
          reviewCount: (currentPracticeCard.reviewCount || 0) + 1,
          lastReviewedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        merge: true,
      });
    } catch (error) {
      console.warn(getAppErrorMessage(error));
      setCloudSyncBlocked(true);
    }

    setReviewedCount((count) => count + 1);
    setIsFlipped(false);
    updateLocalProfile(
      buildXpAwardPatch(profile, [], NOVIQ_XP.memory.revision),
    );
    persistXpAwards(user.uid, [], profile, NOVIQ_XP.memory.revision).catch(
      (error) => {
        console.warn("Revision XP sync failed", error);
      },
    );
    trackUserEvent(user.uid, "card_review", NOVIQ_XP.memory.revision, {
      cardsReviewed: 1,
    }).catch(() => undefined);

    if (practiceIndex + 1 >= practiceQueue.length) {
      window.setTimeout(() => setPracticeOpen(false), 220);
      return;
    }

    setPracticeIndex((index) => index + 1);
    } finally {
      gradeRequestRef.current = false;
      setIsGrading(false);
    }
  };

  return (
    <div className="min-h-screen space-y-8 pb-20 text-slate-950 dark:text-white">
      <header className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="h-1 w-8 rounded-full bg-blue-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
              Spaced repetition workspace
            </span>
          </div>
          <h2 className="font-display text-4xl font-bold tracking-tight text-slate-950 dark:text-white">
            Decks
          </h2>
          <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">
            Create decks, add markdown cards, import/export libraries, and
            review with Easy, Medium, Hard scheduling.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => setShowDeckModal(true)}
            className="btn-secondary"
          >
            <Plus size={18} />
            Create deck
          </button>
          <button
            type="button"
            onClick={() => startPractice(true)}
            disabled={!selectedDeck || dueCards.length === 0}
            className="btn-primary"
          >
            <Sparkles size={18} />
            Daily review
          </button>
        </div>
      </header>

      {status && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-200">
          {status}
        </div>
      )}
      {cloudSyncBlocked && (
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100">
          Decks work on this device now. Cloud sync will resume after Firebase
          rules are deployed.
        </div>
      )}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="glass h-fit border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.02]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">
              Your decks
            </h3>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600 dark:bg-white/5 dark:text-slate-400">
              {decks.length}
            </span>
          </div>

          <div className="space-y-2">
            {decks.map((deck) => {
              const cards = deckCards(deck.id);
              const due = cards.filter(isDue).length;
              return (
                <button
                  type="button"
                  key={deck.id}
                  onClick={() => setSelectedDeckId(deck.id)}
                  className={cn(
                    "w-full rounded-2xl border p-4 text-left transition",
                    selectedDeckId === deck.id
                      ? "border-blue-500/30 bg-blue-600/10"
                      : "border-transparent hover:border-slate-200 hover:bg-slate-50 dark:hover:border-white/10 dark:hover:bg-white/[0.04]",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-2xl text-white",
                        deck.color,
                      )}
                    >
                      <Layers size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="truncate font-bold text-slate-950 dark:text-white">
                        {deck.title}
                      </h4>
                      <p className="mt-1 text-xs text-slate-500">
                        {cards.length} cards
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-700 dark:bg-white/5 dark:text-cyan-300">
                      {due}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          {decks.length === 0 && (
            <div className="rounded-3xl border border-dashed border-slate-300 p-8 text-center dark:border-white/15">
              <Layers className="mx-auto text-slate-600" size={32} />
              <p className="mt-4 text-sm font-bold text-slate-950 dark:text-white">No decks yet</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">
                No decks yet. Generate flashcards from your notes.
              </p>
            </div>
          )}
        </aside>

        <main className="glass min-h-[680px] overflow-hidden border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.02]">
          {selectedDeck ? (
            <>
              <section className="border-b border-slate-200 p-5 dark:border-white/10 sm:p-6">
                <div className="flex min-w-0 flex-col gap-5 2xl:flex-row 2xl:items-start 2xl:justify-between">
                  <div>
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex h-12 w-12 items-center justify-center rounded-2xl text-white",
                          selectedDeck.color,
                        )}
                      >
                        <Layers size={22} />
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-slate-950 dark:text-white">
                          {selectedDeck.title}
                        </h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {selectedDeck.description || "Focused review deck"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                        <p className="text-2xl font-black text-slate-950 dark:text-white">
                          {selectedCards.length}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          Cards
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                        <p className="text-2xl font-black text-blue-700 dark:text-cyan-300">
                          {dueCards.length}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          Due
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                        <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300">
                          {
                            selectedCards.filter((card) => card.repetition > 0)
                              .length
                          }
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          Reviewed at least once
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[320px]">
                    <button
                      type="button"
                      onClick={() => startPractice(false)}
                      disabled={selectedCards.length === 0}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                    >
                      Practice all
                    </button>
                    <button
                      type="button"
                      onClick={handleExportCards}
                      disabled={selectedCards.length === 0}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                    >
                      <Download size={16} />
                      Export
                    </button>
                    <button
                      type="button"
                      onClick={() => importInputRef.current?.click()}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                    >
                      <FileUp size={16} />
                      Import
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteDeck(selectedDeck)}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-200 transition hover:bg-red-400/15"
                    >
                      <Trash2 size={16} />
                      Delete deck
                    </button>
                  </div>
                </div>

                <input
                  ref={importInputRef}
                  type="file"
                  accept=".docx,.txt,.csv,.tsv"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleImportCards(file);
                    event.currentTarget.value = "";
                  }}
                />
              </section>

              <section className="grid min-w-0 gap-6 p-5 sm:p-6 2xl:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-slate-950/45">
                  <div className="mb-4 flex items-center justify-between">
                    <h4 className="text-sm font-black uppercase tracking-[0.2em] text-slate-500">
                      {editingCardId ? "Edit card" : "One-click add"}
                    </h4>
                    {editingCardId && (
                      <button
                        type="button"
                        onClick={resetCardForm}
                        className="text-xs font-bold text-slate-500 hover:text-slate-950 dark:hover:text-white"
                      >
                        Cancel
                      </button>
                    )}
                  </div>

                  <div className="space-y-4">
                    <textarea
                      value={cardForm.front}
                      onChange={(event) =>
                        setCardForm((current) => ({
                          ...current,
                          front: event.target.value,
                        }))
                      }
                      placeholder="Front: question, prompt, term..."
                      className="CustomScrollbar min-h-28 w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-950 outline-none transition focus:border-blue-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                    />
                    <textarea
                      value={cardForm.back}
                      onChange={(event) =>
                        setCardForm((current) => ({
                          ...current,
                          back: event.target.value,
                        }))
                      }
                      placeholder="Back: answer, explanation, markdown..."
                      className="CustomScrollbar min-h-32 w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-950 outline-none transition focus:border-blue-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                    />

                    {(cardForm.imageUrl || cardImageFile) && (
                      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10">
                        <img
                          src={
                            cardImageFile
                              ? URL.createObjectURL(cardImageFile)
                              : cardForm.imageUrl
                          }
                          alt="Card attachment"
                          className="max-h-48 w-full object-cover"
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => imageInputRef.current?.click()}
                        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                      >
                        <ImageIcon size={16} />
                        Add image
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewMode((current) => !current)}
                        className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                      >
                        Markdown preview
                      </button>
                    </div>

                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        setCardImageFile(event.target.files?.[0] || null);
                        event.currentTarget.value = "";
                      }}
                    />

                    {previewMode && (
                      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-200">
                        <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-slate-500">
                          Back preview
                        </p>
                        <ReactMarkdown>
                          {cardForm.back || "Nothing to preview yet."}
                        </ReactMarkdown>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleSaveCard}
                      disabled={
                        !cardForm.front.trim() ||
                        !cardForm.back.trim() ||
                        isSaving
                      }
                      className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white shadow-xl shadow-blue-500/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isSaving ? (
                        <Loader2 size={18} className="animate-spin" />
                      ) : (
                        <Plus size={18} />
                      )}
                      {editingCardId ? "Save card" : "Add card"}
                    </button>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="relative min-w-0 flex-1">
                      <Search
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500"
                        size={16}
                      />
                      <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search cards..."
                        className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-4 text-sm text-slate-950 outline-none transition focus:border-blue-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setShuffleMode((current) => !current)}
                      className={cn(
                        "inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition",
                        shuffleMode
                          ? "border-blue-500/25 bg-blue-600/10 text-blue-300"
                          : "border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
                      )}
                    >
                      <Shuffle size={16} />
                      Shuffle
                    </button>
                  </div>

                  <div className="CustomScrollbar max-h-[520px] space-y-3 overflow-y-auto pr-1">
                    {filteredCards.map((card) => (
                      <article
                        key={card.id}
                        className="rounded-3xl border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-white/[0.04]"
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                          {card.imageUrl && (
                            <img
                              src={card.imageUrl}
                              alt={card.front}
                              aria-label={card.front}
                              className="h-24 w-full rounded-2xl object-cover sm:w-28"
                            />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold leading-6 text-slate-950 dark:text-white">
                              <ReactMarkdown>{card.front}</ReactMarkdown>
                            </div>
                            <div className="mt-3 border-t border-slate-200 pt-3 text-sm leading-6 text-slate-600 dark:border-white/10 dark:text-slate-400">
                              <ReactMarkdown>{card.back}</ReactMarkdown>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                              <span className="rounded-full bg-white px-2 py-1 dark:bg-white/5">
                                Due {new Date(card.dueAt).toLocaleDateString()}
                              </span>
                              <span className="rounded-full bg-white px-2 py-1 dark:bg-white/5">
                                Interval {card.interval}d
                              </span>
                              <span className="rounded-full bg-white px-2 py-1 dark:bg-white/5">
                                Reviews {card.reviewCount || 0}
                              </span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleEditCard(card)}
                              className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 transition hover:text-slate-950 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:text-white"
                              aria-label="Edit card"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteCard(card)}
                              className="rounded-xl border border-red-400/20 bg-red-400/10 p-2 text-red-200 transition hover:bg-red-400/15"
                              aria-label="Delete card"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </article>
                    ))}

                    {filteredCards.length === 0 && (
                      <div className="rounded-3xl border border-dashed border-slate-300 p-10 text-center dark:border-white/15">
                        <Plus className="mx-auto text-slate-600" size={34} />
                        <p className="mt-4 font-bold text-slate-950 dark:text-white">
                          No cards found
                        </p>
                        <p className="mt-2 text-sm text-slate-500">
                          Add a card or import a JSON/CSV deck.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </section>
            </>
          ) : (
            <div className="flex min-h-[640px] flex-col items-center justify-center p-8 text-center">
              <Layers size={42} className="text-slate-600" />
              <h3 className="mt-5 text-2xl font-bold text-slate-950 dark:text-white">
                Create your first deck
              </h3>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                Decks are saved in your account and sync across sessions.
              </p>
              <button
                type="button"
                onClick={() => setShowDeckModal(true)}
                className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-black text-white"
              >
                <Plus size={18} />
                Create deck
              </button>
            </div>
          )}
        </main>
      </div>

      <AnimatePresence>
        {showDeckModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="noviq-modal-backdrop z-[110]"
          >
            <div className="noviq-modal-positioner noviq-modal-md">
              <motion.div
                ref={deckDialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="create-deck-title"
                tabIndex={-1}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="noviq-modal-panel CustomScrollbar glass border-slate-200 bg-white p-5 dark:border-white/10 dark:bg-[#0B1020] sm:p-8"
              >
                <div className="mb-6 flex items-start justify-between">
                  <div>
                    <p className="section-label">New Deck</p>
                    <h2 id="create-deck-title" className="text-3xl font-bold text-slate-950 dark:text-white">
                      Create deck
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDeckModal(false)}
                    aria-label="Close deck form"
                    className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:text-slate-950 dark:bg-white/5 dark:text-slate-400 dark:hover:text-white"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="space-y-4">
                  <input
                    autoFocus
                    value={deckForm.title}
                    onChange={(event) =>
                      setDeckForm((current) => ({
                        ...current,
                        title: event.target.value,
                      }))
                    }
                    placeholder="Biology exam, IELTS words..."
                    className="premium-input"
                  />
                  <textarea
                    value={deckForm.description}
                    onChange={(event) =>
                      setDeckForm((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    placeholder="Optional description"
                    className="premium-input min-h-24 resize-none"
                  />
                  <button
                    type="button"
                    onClick={handleCreateDeck}
                    disabled={!deckForm.title.trim() || isSaving}
                    className="premium-action flex min-h-12 w-full items-center justify-center gap-2"
                  >
                    {isSaving ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Upload size={18} />
                    )}
                    Create deck
                  </button>
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {practiceOpen && currentPracticeCard && (
          <motion.div
            ref={practiceDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Flashcard review session"
            tabIndex={-1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex flex-col bg-[#050810]"
          >
            <header className="flex flex-col gap-4 border-b border-white/10 bg-black/40 p-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <button
                type="button"
                onClick={() => setPracticeOpen(false)}
                className="flex items-center gap-3 text-slate-400 transition hover:text-white"
              >
                <span className="rounded-xl bg-white/5 p-2">
                  <ArrowLeft size={18} />
                </span>
                <span className="text-sm font-bold uppercase tracking-widest">
                  End session
                </span>
              </button>

              <div className="min-w-0 flex-1 sm:max-w-md">
                <div className="h-2 overflow-hidden rounded-full bg-white/5">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-300 transition-all"
                    style={{
                      width: `${Math.round(((practiceIndex + 1) / practiceQueue.length) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  {practiceIndex + 1} / {practiceQueue.length} cards reviewed:{" "}
                  {reviewedCount}
                </p>
              </div>

              <p className="text-xs font-bold text-slate-500">
                Space flip · 1 Hard · 2 Medium · 3 Easy
              </p>
            </header>

            <main className="flex flex-1 flex-col items-center justify-center overflow-y-auto p-4 sm:p-10">
              <div className="w-full max-w-3xl">
                <div
                  className="h-[380px] cursor-pointer perspective-1200 sm:h-[470px]"
                  onClick={() => setIsFlipped((current) => !current)}
                >
                  <motion.div
                    initial={false}
                    animate={{ rotateY: isFlipped ? 180 : 0 }}
                    transition={{ type: "spring", stiffness: 180, damping: 22 }}
                    className="relative h-full w-full preserve-3d"
                  >
                    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-slate-950 p-8 text-center shadow-3xl backface-hidden sm:rounded-[3rem] sm:p-12">
                      <p className="mb-8 text-[10px] font-black uppercase tracking-[0.45em] text-blue-400">
                        Front
                      </p>
                      {currentPracticeCard.imageUrl && (
                        <img
                          src={currentPracticeCard.imageUrl}
                          alt=""
                          className="mb-6 max-h-40 rounded-2xl object-contain"
                        />
                      )}
                      <div className="prose prose-invert max-w-none text-xl font-bold leading-relaxed sm:text-3xl">
                        <ReactMarkdown>
                          {currentPracticeCard.front}
                        </ReactMarkdown>
                      </div>
                      <p className="absolute bottom-8 text-[10px] font-bold uppercase tracking-widest text-slate-600">
                        Tap or press Space to flip
                      </p>
                    </div>

                    <div className="absolute inset-0 flex flex-col items-center justify-center rounded-[2rem] border border-white/10 bg-slate-950 p-8 text-center shadow-3xl backface-hidden [transform:rotateY(180deg)] sm:rounded-[3rem] sm:p-12">
                      <p className="mb-8 text-[10px] font-black uppercase tracking-[0.45em] text-emerald-400">
                        Back
                      </p>
                      <div className="prose prose-invert max-w-none text-lg leading-relaxed text-slate-200 sm:text-2xl">
                        <ReactMarkdown>
                          {currentPracticeCard.back}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </motion.div>
                </div>

                <AnimatePresence>
                  {isFlipped && (
                    <motion.div
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 18 }}
                      className="mt-6 grid gap-3 sm:grid-cols-3"
                    >
                      {[
                        {
                          grade: "hard" as Grade,
                          label: "Hard",
                          hint: "1 day",
                          icon: <XCircle size={20} />,
                          className:
                            "text-red-300 hover:bg-red-500/10 border-red-400/20",
                        },
                        {
                          grade: "medium" as Grade,
                          label: "Medium",
                          hint: "normal",
                          icon: <RotateCw size={20} />,
                          className:
                            "text-amber-300 hover:bg-amber-500/10 border-amber-400/20",
                        },
                        {
                          grade: "easy" as Grade,
                          label: "Easy",
                          hint: "longer interval",
                          icon: <CheckCircle size={20} />,
                          className:
                            "text-emerald-300 hover:bg-emerald-500/10 border-emerald-400/20",
                        },
                      ].map((button) => (
                        <button
                          type="button"
                          key={button.grade}
                          onClick={() => gradeCurrentCard(button.grade)}
                          disabled={isGrading}
                          className={cn(
                            "rounded-3xl border bg-white/[0.04] p-5 text-center font-black uppercase tracking-widest transition",
                            button.className,
                          )}
                        >
                          <div className="mb-2 flex justify-center">
                            {button.icon}
                          </div>
                          <p className="text-sm">{button.label}</p>
                          <p className="mt-1 text-[10px] opacity-60">
                            {button.hint}
                          </p>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </main>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
