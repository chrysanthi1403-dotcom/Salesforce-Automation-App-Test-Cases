import { NavLink, useLocation } from 'react-router-dom'
import {
  Building2,
  History as HistoryIcon,
  Home as HomeIcon,
  Plus,
  Settings as SettingsIcon
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
}

const NAV: NavItem[] = [
  { to: '/', label: 'Home', icon: HomeIcon },
  { to: '/new', label: 'New Run', icon: Plus },
  { to: '/orgs', label: 'Orgs', icon: Building2 },
  { to: '/history', label: 'History', icon: HistoryIcon },
  { to: '/settings', label: 'Settings', icon: SettingsIcon }
]

export function Shell({ children }: { children: React.ReactNode }): JSX.Element {
  const location = useLocation()
  return (
    <div className="flex h-full bg-background text-foreground">
      <aside className="w-60 flex-none border-r border-border glass">
        <div className="titlebar-drag h-14" />
        <div className="px-4 pb-4">
          <div className="no-drag mb-6 flex items-center gap-2 px-2">
            <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-primary/60" />
            <div className="leading-tight">
              <div className="text-sm font-semibold">UAT Runner</div>
              <div className="text-[11px] text-muted-foreground">Salesforce</div>
            </div>
          </div>
          <nav className="no-drag flex flex-col gap-1">
            {NAV.map((n) => {
              const active =
                n.to === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(n.to)
              const Icon = n.icon
              return (
                <NavLink
                  key={n.to}
                  to={n.to}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                    active
                      ? 'bg-accent text-accent-foreground font-medium'
                      : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {n.label}
                </NavLink>
              )
            })}
          </nav>
        </div>
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <div className="titlebar-drag h-14 border-b border-border glass" />
        <div className="no-drag flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-5xl px-8 py-8">{children}</div>
        </div>
      </main>
    </div>
  )
}
