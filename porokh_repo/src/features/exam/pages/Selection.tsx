import React, { useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, Building2 } from 'lucide-react';
import ModelTestTab from '../components/ModelTestTab';
import BoardExamTab from '../components/BoardExamTab';
import { useLanguage } from '@/shared/i18n/LanguageProvider';
import { FreeUsageIndicator } from '@/features/access/components/FreeUsageIndicator';

type TabType = 'model' | 'board';

const MIN_SWIPE_DISTANCE = 50;

const Selection: React.FC = () => {
  const { t } = useLanguage();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (searchParams.get('type') as TabType) || 'model';

  const setActiveTab = useCallback((tab: TabType) => {
    setSearchParams({ type: tab }, { replace: true });
  }, [setSearchParams]);

  const [isDetailView, setIsDetailView] = useState<boolean>(false); 
  
  const touchStartX = useRef<number | null>(null);

  const onTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (isDetailView) return; 
    touchStartX.current = e.targetTouches[0].clientX;
  }, [isDetailView]);

  const onTouchEnd = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    if (isDetailView || touchStartX.current === null) return;
    
    const touchEndX = e.changedTouches[0].clientX;
    const distance = touchStartX.current - touchEndX;

    const isLeftSwipe = distance > MIN_SWIPE_DISTANCE;
    const isRightSwipe = distance < -MIN_SWIPE_DISTANCE;

    if (isLeftSwipe && activeTab === 'model') {
      setActiveTab('board');
    } else if (isRightSwipe && activeTab === 'board') {
      setActiveTab('model');
    }

    touchStartX.current = null;
  }, [isDetailView, activeTab, setActiveTab]);

  return (
    <div 
      className="min-h-screen pb-20 overflow-x-hidden flex flex-col items-center bg-app text-text-primary"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {!isDetailView && (
        <div className="w-full max-w-4xl mx-auto px-3 pt-3">
          <FreeUsageIndicator />
        </div>
      )}

      {!isDetailView && (
        <div className="sticky top-0 z-10 w-full backdrop-blur-md transition-all duration-300 shadow-sm bg-surface/90 border-b border-border-color">
          <div className="flex w-full max-w-4xl mx-auto px-2 sm:px-4">
            <button
              onClick={() => setActiveTab('model')}
              className={`flex-1 flex items-center justify-center gap-2.5 py-4 text-[15px] sm:text-base font-semibold transition-colors duration-300 relative rounded-t-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                activeTab === 'model' ? 'text-primary' : 'text-text-secondary'
              }`}
            >
              <FileText size={18} strokeWidth={activeTab === 'model' ? 2.5 : 2} />
              {t('exam.modelTest')}
              <div 
                className={`absolute bottom-0 left-0 w-full h-0.5 transition-opacity duration-300 bg-primary ${
                  activeTab === 'model' ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </button>

            <button
              onClick={() => setActiveTab('board')}
              className={`flex-1 flex items-center justify-center gap-2.5 py-4 text-[15px] sm:text-base font-semibold transition-colors duration-300 relative rounded-t-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring ${
                activeTab === 'board' ? 'text-primary' : 'text-text-secondary'
              }`}
            >
              <Building2 size={18} strokeWidth={activeTab === 'board' ? 2.5 : 2} />
              {t('exam.boardExam')}
              <div 
                className={`absolute bottom-0 left-0 w-full h-0.5 transition-opacity duration-300 bg-primary ${
                  activeTab === 'board' ? 'opacity-100' : 'opacity-0'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      <div className={`w-full max-w-4xl mx-auto ${!isDetailView ? "p-4 sm:p-6" : "p-0"}`}>
        {activeTab === 'model' ? (
          <div className={!isDetailView ? "animate-in slide-in-from-left-4 fade-in duration-300" : ""}>
            <ModelTestTab onViewChange={setIsDetailView} />
          </div>
        ) : (
          <div className={!isDetailView ? "animate-in slide-in-from-right-4 fade-in duration-300" : ""}>
            <BoardExamTab onViewChange={setIsDetailView} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Selection;
