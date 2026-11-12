import { useState } from 'react'

const groups = [
  { label: 'Wedding plan', pages: ['Functions & Events', 'Wedding Timeline', 'Schedule Board', 'Family Responsibilities', 'Places'] },
  { label: 'Guests & logistics', pages: ['Guest List', 'Guest RSVP', 'RSVP Follow-up', 'Accommodation', 'Transportation'] },
  { label: 'Budget & vendors', pages: ['Budget vs Actual', 'Vendor Comparison', 'Vendor Payments'] },
  { label: 'Final details', pages: ['Outfits & Jewellery', 'Gifts', 'Emergency Contacts'] },
  { label: 'Workspace', pages: ['Settings', 'Invitations', 'Import history'] },
]

export function WeddingNavigation({ section, href, canSee, overviewLabel }: {
  section?: string; href: (page?: string) => string; canSee: (page: string) => boolean; overviewLabel: string
}) {
  const [open, setOpen] = useState(false)
  return <aside className="planner-sidebar wedding-sidebar">
    <div className="planner-brand">
      <a href={href()} onClick={() => setOpen(false)}>Shaadi Planner <span>PRO</span></a>
      <button type="button" className="planner-menu" aria-expanded={open} aria-controls="wedding-sections"
        onClick={() => setOpen(value => !value)}>{open ? 'Close sections' : 'Sections'}</button>
    </div>
    <nav id="wedding-sections" className={'planner-nav' + (open ? ' is-open' : '')} aria-label="Wedding planning pages">
      <div className="nav-group">
        <a href={href()} aria-current={section === undefined ? 'page' : undefined} onClick={() => setOpen(false)}>{overviewLabel}</a>
      </div>
      {groups.map(group => {
        const pages = group.pages.filter(canSee)
        return pages.length > 0 && <div className="nav-group" key={group.label}>
          <p>{group.label}</p>
          {pages.map(page => <a href={href(page)} key={page} aria-current={section === page ? 'page' : undefined}
            onClick={() => setOpen(false)}>{page}</a>)}
        </div>
      })}
    </nav>
  </aside>
}
