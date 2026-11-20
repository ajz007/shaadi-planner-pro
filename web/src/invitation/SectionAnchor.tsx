import type { SectionKey } from './model'

// A zero-height marker before each section, so the studio's live preview can
// scroll to the section being edited. Templates render one before every section.
export function SectionAnchor({ section }: { section: SectionKey }) {
  return <span data-section={section} aria-hidden="true" style={{ display: 'block', height: 0, overflow: 'hidden' }} />
}
