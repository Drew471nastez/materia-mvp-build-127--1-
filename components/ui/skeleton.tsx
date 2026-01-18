import { cn } from '@/lib/utils'

interface SkeletonProps extends React.ComponentProps<'div'> {
  /** Theme preset for adapting skeleton colors */
  themePreset?: 'default' | 'air' | 'astrid' | 'bubble' | 'pink' | 'cream'
}

function Skeleton({ className, themePreset, style, ...props }: SkeletonProps) {
  // Determine skeleton colors based on theme preset
  const getSkeletonColors = () => {
    switch (themePreset) {
      case 'astrid':
        return { backgroundColor: '#1a1a1a' }
      case 'cream':
        return { backgroundColor: '#e8dfc9' }
      case 'bubble':
        return { backgroundColor: '#f5f3ff' }
      case 'pink':
        return { backgroundColor: '#fce7f3' }
      case 'air':
        return { backgroundColor: '#e5e7eb' }
      default:
        return undefined
    }
  }

  const themeColors = getSkeletonColors()

  return (
    <div
      data-slot="skeleton"
      className={cn('bg-accent animate-pulse rounded-md', className)}
      style={{ ...themeColors, ...style }}
      {...props}
    />
  )
}

export { Skeleton }
