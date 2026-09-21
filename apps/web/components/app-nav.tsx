'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Typography } from '@/components/typography';
import { cn } from '@/lib/utils';

const links = [
  { href: '/employees', label: 'Employees' },
  { href: '/analytics', label: 'Analytics' },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-border/80 bg-background/80 backdrop-blur-sm">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4 md:px-6">
        <Link href="/employees" className="group flex items-baseline gap-2">
          <Typography variant="h3" className="text-primary group-hover:opacity-90">
            ACME
          </Typography>
          <Typography variant="small" className="hidden sm:inline">
            Salary
          </Typography>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-md px-3 py-2 transition-colors',
                  active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/70',
                )}
              >
                <Typography variant="button">{link.label}</Typography>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
