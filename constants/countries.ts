export interface Country {
  name: string;
  code: string;
  dialCode: string;
  flag: string;
  phoneLength?: number; // Optional: expected phone number length (without country code)
}

export const COUNTRIES: Country[] = [
  { name: 'United States', code: 'US', dialCode: '+1', flag: '🇺🇸', phoneLength: 10 },
  { name: 'Canada', code: 'CA', dialCode: '+1', flag: '🇨🇦', phoneLength: 10 },
  { name: 'United Kingdom', code: 'GB', dialCode: '+44', flag: '🇬🇧', phoneLength: 10 },
  { name: 'Australia', code: 'AU', dialCode: '+61', flag: '🇦🇺', phoneLength: 9 },
  { name: 'Germany', code: 'DE', dialCode: '+49', flag: '🇩🇪', phoneLength: 10 },
  { name: 'France', code: 'FR', dialCode: '+33', flag: '🇫🇷', phoneLength: 9 },
  { name: 'Spain', code: 'ES', dialCode: '+34', flag: '🇪🇸', phoneLength: 9 },
  { name: 'Italy', code: 'IT', dialCode: '+39', flag: '🇮🇹', phoneLength: 10 },
  { name: 'Netherlands', code: 'NL', dialCode: '+31', flag: '🇳🇱', phoneLength: 9 },
  { name: 'Belgium', code: 'BE', dialCode: '+32', flag: '🇧🇪', phoneLength: 9 },
  { name: 'Switzerland', code: 'CH', dialCode: '+41', flag: '🇨🇭', phoneLength: 9 },
  { name: 'Austria', code: 'AT', dialCode: '+43', flag: '🇦🇹', phoneLength: 10 },
  { name: 'Sweden', code: 'SE', dialCode: '+46', flag: '🇸🇪', phoneLength: 9 },
  { name: 'Norway', code: 'NO', dialCode: '+47', flag: '🇳🇴', phoneLength: 8 },
  { name: 'Denmark', code: 'DK', dialCode: '+45', flag: '🇩🇰', phoneLength: 8 },
  { name: 'Finland', code: 'FI', dialCode: '+358', flag: '🇫🇮', phoneLength: 9 },
  { name: 'Poland', code: 'PL', dialCode: '+48', flag: '🇵🇱', phoneLength: 9 },
  { name: 'Czech Republic', code: 'CZ', dialCode: '+420', flag: '🇨🇿', phoneLength: 9 },
  { name: 'Portugal', code: 'PT', dialCode: '+351', flag: '🇵🇹', phoneLength: 9 },
  { name: 'Greece', code: 'GR', dialCode: '+30', flag: '🇬🇷', phoneLength: 10 },
  { name: 'Ireland', code: 'IE', dialCode: '+353', flag: '🇮🇪', phoneLength: 9 },
  { name: 'Mexico', code: 'MX', dialCode: '+52', flag: '🇲🇽', phoneLength: 10 },
  { name: 'Brazil', code: 'BR', dialCode: '+55', flag: '🇧🇷', phoneLength: 11 },
  { name: 'Argentina', code: 'AR', dialCode: '+54', flag: '🇦🇷', phoneLength: 10 },
  { name: 'Chile', code: 'CL', dialCode: '+56', flag: '🇨🇱', phoneLength: 9 },
  { name: 'Colombia', code: 'CO', dialCode: '+57', flag: '🇨🇴', phoneLength: 10 },
  { name: 'Peru', code: 'PE', dialCode: '+51', flag: '🇵🇪', phoneLength: 9 },
  { name: 'Venezuela', code: 'VE', dialCode: '+58', flag: '🇻🇪', phoneLength: 10 },
  { name: 'Japan', code: 'JP', dialCode: '+81', flag: '🇯🇵', phoneLength: 10 },
  { name: 'China', code: 'CN', dialCode: '+86', flag: '🇨🇳', phoneLength: 11 },
  { name: 'South Korea', code: 'KR', dialCode: '+82', flag: '🇰🇷', phoneLength: 10 },
  { name: 'India', code: 'IN', dialCode: '+91', flag: '🇮🇳', phoneLength: 10 },
  { name: 'Pakistan', code: 'PK', dialCode: '+92', flag: '🇵🇰', phoneLength: 10 },
  { name: 'Bangladesh', code: 'BD', dialCode: '+880', flag: '🇧🇩', phoneLength: 10 },
  { name: 'Indonesia', code: 'ID', dialCode: '+62', flag: '🇮🇩', phoneLength: 10 },
  { name: 'Philippines', code: 'PH', dialCode: '+63', flag: '🇵🇭', phoneLength: 10 },
  { name: 'Vietnam', code: 'VN', dialCode: '+84', flag: '🇻🇳', phoneLength: 9 },
  { name: 'Thailand', code: 'TH', dialCode: '+66', flag: '🇹🇭', phoneLength: 9 },
  { name: 'Malaysia', code: 'MY', dialCode: '+60', flag: '🇲🇾', phoneLength: 9 },
  { name: 'Singapore', code: 'SG', dialCode: '+65', flag: '🇸🇬', phoneLength: 8 },
  { name: 'Hong Kong', code: 'HK', dialCode: '+852', flag: '🇭🇰', phoneLength: 8 },
  { name: 'Taiwan', code: 'TW', dialCode: '+886', flag: '🇹🇼', phoneLength: 9 },
  { name: 'New Zealand', code: 'NZ', dialCode: '+64', flag: '🇳🇿', phoneLength: 9 },
  { name: 'South Africa', code: 'ZA', dialCode: '+27', flag: '🇿🇦', phoneLength: 9 },
  { name: 'Egypt', code: 'EG', dialCode: '+20', flag: '🇪🇬', phoneLength: 10 },
  { name: 'Nigeria', code: 'NG', dialCode: '+234', flag: '🇳🇬', phoneLength: 10 },
  { name: 'Kenya', code: 'KE', dialCode: '+254', flag: '🇰🇪', phoneLength: 9 },
  { name: 'Israel', code: 'IL', dialCode: '+972', flag: '🇮🇱', phoneLength: 9 },
  { name: 'United Arab Emirates', code: 'AE', dialCode: '+971', flag: '🇦🇪', phoneLength: 9 },
  { name: 'Saudi Arabia', code: 'SA', dialCode: '+966', flag: '🇸🇦', phoneLength: 9 },
  { name: 'Turkey', code: 'TR', dialCode: '+90', flag: '🇹🇷', phoneLength: 10 },
  { name: 'Russia', code: 'RU', dialCode: '+7', flag: '🇷🇺', phoneLength: 10 },
  { name: 'Ukraine', code: 'UA', dialCode: '+380', flag: '🇺🇦', phoneLength: 9 },
];

export const DEFAULT_COUNTRY = COUNTRIES[0]; // United States

