import { ORISUNG_BRAND_LOGO } from './orisung-brand.data'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * The Orisung brand ships a single horizontal wordmark (mark + name) with no
 * standalone glyph. Render that artwork in the mark slot too, scaled to the
 * host-supplied size, so collapsed-sidebar and hero mark slots show the brand
 * instead of an empty slot.
 * @returns the Orisung brand logo image.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return (
    <img
      alt="Orisung"
      src={ORISUNG_BRAND_LOGO}
      style={{ height: `${size ?? 1.5}rem`, width: 'auto', display: 'block', objectFit: 'contain' }}
    />
  )
}

/**
 * Render the Orisung horizontal wordmark (mark + name) as a single artwork.
 * @returns the Orisung brand logo image.
 */
export function OfficialBrandName() {
  return (
    <img
      alt="Orisung"
      src={ORISUNG_BRAND_LOGO}
      style={{ height: '1.5rem', width: 'auto', display: 'block', objectFit: 'contain' }}
    />
  )
}
