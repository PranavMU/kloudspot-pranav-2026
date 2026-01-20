export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
}

export interface Zone {
  zoneId: string;
  name: string;
  securityLevel: 'high' | 'medium' | 'low';
}

export interface Site {
  siteId: string;
  name: string;
  city: string;
  country: string;
  timezone: string;
  zones: Zone[];
}
