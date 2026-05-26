import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import useDashboard from '../../hooks/useDashboard';
import MainLayout from '../../components/layout/MainLayout/MainLayout';
import DashboardStats from '../../components/features/dashboard/DashboardStats/DashboardStats';
import InventoryPreview from '../../components/features/dashboard/InventoryPreview/InventoryPreview';
import SetScroller from '../../components/features/dashboard/SetScroller/SetScroller';
import Badge from '../../components/common/Badge/Badge';
import Placeholder from '../../components/common/Placeholder/Placeholder';
import { TRADE_STATUS_BADGE_VARIANTS, getImageUrl } from '../../utils/constants';
import { formatDate } from '../../utils/formatters';
import styles from './DashboardPage.module.css';

function CardMini({ card }) {
  const src = getImageUrl(card.imageUrl);
  return (
    <div className={styles.feedCardMini}>
      {src
        ? <img src={src} alt={card.cardName} className={styles.feedCardMiniImg} />
        : <Placeholder size="sm" />
      }
      <span className={styles.feedCardMiniName}>{card.cardName}</span>
    </div>
  );
}

function DashboardPage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const { stats, activities, loading, error } = useDashboard(user?.id);

  return (
    <MainLayout user={user} onLogout={logout}>
      <div className={styles.page}>

        <div className={styles.welcome}>
          <svg className={styles.polyOverlay} viewBox="0 0 1000 300" preserveAspectRatio="none">
            <polygon points="0,0 280,0 180,140 0,90" fill="#000000" opacity="0.04" />
            <polygon points="280,0 480,0 350,130" fill="#ffffff" opacity="0.05" />
            <polygon points="0,300 0,160 220,300" fill="#ffffff" opacity="0.04" />
            <polygon points="120,300 400,150 640,300" fill="#ffffff" opacity="0.06" />
            <polygon points="400,150 640,300 350,130" fill="#000000" opacity="0.02" />
            <polygon points="480,0 720,0 580,140 350,130" fill="#ffffff" opacity="0.03" />
            <polygon points="480,300 680,100 860,300" fill="#ffffff" opacity="0.05" />
            <polygon points="580,140 680,100 520,300" fill="#000000" opacity="0.02" />
            <polygon points="720,0 920,0 800,120 580,140" fill="#ffffff" opacity="0.04" />
            <polygon points="920,0 1000,0 1000,160 800,120" fill="#ffffff" opacity="0.06" />
          </svg>

          <div className={styles.welcomeText} style={{ position: 'relative', zIndex: 1 }}>
            <h1 className={styles.title}>
              {t('dashboard.welcomeBack')}, <span className={styles.username}>{user?.username}</span>!
            </h1>
            <p className={styles.subtitle}>{t('dashboard.hereIsHappening')}</p>
          </div>
          <SetScroller />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.statsWrapper}>
          <DashboardStats stats={stats} loading={loading} />
        </div>

        <InventoryPreview />

        <div className={styles.lower}>
          <div className={styles.feed}>
            <h2 className={styles.feedTitle}>{t('dashboard.recentActivity')}</h2>
            {loading ? (
              <p className={styles.feedEmpty}>{t('dashboard.loadingActivity')}</p>
            ) : activities.length === 0 ? (
              <p className={styles.feedEmpty}>{t('dashboard.noRecentActivity')}</p>
            ) : (
              <ul className={styles.feedList}>
                {activities.map((trade) => {
                  const isProposer = trade.proposerId === user?.id;
                  const offeredCards = (trade.items || []).filter(i => i.fromUserId === trade.proposerId);
                  const requestedCards = (trade.items || []).filter(i => i.fromUserId === trade.receiverId);
                  const myCards = isProposer ? offeredCards : requestedCards;
                  const theirCards = isProposer ? requestedCards : offeredCards;
                  const counterpartUsername = isProposer ? trade.receiverUsername : trade.proposerUsername;

                  return (
                    <li key={trade.id} className={styles.feedItem}>
                      <div className={styles.feedHeader}>
                        <div className={styles.feedHeaderLeft}>
                          <span className={styles.feedDate}>{formatDate(trade.createdAt)}</span>
                          <span className={styles.feedTradeId}>#{trade.id.slice(-6)}</span>
                        </div>
                        <Badge
                          label={t(`tradeStatuses.${trade.status.toLowerCase()}`)}
                          variant={TRADE_STATUS_BADGE_VARIANTS[trade.status]}
                        />
                      </div>

                      <div className={styles.feedColumns}>
                        <div className={styles.feedCol}>
                          <h4 className={styles.feedColTitle}>
                            {isProposer ? t('trades.youOffer') : `${counterpartUsername} ${t('trades.offers')}`}
                          </h4>
                          <div className={styles.feedCardsList}>
                            {myCards.map(card => (
                              <CardMini key={card.userCardId} card={card} />
                            ))}
                          </div>
                        </div>
                        <div className={styles.feedCol}>
                          <h4 className={styles.feedColTitle}>
                            {isProposer ? `${counterpartUsername} ${t('trades.offers')}` : t('trades.youOffer')}
                          </h4>
                          <div className={styles.feedCardsList}>
                            {theirCards.map(card => (
                              <CardMini key={card.userCardId} card={card} />
                            ))}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

      </div>
    </MainLayout>
  );
}

export default DashboardPage;
