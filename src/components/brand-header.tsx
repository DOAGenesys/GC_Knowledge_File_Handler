import Image from 'next/image';
import { APP_NAME, GENESYS_LOGO_SRC } from '@/lib/constants';

export interface BrandHeaderProps {
  /** Sidebar stack vs centered auth/vault screens. */
  layout?: 'sidebar' | 'auth';
  /** Line under the product name; sensible defaults per layout. */
  subtitle?: string;
}

const DEFAULT_SUBTITLE: Record<NonNullable<BrandHeaderProps['layout']>, string> = {
  sidebar: 'Genesys Knowledge Fabric',
  auth: 'Genesys Cloud',
};

/**
 * Shared product branding: Genesys wordmark + app title. Used on the sidebar,
 * login screen, and vault gate so branding stays consistent.
 */
export function BrandHeader({ layout = 'sidebar', subtitle }: BrandHeaderProps) {
  const sub = subtitle ?? DEFAULT_SUBTITLE[layout];
  return (
    <div className={`brand-header brand-header--${layout}`}>
      <Image
        src={GENESYS_LOGO_SRC}
        alt="Genesys"
        className="brand-logo"
        width={layout === 'sidebar' ? 108 : 124}
        height={layout === 'sidebar' ? 24 : 28}
        priority
      />
      <div className="brand-header-copy">
        <div className="brand-name">{APP_NAME}</div>
        <div className="brand-sub">{sub}</div>
      </div>
    </div>
  );
}
