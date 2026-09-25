'use client'

import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'

import { cn } from '@/lib/utils'
import { radixSwitchKnob, radixSwitchTrack } from './switch-style'

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#111113]/30 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        radixSwitchTrack,
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={radixSwitchKnob}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
