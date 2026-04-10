import { Box, Paper, Text } from '@mantine/core'
import { useComputedColorScheme } from '@mantine/core'
import { useEffect, useRef, useMemo } from 'react'

interface ChartRendererProps {
  chartConfig: Record<string, unknown>
  message?: string
  height?: number
}

export function ChartRenderer({ chartConfig, message, height = 400 }: ChartRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<unknown>(null)
  const colorScheme = useComputedColorScheme('light')

  useEffect(() => {
    let mounted = true

    const initChart = async () => {
      if (!containerRef.current) return

      // Dynamically import echarts
      const echarts = await import('echarts')

      if (!mounted || !containerRef.current) return

      // Dispose existing chart
      if (chartInstanceRef.current) {
        ;(chartInstanceRef.current as { dispose?: () => void })?.dispose?.()
      }

      // Create new chart instance
      const chart = echarts.init(
        containerRef.current,
        colorScheme === 'dark' ? 'dark' : 'light',
      )

      chartInstanceRef.current = chart

      // Apply chart config with theme-aware overrides
      const finalConfig = applyThemeOverrides(chartConfig, colorScheme)
      chart.setOption(finalConfig)

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        chart.resize()
      })
      resizeObserver.observe(containerRef.current)

      return () => {
        resizeObserver.disconnect()
      }
    }

    const cleanup = initChart()

    return () => {
      mounted = false
      cleanup.then((fn) => fn?.())
      if (chartInstanceRef.current) {
        ;(chartInstanceRef.current as { dispose?: () => void })?.dispose?.()
      }
    }
  }, [chartConfig, colorScheme])

  return (
    <Paper className="bg-chatbox-background-secondary p-4 rounded-lg">
      {message && (
        <Text size="sm" fw={500} mb="sm" c="chatbox-primary">
          {message}
        </Text>
      )}
      <Box
        ref={containerRef}
        style={{ width: '100%', height: `${height}px` }}
        className="rounded-lg overflow-hidden"
      />
    </Paper>
  )
}

function applyThemeOverrides(
  config: Record<string, unknown>,
  colorScheme: 'dark' | 'light' | 'auto',
): Record<string, unknown> {
  if (colorScheme === 'light') {
    const textColor = '#1a1a2e'
    const axisLineColor = '#ccc'

    return {
      ...config,
      backgroundColor: '#ffffff',
      textStyle: { color: '#333333' },
      title: {
        ...(config.title as Record<string, unknown>),
        textStyle: { color: textColor },
      },
      legend: {
        ...(config.legend as Record<string, unknown>),
        textStyle: { color: '#4a4a68' },
      },
      xAxis: Array.isArray(config.xAxis)
        ? config.xAxis.map((axis: Record<string, unknown>) => ({
            ...axis,
            axisLine: { lineStyle: { color: axisLineColor } },
            axisLabel: { color: '#666' },
          }))
        : {
            ...(config.xAxis as Record<string, unknown>),
            axisLine: { lineStyle: { color: axisLineColor } },
            axisLabel: { color: '#666' },
          },
      yAxis: Array.isArray(config.yAxis)
        ? config.yAxis.map((axis: Record<string, unknown>) => ({
            ...axis,
            axisLine: { lineStyle: { color: axisLineColor } },
            axisLabel: { color: '#666' },
            splitLine: { lineStyle: { color: '#eee' } },
          }))
        : {
            ...(config.yAxis as Record<string, unknown>),
            axisLine: { lineStyle: { color: axisLineColor } },
            axisLabel: { color: '#666' },
            splitLine: { lineStyle: { color: '#eee' } },
          },
    }
  }

  return config
}

export default ChartRenderer
