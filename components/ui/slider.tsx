'use client'

import * as React from 'react'
import * as SliderPrimitive from '@radix-ui/react-slider'

import { cn } from '@/lib/utils'

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max],
  )

  // Generate tick positions (5 ticks)
  const ticks = [0, 25, 50, 75, 100]

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className="relative grow overflow-visible rounded-full data-[orientation=horizontal]:h-[4px] data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-[4px]"
        style={{ backgroundColor: '#f0f0f0' }}
      >
        {/* Tick markers */}
        {ticks.map((pos) => (
          <div
            key={pos}
            className="absolute w-[6px] h-[6px] rounded-full -translate-y-1/2 top-1/2"
            style={{
              left: `calc(${pos}% - 3px)`,
              backgroundColor: '#e0e0e0'
            }}
          />
        ))}
        {/* Hidden range - no colored fill for minimal look */}
        <SliderPrimitive.Range
          data-slot="slider-range"
          className="absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full"
          style={{ backgroundColor: 'transparent' }}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => (
        <SliderPrimitive.Thumb
          data-slot="slider-thumb"
          key={index}
          className="block size-[16px] shrink-0 rounded-full bg-white transition-shadow focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
          style={{
            boxShadow: '0 1px 3px rgba(0,0,0,0.15), 0 1px 2px rgba(0,0,0,0.1)',
            border: 'none'
          }}
        />
      ))}
    </SliderPrimitive.Root>
  )
}

export { Slider }
