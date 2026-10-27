'use client'

import * as React from 'react'
import * as SwitchPrimitive from '@radix-ui/react-switch'

import { cn } from '@/lib/utils'
import { hapticTap } from '@/lib/native-bridge'
import { radixSwitchKnob, radixSwitchTrack } from './switch-style'

/** Felt as it flips, as an iPhone's own switch is (round 25): a light knock, through lib/native-bridge. */
function Switch({
  className,
  onCheckedChange,
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
      onCheckedChange={(checked) => {
        hapticTap('light')
        onCheckedChange?.(checked)
      }}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={radixSwitchKnob}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
