import React, { memo } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { getIconByName } from '@/shared/utils/iconMapper';
import { Skeleton } from '@/shared/components/ui/Skeleton';
import type { GridItem } from '../hooks/useHomeGrids';
import { useLanguage } from '@/shared/i18n/LanguageProvider';
import { pickLang } from '@/shared/i18n/localize';

const SKELETON_COUNT = 4;

export interface ThemeConfig {
  active_theme?: string;
  greeting_bg_url?: string;
}

interface FeatureGridProps {
  features: GridItem[];
  loading?: boolean;
  themeConfig?: ThemeConfig;
  loadingLabel?: string;
}

const isImageSource = (value: string) => {
  return value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/');
};

const FeatureGrid: React.FC<FeatureGridProps> = memo(({ features, loading = false, loadingLabel }) => {
  const { language } = useLanguage();
  if (loading) {
    return (
      <div
        className="grid grid-cols-2 gap-3"
        role={loadingLabel ? 'status' : undefined}
        aria-label={loadingLabel}
      >
        {Array.from({ length: SKELETON_COUNT }).map((_, index) => (
          <Skeleton
            key={`feature-skeleton-${index}`}
            className="h-[148px] rounded-[22px] bg-surface-elevated"
          />
        ))}
      </div>
    );
  }

  if (!features.length) return null;

  return (
    <div className="grid grid-cols-2 gap-3">
      {features.map((item) => {
        const iconName = item.icon_name.trim();
        const renderAsImage = isImageSource(iconName);
        const IconComponent = renderAsImage ? null : getIconByName(iconName);
        const hasValidLink = typeof item.link === 'string' && item.link.trim().length > 0;

        const content = (
          <>
            <div className="pointer-events-none absolute inset-x-4 top-3 h-12 rounded-[18px] bg-secondary opacity-50 blur-2xl" />

            <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-[16px] border border-card-border bg-badge-bg text-badge-text">
              {renderAsImage ? (
                <img
                  src={iconName}
                  alt={item.title}
                  className="h-7 w-7 object-contain transition-transform duration-200 group-hover:scale-105"
                  loading="lazy"
                />
              ) : IconComponent ? (
                <IconComponent
                  className="h-6 w-6 transition-transform duration-200 group-hover:scale-105"
                  strokeWidth={2.2}
                />
              ) : null}
            </div>

            <div className="relative z-10 mt-3 flex flex-1 flex-col items-center justify-center">
              <span className="line-clamp-2 font-['Hind_Siliguri'] text-base font-bold leading-snug tracking-tight text-text-primary">
                {pickLang(language, item.title_bn, item.title_en) || item.title}
              </span>
            </div>

            <div className="relative z-10 mt-3 flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ChevronRight className="h-4 w-4" />
            </div>
          </>
        );

        const baseClassName =
          'group relative flex min-h-[148px] flex-col items-center justify-center overflow-hidden rounded-[22px] border border-card-border bg-card-bg px-3 py-4 text-center transition-all duration-200 active:scale-[0.985]';

        if (!hasValidLink) {
          return (
            <div key={item.id} className={baseClassName}>
              {content}
            </div>
          );
        }

        return (
          <Link key={item.id} to={item.link as string} className={baseClassName}>
            {content}
          </Link>
        );
      })}
    </div>
  );
});

FeatureGrid.displayName = 'FeatureGrid';

export default FeatureGrid;
