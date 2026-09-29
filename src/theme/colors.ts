/**
 * UyTa'mir color theme
 * Blue/White with accent colors
 */
export const UyTamirTheme = {
  // Primary blues
  primary: {
    dark: '#003D9E', // Deep UyTa'mir blue
    main: '#0052CC', // Primary blue
    light: '#3B7FFF', // Light blue
    lighter: '#E8F0FF', // Very light blue
  },

  // Secondary/Accent colors
  accent: {
    success: '#10B981', // Green
    warning: '#F59E0B', // Amber
    danger: '#EF4444', // Red
    info: '#06B6D4', // Cyan
  },

  // Neutral palette
  neutral: {
    white: '#FFFFFF',
    gray50: '#F9FAFB',
    gray100: '#F3F4F6',
    gray200: '#E5E7EB',
    gray300: '#D1D5DB',
    gray400: '#9CA3AF',
    gray500: '#6B7280',
    gray600: '#4B5563',
    gray700: '#374151',
    gray800: '#1F2937',
    gray900: '#111827',
  },

  // Material states
  states: {
    korobka: {
      label: 'Korobka',
      labelUz: 'Korobka (Qurilish bosqichi)',
      color: '#9CA3AF', // Gray - raw construction
      description: 'Devor va shiftni tuza va korobka holati',
    },
    suvoq: {
      label: 'Suvoq',
      labelUz: 'Suvoq (Qurutirish)',
      color: '#EC6B3E', // Orange - drying phase
      description: 'Xona quritilgan, lekin tugatilmagan',
    },
    shpaklovka: {
      label: 'Shpaklovka',
      labelUz: 'Shpaklovka (Tekislash)',
      color: '#D4A373', // Beige - plastering/finishing
      description: 'Devarlar shpaklovka bilan tekislangan',
    },
  },

  // Paint colors (for material selection)
  paintColors: {
    whites: [
      { name: 'Sof oq', hex: '#FFFFFF', id: 'white-pure' },
      { name: 'Qimog oq', hex: '#F8F8F8', id: 'white-off' },
      { name: 'Tosh rang', hex: '#F0EDE5', id: 'white-stone' },
    ],
    blues: [
      { name: 'Tiniq kok', hex: '#E8F0FF', id: 'blue-light' },
      { name: 'Orta kok', hex: '#7CB4FF', id: 'blue-medium' },
      { name: 'Chuqur kok', hex: '#0052CC', id: 'blue-dark' },
      { name: 'Navy', hex: '#003D9E', id: 'blue-navy' },
    ],
    grays: [
      { name: 'Sof kulrang', hex: '#F3F4F6', id: 'gray-light' },
      { name: 'Orta kulrang', hex: '#9CA3AF', id: 'gray-medium' },
      { name: 'Qorong\'i kulrang', hex: '#4B5563', id: 'gray-dark' },
    ],
    accent: [
      { name: 'Yashil', hex: '#10B981', id: 'green' },
      { name: 'Sariq', hex: '#F59E0B', id: 'yellow' },
      { name: 'Qora', hex: '#111827', id: 'black' },
    ],
  },
} as const
