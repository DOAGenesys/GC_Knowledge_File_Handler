import Image from 'next/image';
import { APP_NAME, GENESYS_LOGO_SRC } from '@/lib/constants';

export interface BrandHeaderProps {
  /** Sidebar stack vs centered auth/vault screens. */
  layout?: 'sidebar' | 'auth';
  /** Optional line under the product name (auth screens only). */
  subtitle?: string;
}

/**
 * Shared product branding: the Genesys wordmark with a concise product label.
 *
 * The sidebar stacks the logo above the product name (and omits a redundant
 * "Genesys" subtitle, since the wordmark already carries it); the centered auth
 * layout keeps the logo and copy side by side.
 */
export function BrandHeader({ layout = 'sidebar', subtitle }: BrandHeaderProps) {
  return (
    <div className={`brand-header brand-header--${layout}`}>
      <Image
        src={GENESYS_LOGO_SRC}
        alt="Genesys"
        className="brand-logo"
        width={layout === 'sidebar' ? 96 : 124}
        height={layout === 'sidebar' ? 22 : 28}
        priority
      />
      <div className="brand-header-copy">
        <div className="brand-name">{APP_NAME}</div>
        {subtitle ? <div className="brand-sub">{subtitle}</div> : null}
      </div>
    </div>
  );
}
