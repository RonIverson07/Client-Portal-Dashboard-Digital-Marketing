'use client';

import { useEffect, useState } from 'react';
import { getDisplayImageUrl } from '@/lib/imageUtils';
import styles from './TaskImageCarousel.module.css';

const FALLBACK_IMG =
  'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220"><rect fill="%23f3f4f6" width="400" height="220"/></svg>';

interface TaskImageCarouselProps {
  images: string[];
  alt: string;
  className?: string;
  onImageClick?: (index: number) => void;
  onIndexChange?: (index: number) => void;
  showEnlargeHint?: boolean;
}

export function TaskImageCarousel({
  images,
  alt,
  className = '',
  onImageClick,
  onIndexChange,
  showEnlargeHint = false,
}: TaskImageCarouselProps) {
  const [index, setIndex] = useState(0);
  const safeImages = images.filter(Boolean);

  useEffect(() => {
    if (index >= safeImages.length) setIndex(0);
  }, [index, safeImages.length]);

  useEffect(() => {
    onIndexChange?.(index);
  }, [index, onIndexChange]);

  if (safeImages.length === 0) return null;

  const hasNav = safeImages.length > 1;
  const current = safeImages[index] || safeImages[0];

  return (
    <div
      className={styles.wrap}
      onClick={onImageClick ? () => onImageClick(index) : undefined}
      role={onImageClick ? 'button' : undefined}
      tabIndex={onImageClick ? 0 : undefined}
      onKeyDown={
        onImageClick
          ? e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onImageClick(index);
              }
            }
          : undefined
      }
    >
      <img
        src={getDisplayImageUrl(current)}
        alt={alt}
        className={`${styles.img} ${className}`.trim()}
        draggable={false}
        onError={e => {
          (e.target as HTMLImageElement).src = FALLBACK_IMG;
        }}
      />
      {showEnlargeHint && <div className={styles.enlargeHint}>🔍</div>}
      {hasNav && (
        <>
          <button
            type="button"
            className={`${styles.navBtn} ${styles.navPrev}`}
            onClick={e => {
              e.stopPropagation();
              setIndex(prev => (prev - 1 + safeImages.length) % safeImages.length);
            }}
            aria-label="Previous image"
          >
            ‹
          </button>
          <button
            type="button"
            className={`${styles.navBtn} ${styles.navNext}`}
            onClick={e => {
              e.stopPropagation();
              setIndex(prev => (prev + 1) % safeImages.length);
            }}
            aria-label="Next image"
          >
            ›
          </button>
          <div className={styles.count}>
            {index + 1}/{safeImages.length}
          </div>
        </>
      )}
    </div>
  );
}
