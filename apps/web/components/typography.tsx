import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const typographyVariants = cva('', {
  variants: {
    variant: {
      h1: 'scroll-m-20 text-3xl font-semibold tracking-tight md:text-4xl',
      h2: 'scroll-m-20 text-2xl font-semibold tracking-tight',
      h3: 'scroll-m-20 text-xl font-semibold tracking-tight',
      bodyMedium: 'text-base leading-7',
      small: 'text-sm leading-5 text-muted-foreground',
      li: 'text-base leading-7',
      button: 'text-sm font-medium leading-none',
      link: 'text-sm font-medium text-primary underline-offset-4 hover:underline',
    },
  },
  defaultVariants: {
    variant: 'bodyMedium',
  },
});

const defaultElement: Record<NonNullable<VariantProps<typeof typographyVariants>['variant']>, keyof HTMLElementTagNameMap> =
  {
    h1: 'h1',
    h2: 'h2',
    h3: 'h3',
    bodyMedium: 'p',
    small: 'small',
    li: 'li',
    button: 'span',
    link: 'span',
  };

export type TypographyProps = HTMLAttributes<HTMLElement> &
  VariantProps<typeof typographyVariants> & {
    as?: keyof HTMLElementTagNameMap;
  };

export function Typography({
  variant = 'bodyMedium',
  as,
  className,
  children,
  ...props
}: TypographyProps) {
  const Comp = (as ?? defaultElement[variant ?? 'bodyMedium']) as 'p';
  return (
    <Comp className={cn(typographyVariants({ variant }), className)} {...props}>
      {children}
    </Comp>
  );
}
