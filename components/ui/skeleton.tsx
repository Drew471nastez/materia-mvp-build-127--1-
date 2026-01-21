import { cn } from '@/lib/utils'

interface SkeletonProps extends React.ComponentProps<'div'> {
  /** Theme preset for adapting skeleton colors */
  themePreset?: 'default' | 'air' | 'astrid' | 'bubble' | 'pink' | 'cream' | 'rose' | 'royal' | 'ocean' | 'sunset' | 'forest' | 'midnight'
}

function Skeleton({ className, themePreset, style, ...props }: SkeletonProps) {
  // Determine skeleton colors based on theme preset
  const getSkeletonColors = () => {
    switch (themePreset) {
      case 'astrid':
        return { backgroundColor: '#1a1a1a' }
      case 'midnight':
        return { backgroundColor: '#1e293b' }
      case 'cream':
        return { backgroundColor: '#e8dfc9' }
      case 'bubble':
        return { backgroundColor: '#f5f3ff' }
      case 'pink':
        return { backgroundColor: '#fce7f3' }
      case 'air':
        return { backgroundColor: '#e5e7eb' }
      case 'rose':
        return { backgroundColor: '#ffe4e6' }
      case 'royal':
        return { backgroundColor: '#ddd6fe' }
      case 'ocean':
        return { backgroundColor: '#cffafe' }
      case 'sunset':
        return { backgroundColor: '#ffedd5' }
      case 'forest':
        return { backgroundColor: '#dcfce7' }
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
