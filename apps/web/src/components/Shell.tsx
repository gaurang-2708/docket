import { NavLink, Outlet } from 'react-router-dom';
import { signOut, useSession } from '../api';

const link = ({ isActive }: { isActive: boolean }) =>
  `relative flex min-h-[44px] items-center whitespace-nowrap px-1 text-sm font-medium transition-colors duration-200 lg:px-3 ${
    isActive
      ? 'text-ivory after:absolute after:inset-x-1 after:bottom-0 after:h-px after:bg-gold lg:after:inset-x-auto lg:after:inset-y-2 lg:after:left-0 lg:after:h-auto lg:after:w-px'
      : 'text-muted-dark hover:text-ivory'
  }`;

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-serif text-xl font-semibold tracking-tight ${className || 'text-ink'}`}>
      Docket<span className="text-gold">.</span>
    </span>
  );
}

export default function Shell() {
  const s = useSession()!;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:bg-paper focus:px-3 focus:py-2">Skip to content</a>
      <header className="border-b border-gold/30 bg-obsidian text-ivory lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-b-0 lg:border-r">
        <div className="flex flex-wrap items-center gap-x-6 px-4 pt-3 sm:px-6 lg:block lg:px-6 lg:pt-8">
          <NavLink to="/upload" aria-label="Docket home" className="inline-block"><Wordmark className="text-ivory lg:text-2xl" /></NavLink>
          <p className="eyebrow hidden !text-muted-dark lg:mt-1 lg:block">Document review</p>
          <div className="ml-auto flex items-center gap-3 text-sm lg:hidden">
            <span className="text-muted-dark"><span className="font-medium text-ivory">{s.user.name}</span></span>
            <button className="min-h-[44px] text-sm font-medium text-gold underline decoration-gold/40 underline-offset-4" onClick={signOut}>Sign out</button>
          </div>
        </div>
        <div aria-hidden className="mx-6 mt-8 hidden border-t border-gold/30 lg:block" />
        <nav aria-label="Main" className="flex gap-5 overflow-x-auto px-4 sm:px-6 lg:mt-6 lg:flex-col lg:gap-1 lg:px-3">
          <NavLink to="/upload" className={link}>Upload</NavLink>
          <NavLink to="/documents" className={link}>Documents</NavLink>
          {s.user.role === 'ADMIN' && <NavLink to="/admin/health" className={link}>System health</NavLink>}
        </nav>
        <div className="mt-auto hidden border-t border-stone px-6 py-6 lg:block">
          <p className="text-sm font-medium text-ivory">{s.user.name}</p>
          <p className="eyebrow mt-0.5 !text-muted-dark">{s.user.role === 'ADMIN' ? 'Admin' : 'Reviewer'}</p>
          <button className="mt-3 min-h-[44px] text-sm font-medium text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold" onClick={signOut}>Sign out</button>
        </div>
      </header>
      <main id="main" className="min-w-0"><Outlet /></main>
    </div>
  );
}
