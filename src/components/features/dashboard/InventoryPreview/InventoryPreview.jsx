import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '../../../../context/AuthContext';
import api from '../../../../services/api';
import cardService from '../../../../services/cardService';
import CardCard from '../../cards/CardCard/CardCard';
import styles from './InventoryPreview.module.css';

const CARD_SLOT_WIDTH = 144;
const GAP = 12;
const PAGE_SIZE = 24;

function InventoryPreview() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [games, setGames] = useState([]);
  const [sets, setSets] = useState([]);
  const [selectedGame, setSelectedGame] = useState('');
  const [selectedSet, setSelectedSet] = useState('');

  const [gamesLoading, setGamesLoading] = useState(true);
  const [setsLoading, setSetsLoading] = useState(false);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  const [cards, setCards] = useState([]);
  const [hasMore, setHasMore] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [cardsPerView, setCardsPerView] = useState(7);

  const viewportRef = useRef(null);
  const invMapRef = useRef(new Map());
  const loadingMoreRef = useRef(false);
  const gamesQueueRef = useRef([]);
  const currentGameIdxRef = useRef(0);
  const gamePageRef = useRef(0);

  // Fetch games on mount
  useEffect(() => {
    setGamesLoading(true);
    api.get('/cards/games')
      .then(res => { setGames(res.data || []); setGamesLoading(false); })
      .catch(() => setGamesLoading(false));
  }, []);

  // Fetch sets when game changes
  useEffect(() => {
    if (!selectedGame) { setSets([]); setSelectedSet(''); return; }
    setSelectedSet('');
    setSetsLoading(true);
    api.get('/cards/sets', { params: { gameId: selectedGame } })
      .then(res => { setSets(res.data || []); setSetsLoading(false); })
      .catch(() => { setSets([]); setSetsLoading(false); });
  }, [selectedGame]);

  // Load cards when game/set selection changes
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    setCards([]);
    setCurrentIndex(0);
    setFetchError(null);

    async function load() {
      if (!selectedGame) {
        setHasMore(true);
        await loadAllGames(() => cancelled);
      } else if (!selectedSet) {
        setHasMore(false);
        await loadGameCards(selectedGame, () => cancelled);
      } else {
        setHasMore(false);
        await loadSetCards(selectedGame, selectedSet, () => cancelled);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [selectedGame, selectedSet, user?.id]);

  useEffect(() => {
    setCurrentIndex(prev => Math.min(prev, Math.max(0, cards.length - cardsPerView)));
  }, [cards.length, cardsPerView]);

  // Progressive load trigger (All Games mode only)
  useEffect(() => {
    if (selectedGame || !hasMore || loadingMore || cardsLoading || cards.length === 0) return;
    if (loadingMoreRef.current) return;

    const remaining = cards.length - currentIndex - cardsPerView;
    if (remaining <= 3) {
      loadMore();
    }
  });

  useEffect(() => {
    function updateCardsPerView() {
      if (viewportRef.current) {
        const vw = viewportRef.current.clientWidth;
        const visible = Math.floor((vw + GAP) / (CARD_SLOT_WIDTH + GAP));
        setCardsPerView(Math.max(1, visible));
      }
    }
    updateCardsPerView();
    window.addEventListener('resize', updateCardsPerView);
    return () => window.removeEventListener('resize', updateCardsPerView);
  }, []);

  async function loadAllGames(isCancelled) {
    setCardsLoading(true);
    try {
      const invRes = await cardService.getUserInventory(user.id, { size: 10000 });
      if (isCancelled()) return;
      const invList = invRes.content || invRes.data || [];
      invMapRef.current = new Map(invList.map(item => [item.cardId, item]));

      const gamesRes = await api.get('/cards/games');
      if (isCancelled()) return;
      const gameList = gamesRes.data || [];
      gamesQueueRef.current = gameList.map(g => g.id);

      if (gamesQueueRef.current.length === 0) {
        setCards([]);
        setCardsLoading(false);
        return;
      }

      currentGameIdxRef.current = 0;
      gamePageRef.current = 0;

      const catRes = await cardService.listCards({ gameId: gamesQueueRef.current[0], page: 0, size: PAGE_SIZE });
      if (isCancelled()) return;
      const catalog = catRes.content || catRes.data || [];
      gamePageRef.current = 1;

      const isLast = catRes.last === true || catalog.length < PAGE_SIZE;
      setHasMore(!isLast || gamesQueueRef.current.length > 1);

      setCards(mergeCards(catalog, invMapRef.current));
    } catch (err) {
      if (!isCancelled()) setFetchError(err?.message || t('common.error'));
    } finally {
      if (!isCancelled()) setCardsLoading(false);
    }
  }

  async function loadGameCards(gameId, isCancelled) {
    setCardsLoading(true);
    try {
      const [catRes, invRes] = await Promise.all([
        cardService.listCards({ gameId, size: 1000 }),
        cardService.getUserInventory(user.id, { gameId, size: 500 }),
      ]);
      if (isCancelled()) return;

      const catalog = catRes.content || catRes.data || [];
      const invList = invRes.content || invRes.data || [];
      const invMap = new Map(invList.map(item => [item.cardId, item]));

      let merged = mergeCards(catalog, invMap);
      merged.sort((a, b) => (a.owned === b.owned ? 0 : a.owned ? -1 : 1));

      setCards(merged);
    } catch (err) {
      if (!isCancelled()) setFetchError(err?.message || t('common.error'));
    } finally {
      if (!isCancelled()) setCardsLoading(false);
    }
  }

  async function loadSetCards(gameId, setId, isCancelled) {
    setCardsLoading(true);
    try {
      const [catRes, invRes] = await Promise.all([
        cardService.listCards({ setId, size: 500 }),
        cardService.getUserInventory(user.id, { setId, size: 500 }),
      ]);
      if (isCancelled()) return;

      const catalog = catRes.content || catRes.data || [];
      const invList = invRes.content || invRes.data || [];
      const invMap = new Map(invList.map(item => [item.cardId, item]));

      let merged = mergeCards(catalog, invMap);
      merged.sort((a, b) => (a.owned === b.owned ? 0 : a.owned ? -1 : 1));

      setCards(merged);
    } catch (err) {
      if (!isCancelled()) setFetchError(err?.message || t('common.error'));
    } finally {
      if (!isCancelled()) setCardsLoading(false);
    }
  }

  function mergeCards(catalog, invMap) {
    return catalog.map(catCard => {
      const owned = invMap.get(catCard.id);
      return {
        ...catCard,
        owned: !!owned,
        quantity: owned?.quantity || 0,
        userCardId: owned?.userCardId || null,
      };
    });
  }

  async function loadMore() {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const gameId = gamesQueueRef.current[currentGameIdxRef.current];
      const page = gamePageRef.current;

      const catRes = await cardService.listCards({ gameId, page, size: PAGE_SIZE });
      const catalog = catRes.content || catRes.data || [];

      const isLast = catRes.last === true || catalog.length < PAGE_SIZE;

      if (isLast) {
        const nextIdx = currentGameIdxRef.current + 1;
        if (nextIdx < gamesQueueRef.current.length) {
          currentGameIdxRef.current = nextIdx;
          gamePageRef.current = 0;
          setHasMore(true);
        } else {
          setHasMore(false);
        }
      } else {
        gamePageRef.current = page + 1;
        setHasMore(true);
      }

      const merged = mergeCards(catalog, invMapRef.current);
      setCards(prev => [...prev, ...merged]);
    } catch {
      // silently fail progressive load
    } finally {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    }
  }

  const maxIndex = Math.max(0, cards.length - 1);

  const handlePrev = useCallback(() => {
    setCurrentIndex(prev => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentIndex(prev => Math.min(maxIndex, prev + 1));
  }, [maxIndex]);

  const translateX = -(currentIndex * (CARD_SLOT_WIDTH + GAP));

  function renderSkeletons(count) {
    return Array.from({ length: count }).map((_, i) => (
      <div key={`skel-${i}`} className={styles.skeleton}>
        <div className={styles.skeletonImage} />
        <div className={styles.skeletonName} />
      </div>
    ));
  }

  function renderEmpty(message) {
    return <p className={styles.empty}>{message}</p>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.filterRow}>
        <select
          className={styles.select}
          value={selectedGame}
          onChange={e => setSelectedGame(e.target.value)}
          disabled={gamesLoading}
        >
          <option value="">{gamesLoading ? t('common.loading') : t('catalog.allGames')}</option>
          {games.map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>

        <select
          className={styles.select}
          value={selectedSet}
          onChange={e => setSelectedSet(e.target.value)}
          disabled={!selectedGame || setsLoading}
        >
          <option value="">
            {setsLoading ? t('common.loading') : !selectedGame ? t('inventory.selectGameFirst') : t('catalog.allSets')}
          </option>
          {sets.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className={styles.carouselWrapper}>
        <button
          className={`${styles.arrow} ${styles.arrowLeft}`}
          onClick={handlePrev}
          disabled={currentIndex === 0 || cards.length === 0}
          aria-label={t('common.previous')}
        >
          <svg className={styles.arrowIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        <div className={styles.viewport} ref={viewportRef}>
          {cardsLoading ? (
            <div className={styles.track} style={{ transform: 'none' }}>
              {renderSkeletons(cardsPerView)}
            </div>
          ) : cards.length > 0 ? (
            <div className={styles.track} style={{ transform: `translateX(${translateX}px)` }}>
              {cards.map((card, index) => (
                <div key={card.id} className={`${styles.cardSlot} ${index === currentIndex ? styles.focused : ''}`}>
                  <CardCard
                    card={card}
                    unowned={!card.owned}
                    showQuantity={card.owned}
                  />
                </div>
              ))}
              {loadingMore && renderSkeletons(3)}
            </div>
          ) : fetchError ? (
            renderEmpty(fetchError)
          ) : !selectedGame ? (
            renderEmpty(t('inventory.selectGameFirst'))
          ) : (
            renderEmpty(t('inventory.noCards'))
          )}
        </div>

        <button
          className={`${styles.arrow} ${styles.arrowRight}`}
          onClick={handleNext}
          disabled={currentIndex >= maxIndex || cards.length === 0}
          aria-label={t('common.next')}
        >
          <svg className={styles.arrowIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default InventoryPreview;
