import type { HeatBand } from './types'

// Five-step sequential ramp (ColorBrewer YlOrRd, 5 classes; marked colour-blind safe).
// Order matters: cooler to hottest. The lightness steps also read in greyscale.
export const HEAT_COLORS: Record<HeatBand, string> = {
  cooler: '#ffffb2',
  average: '#fecc5c',
  warm: '#fd8d3c',
  hot: '#f03b20',
  hottest: '#bd0026',
}

export const HEAT_ORDER: HeatBand[] = ['cooler', 'average', 'warm', 'hot', 'hottest']
